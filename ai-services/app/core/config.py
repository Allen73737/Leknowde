from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration. No secret is ever hard-coded."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str = "leknowde-intelligence"
    environment: str = "development"
    log_level: str = "info"
    internal_token: str = "dev-internal-token"
    allowed_origins: str = "http://localhost:3000,http://localhost:8080"

    # Model gateway ---------------------------------------------------------
    litellm_base_url: str = ""
    litellm_api_key: str = ""
    litellm_model: str = ""

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    llm_provider_order: str = "litellm,groq,gemini"
    llm_timeout_seconds: float = 90.0
    llm_max_retries: int = 2
    llm_temperature: float = 0.15
    llm_max_output_tokens: int = 1800
    context_char_budget: int = 48_000

    # Embeddings ------------------------------------------------------------
    embedding_provider: Literal["lexical", "gemini", "litellm"] = "lexical"
    embedding_model: str = "lexical-hash-v1"
    embedding_dim: int = 256

    @property
    def provider_order(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_order.split(",") if p.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
