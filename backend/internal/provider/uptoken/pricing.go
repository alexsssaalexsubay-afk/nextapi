package uptoken

import (
	"github.com/sanidg/nextapi/backend/internal/provider"
	"github.com/sanidg/nextapi/backend/internal/provider/seedance"
)

// Estimate reuses the Seedance token/credit model. UpToken is a thin relay on
// top of the same family of video models, so tokens-per-second and the
// resolution scaling are identical to the Ark direct path. If UpToken's
// billing ever diverges, fork this into a standalone table — the rest of the
// gateway only cares about (tokens, credits) coming back from a Provider.
func Estimate(req provider.GenerationRequest) (int64, int64) {
	return seedance.Estimate(req)
}
