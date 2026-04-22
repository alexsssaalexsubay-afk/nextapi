package gateway

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sanidg/nextapi/backend/internal/auth"
	"github.com/sanidg/nextapi/backend/internal/throughput"
)

type ThroughputHandlers struct {
	Svc *throughput.Service
}

// GetThroughput returns the org's throughput config + current in-flight count.
func (h *ThroughputHandlers) GetThroughput(c *gin.Context) {
	org := auth.OrgFrom(c)
	if org == nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	cfg, inFlight, err := h.Svc.Get(c.Request.Context(), org.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"reserved_concurrency": cfg.ReservedConcurrency,
		"burst_concurrency":    cfg.BurstConcurrency,
		"priority_lane":        cfg.PriorityLane,
		"rpm_limit":            cfg.RPMLimit,
		"current_in_flight":    inFlight,
	})
}

// AdminUpsertThroughput lets operators configure per-org throughput.
func (h *ThroughputHandlers) AdminUpsertThroughput(c *gin.Context) {
	orgID := c.Param("id")
	var body struct {
		ReservedConcurrency *int    `json:"reserved_concurrency"`
		BurstConcurrency    *int    `json:"burst_concurrency"`
		PriorityLane        *string `json:"priority_lane"`
		RPMLimit            *int    `json:"rpm_limit"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "invalid_request", "message": err.Error()}})
		return
	}
	cfg, err := h.Svc.Upsert(c.Request.Context(), orgID, throughput.UpsertInput{
		ReservedConcurrency: body.ReservedConcurrency,
		BurstConcurrency:    body.BurstConcurrency,
		PriorityLane:        body.PriorityLane,
		RPMLimit:            body.RPMLimit,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "internal_error", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"reserved_concurrency": cfg.ReservedConcurrency,
		"burst_concurrency":    cfg.BurstConcurrency,
		"priority_lane":        cfg.PriorityLane,
		"rpm_limit":            cfg.RPMLimit,
	})
}
