# syntax=docker/dockerfile:1
# LeKnowde API — Go + Gin.
# modernc.org/sqlite is pure Go, so CGO can stay disabled for a static binary.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/leknowde-api ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/leknowde-api /usr/local/bin/leknowde-api
ENV PORT=8080 \
    DATABASE_URL=file:/data/leknowde.db
VOLUME ["/data"]
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/leknowde-api"]
