"""Model gateway.

Providers are tried in a configurable order. LiteLLM is preferred when a proxy
is configured, then Groq, then Gemini. Every call is timed, retried on
transient failures and reported with token usage so the platform can show real
consumption instead of estimates.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import Settings, get_settings


class LLMUnavailable(RuntimeError):
    """Raised when no provider is configured or every attempt failed."""


@dataclass
class LLMResult:
    text: str
    model: str
    provider: str
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    attempts: list[str] = field(default_factory=list)


@dataclass
class ProviderConfig:
    name: str
    kind: str
    base_url: str
    api_key: str
    model: str


def resolve_providers(settings: Settings) -> list[ProviderConfig]:
    providers: list[ProviderConfig] = []
    for name in settings.provider_order:
        if name == "litellm" and settings.litellm_base_url:
            providers.append(
                ProviderConfig(
                    name="litellm",
                    kind="openai",
                    base_url=settings.litellm_base_url.rstrip("/"),
                    api_key=settings.litellm_api_key,
                    model=settings.litellm_model or "groq/llama-3.3-70b-versatile",
                )
            )
        elif name == "groq" and settings.groq_api_key:
            providers.append(
                ProviderConfig(
                    name="groq",
                    kind="openai",
                    base_url=settings.groq_base_url.rstrip("/"),
                    api_key=settings.groq_api_key,
                    model=settings.groq_model,
                )
            )
        elif name == "gemini" and settings.gemini_api_key:
            providers.append(
                ProviderConfig(
                    name="gemini",
                    kind="gemini",
                    base_url=settings.gemini_base_url.rstrip("/"),
                    api_key=settings.gemini_api_key,
                    model=settings.gemini_model,
                )
            )
    return providers


def gateway_status() -> dict[str, object]:
    settings = get_settings()
    providers = resolve_providers(settings)
    if not providers:
        return {
            "configured": False,
            "provider": "",
            "model": "",
            "gateway": "none",
            "reason": "No LLM credentials configured. Set GROQ_API_KEY, GEMINI_API_KEY or LITELLM_BASE_URL. Retrieval, parsing, graphs and impact analysis still work.",
        }
    first = providers[0]
    return {
        "configured": True,
        "provider": first.name,
        "model": first.model,
        "gateway": "litellm" if first.name == "litellm" else "direct",
        "reason": f"{len(providers)} provider(s) available; fallback order: {', '.join(p.name for p in providers)}.",
    }


async def chat(
    system: str,
    messages: list[dict[str, str]],
    *,
    json_mode: bool = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> LLMResult:
    settings = get_settings()
    providers = resolve_providers(settings)
    if not providers:
        raise LLMUnavailable(
            "No LLM provider is configured. Set GROQ_API_KEY, GEMINI_API_KEY or LITELLM_BASE_URL in ai-services/.env."
        )

    attempts: list[str] = []
    started = time.perf_counter()
    for provider in providers:
        for attempt in range(settings.llm_max_retries + 1):
            try:
                result = await _call_provider(
                    provider,
                    system,
                    messages,
                    json_mode=json_mode,
                    temperature=settings.llm_temperature if temperature is None else temperature,
                    max_tokens=max_tokens or settings.llm_max_output_tokens,
                    timeout=settings.llm_timeout_seconds,
                )
                result.latency_ms = int((time.perf_counter() - started) * 1000)
                result.attempts = attempts
                return result
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                attempts.append(f"{provider.name}: HTTP {status}")
                if status in {401, 403, 400}:
                    break  # configuration problem, move to the next provider
                if status == 429 or status >= 500:
                    await asyncio.sleep(0.8 * (attempt + 1))
                    continue
                break
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                attempts.append(f"{provider.name}: {type(exc).__name__}")
                await asyncio.sleep(0.5 * (attempt + 1))
            except Exception as exc:  # pragma: no cover - defensive
                attempts.append(f"{provider.name}: {exc}")
                break
    raise LLMUnavailable("All configured LLM providers failed: " + "; ".join(attempts))


async def _call_provider(
    provider: ProviderConfig,
    system: str,
    messages: list[dict[str, str]],
    *,
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> LLMResult:
    if provider.kind == "gemini":
        return await _call_gemini(provider, system, messages, json_mode, temperature, max_tokens, timeout)
    return await _call_openai_compatible(provider, system, messages, json_mode, temperature, max_tokens, timeout)


async def _call_openai_compatible(
    provider: ProviderConfig,
    system: str,
    messages: list[dict[str, str]],
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> LLMResult:
    payload: dict[str, object] = {
        "model": provider.model,
        "messages": [{"role": "system", "content": system}, *messages],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Content-Type": "application/json"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{provider.base_url}/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    choices = data.get("choices") or []
    text = ""
    if choices:
        text = (choices[0].get("message") or {}).get("content") or ""
    usage = data.get("usage") or {}
    return LLMResult(
        text=text.strip(),
        model=str(data.get("model") or provider.model),
        provider=provider.name,
        tokens_in=int(usage.get("prompt_tokens") or 0),
        tokens_out=int(usage.get("completion_tokens") or 0),
    )


async def _call_gemini(
    provider: ProviderConfig,
    system: str,
    messages: list[dict[str, str]],
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> LLMResult:
    contents = []
    for message in messages:
        role = "model" if message["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": message["content"]}]})
    payload: dict[str, object] = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if json_mode:
        payload["generationConfig"] = {**payload["generationConfig"], "responseMimeType": "application/json"}  # type: ignore[dict-item]

    url = f"{provider.base_url}/models/{provider.model}:generateContent"
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": provider.api_key},
        )
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates") or []
    text = ""
    if candidates:
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "\n".join(part.get("text", "") for part in parts)
    usage = data.get("usageMetadata") or {}
    return LLMResult(
        text=text.strip(),
        model=str(provider.model),
        provider=provider.name,
        tokens_in=int(usage.get("promptTokenCount") or 0),
        tokens_out=int(usage.get("candidatesTokenCount") or 0),
    )
