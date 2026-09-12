package config

import (
	"os"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	RedisAddr string
	RedisPass string
	RedisDB   int

	JWTSecret string
	Port      string

	QuoteProxy string
}

func Load() *Config {
	return &Config{
		DBHost:     envOr("DB_HOST", "127.0.0.1"),
		DBPort:     envOr("DB_PORT", "3306"),
		DBUser:     envOr("DB_USER", "root"),
		DBPassword: envOr("DB_PASSWORD", "123456"),
		DBName:     envOr("DB_NAME", "blog"),

		RedisAddr: envOr("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPass: envOr("REDIS_PASS", ""),
		RedisDB:   0,

		JWTSecret: envOr("JWT_SECRET", "change-me-in-production"),
		Port:      envOr("PORT", "8080"),

		QuoteProxy: envOr("QUOTE_PROXY", "http://127.0.0.1:7890"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
