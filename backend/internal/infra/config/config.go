package config

import "os"

type Config struct {
	ServerAddr  string
	DatabaseURL string
	RedisAddr   string
	Env         string
}

func Load() Config {
	return Config{
		ServerAddr:  getenv("SERVER_ADDR", ":8080"),
		DatabaseURL: getenv("DATABASE_URL", "postgres://nextapi:nextapi@localhost:5432/nextapi?sslmode=disable"),
		RedisAddr:   getenv("REDIS_ADDR", "127.0.0.1:6379"),
		Env:         getenv("APP_ENV", "dev"),
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
