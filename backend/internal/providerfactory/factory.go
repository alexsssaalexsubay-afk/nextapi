package providerfactory

import (
	"fmt"
	"os"

	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/provider/seedance"
	"github.com/sanidg/nextapi/backend/internal/provider/uptoken"
)

// Default returns the configured upstream video provider.
//
// PROVIDER_MODE selects which backend handles POST /v1/videos:
//   - "mock"    — in-memory Seedance mock (default; deterministic, no network)
//   - "live"    — Volcengine Ark direct (requires VOLC_API_KEY)
//   - "uptoken" — UpToken relay at https://uptoken.cc (requires UPTOKEN_API_KEY)
//
// Both live backends implement the same Provider interface, so handlers,
// billing reconciliation, and job polling are identical across them.
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
	case "uptoken":
		return uptoken.NewLive()
	default:
		return nil, fmt.Errorf("unknown PROVIDER_MODE=%q", mode)
	}
}
