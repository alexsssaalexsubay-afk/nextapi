package uptoken

import (
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider/seedance"
)

// Estimate reuses the Seedance token/credit model. The managed relay is a thin layer on
// top of the same family of video models, so tokens-per-second and the
// resolution scaling are identical to the Ark direct path. If upstream
// billing ever diverges, fork this into a standalone table — the rest of the
// gateway only cares about (tokens, credits) coming back from a Provider.
func Estimate(req provider.GenerationRequest) (int64, int64) {
	return seedance.Estimate(req)
}
