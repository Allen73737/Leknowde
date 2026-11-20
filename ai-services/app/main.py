"""LeKnowde intelligence service entry point."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.routes import router
from app.core.config import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("leknowde")

app = FastAPI(
    title="LeKnowde Intelligence Service",
    description=(
        "Repository-aware parsing, retrieval reasoning, impact narration and "
        "documentation generation for the LeKnowde platform. Internal service: "
        "all analysis endpoints require the X-Internal-Token header."
    ),
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Token"],
)

app.include_router(router)


@app.on_event("startup")
async def on_startup() -> None:
    from app.llm.gateway import gateway_status

    logger.info("intelligence service ready llm=%s", gateway_status())
