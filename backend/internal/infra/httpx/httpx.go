package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	HeaderRequestID = "X-Request-Id"
	CtxRequestID    = "nextapi.request_id"
)

// RequestID middleware assigns a UUID per request, puts it in context and
// sets response header.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := c.GetHeader(HeaderRequestID)
		if rid == "" {
			rid = "req_" + uuid.NewString()
		}
		c.Set(CtxRequestID, rid)
		c.Writer.Header().Set(HeaderRequestID, rid)
		c.Next()
	}
}

func RIDFrom(c *gin.Context) string {
	v, _ := c.Get(CtxRequestID)
	s, _ := v.(string)
	return s
}

// Error renders the canonical error envelope.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Param   string `json:"param,omitempty"`
	DocURL  string `json:"doc_url,omitempty"`
}

func WriteError(c *gin.Context, status int, code, message string, opts ...func(*APIError)) {
	e := APIError{Code: code, Message: message}
	for _, o := range opts {
		o(&e)
	}
	env := gin.H{
		"error": gin.H{
			"code":       e.Code,
			"message":    e.Message,
			"request_id": RIDFrom(c),
		},
	}
	if e.Param != "" {
		env["error"].(gin.H)["param"] = e.Param
	}
	if e.DocURL != "" {
		env["error"].(gin.H)["doc_url"] = e.DocURL
	}
	c.AbortWithStatusJSON(status, env)
}

// Convenience:
func BadRequest(c *gin.Context, code, msg string) {
	WriteError(c, http.StatusBadRequest, code, msg)
}
func Unauthorized(c *gin.Context, code, msg string) {
	WriteError(c, http.StatusUnauthorized, code, msg)
}
func PaymentRequired(c *gin.Context, code, msg string) {
	WriteError(c, http.StatusPaymentRequired, code, msg)
}
func Conflict(c *gin.Context, code, msg string) {
	WriteError(c, http.StatusConflict, code, msg)
}
func TooManyRequests(c *gin.Context, code, msg string) {
	WriteError(c, http.StatusTooManyRequests, code, msg)
}
func Internal(c *gin.Context, msg string) {
	WriteError(c, http.StatusInternalServerError, "internal_error", msg)
}
func NotFound(c *gin.Context, msg string) {
	WriteError(c, http.StatusNotFound, "not_found", msg)
}
