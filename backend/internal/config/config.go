package config

import (
	"os"
	"strconv"
	"strings"
)

// Config is the complete runtime configuration for the LeKnowde API.
// Every value is environment driven so the same binary runs locally and in
// container platforms without code changes.
type Config struct {
	Env            string
	Port           string
	DatabaseURL    string
	JWTSecret      string
	EncryptionKey  string
	AllowedOrigins []string
	FrontendURL    string
	PublicAPIURL   string

	AIServiceURL   string
	AIInternalToken string
	AITimeoutSec   int

	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURL  string

	DevMode         bool
	MaxFilesPerRepo int
	MaxFileBytes    int64
	WorkerCount     int
	RateLimitPerMin int
	LogLevel        string
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok {
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return fallback
}

func Load() Config {
	envName := env("LEKNOWDE_ENV", "development")
	cfg := Config{
		Env:         envName,
		Port:        env("PORT", "8080"),
		DatabaseURL: env("DATABASE_URL", "file:./data/leknowde.db"),
		JWTSecret:   env("JWT_SECRET", "dev-only-insecure-jwt-secret-change-me-please-32"),
		EncryptionKey: env("ENCRYPTION_KEY", ""),
		AllowedOrigins: strings.Split(env("ALLOWED_ORIGINS", "http://localhost:3000"), ","),
		FrontendURL:  env("FRONTEND_URL", "http://localhost:3000"),
		PublicAPIURL: env("PUBLIC_API_URL", "http://localhost:8080"),

		AIServiceURL:    env("AI_SERVICE_URL", "http://localhost:8000"),
		AIInternalToken: env("AI_INTERNAL_TOKEN", "dev-internal-token"),
		AITimeoutSec:    envInt("AI_TIMEOUT_SECONDS", 120),

		GitHubClientID:     env("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: env("GITHUB_CLIENT_SECRET", ""),
		GitHubRedirectURL:  env("GITHUB_REDIRECT_URL", "http://localhost:8080/api/v1/integrations/github/callback"),

		DevMode:         envBool("LEKNOWDE_DEV_MODE", envName != "production"),
		MaxFilesPerRepo: envInt("MAX_FILES_PER_REPO", 4000),
		MaxFileBytes:    int64(envInt("MAX_FILE_BYTES", 512*1024)),
		WorkerCount:     envInt("INDEX_WORKER_COUNT", 2),
		RateLimitPerMin: envInt("RATE_LIMIT_PER_MINUTE", 240),
		LogLevel:        env("LOG_LEVEL", "info"),
	}
	if cfg.JWTSecret == "dev-only-insecure-jwt-secret-change-me-please-32" && cfg.Env == "production" {
		panic("JWT_SECRET must be set in production")
	}
	for i := range cfg.AllowedOrigins {
		cfg.AllowedOrigins[i] = strings.TrimSpace(cfg.AllowedOrigins[i])
	}
	return cfg
}

// IsPostgres reports whether the configured database URL targets PostgreSQL.
func (c Config) IsPostgres() bool {
	u := strings.ToLower(c.DatabaseURL)
	return strings.HasPrefix(u, "postgres://") || strings.HasPrefix(u, "postgresql://")
}
