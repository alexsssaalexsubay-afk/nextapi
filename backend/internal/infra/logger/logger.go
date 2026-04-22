package logger

import "go.uber.org/zap"

func New(env string) (*zap.Logger, error) {
	if env == "dev" {
		return zap.NewDevelopment()
	}
	return zap.NewProduction()
}
