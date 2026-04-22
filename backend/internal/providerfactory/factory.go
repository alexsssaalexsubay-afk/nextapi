package providerfactory

import (
	"fmt"
	"os"

	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/provider/seedance"
)

func Default() (provider.Provider, error) {
	mode := os.Getenv("PROVIDER_MODE")
	if mode == "" {
		mode = "mock"
	}
	switch mode {
	case "mock":
		return seedance.NewMock(), nil
	case "live":
		return seedance.NewLive()
	default:
		return nil, fmt.Errorf("unknown PROVIDER_MODE=%q", mode)
	}
}
