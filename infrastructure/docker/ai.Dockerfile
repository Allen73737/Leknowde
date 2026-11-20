# syntax=docker/dockerfile:1
# LeKnowde intelligence service — FastAPI + Tree-sitter.
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY ai-services/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY ai-services/app ./app
EXPOSE 8000
# One worker is intentional: the lexical embedder and parser are CPU-bound and
# state-free; scale horizontally rather than threading inside one process.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
