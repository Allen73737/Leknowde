package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/leknowde/platform/backend/internal/aiclient"
	"github.com/leknowde/platform/backend/internal/auth"
	"github.com/leknowde/platform/backend/internal/config"
	"github.com/leknowde/platform/backend/internal/httpapi"
	"github.com/leknowde/platform/backend/internal/index"
	"github.com/leknowde/platform/backend/internal/platform"
	"github.com/leknowde/platform/backend/internal/secure"
	"github.com/leknowde/platform/backend/internal/store"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: levelFor(cfg.LogLevel)}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := platform.Open(cfg)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := platform.Migrate(ctx, db); err != nil {
		logger.Error("migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info("database ready", "driver", db.Dialect, "url", maskedURL(cfg.DatabaseURL))

	cipher, err := secure.NewCipher(cfg.EncryptionKey, cfg.JWTSecret)
	if err != nil {
		logger.Error("encryption initialisation failed", "error", err)
		os.Exit(1)
	}
	st := store.New(db, cipher)
	mgr := auth.NewManager(cfg.JWTSecret)
	ai := aiclient.New(cfg.AIServiceURL, cfg.AIInternalToken, time.Duration(cfg.AITimeoutSec)*time.Second)
	pipeline := index.NewPipeline(st, ai, cfg, logger)
	pipeline.StartWorkers(ctx)

	server := httpapi.NewServer(cfg, st, mgr, ai, pipeline, logger)
	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      180 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		logger.Info("LeKnowde API listening", "addr", httpServer.Addr, "env", cfg.Env, "workers", cfg.WorkerCount)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func levelFor(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func maskedURL(url string) string {
	if len(url) < 24 {
		return url
	}
	return url[:12] + "…"
}
