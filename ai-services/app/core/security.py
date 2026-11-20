from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Service-to-service authentication for every analysis endpoint.

    The AI service is intended to be reachable only by the Go API. It is not a
    public surface, and repository content must never be fetched directly from
    the browser.
    """
    settings = get_settings()
    if not x_internal_token or x_internal_token != settings.internal_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal service token.",
        )
