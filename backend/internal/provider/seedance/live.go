package seedance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/sanidg/nextapi/backend/internal/provider"
)

const arkBase = "https://ark.cn-beijing.volces.com/api/v3"

type LiveProvider struct {
	apiKey string
	http   *http.Client
	model  string
}

func NewLive() (*LiveProvider, error) {
	k := os.Getenv("VOLC_API_KEY")
	if k == "" {
		return nil, fmt.Errorf("VOLC_API_KEY required for live provider")
	}
	model := os.Getenv("SEEDANCE_MODEL")
	if model == "" {
		model = "seedance-v2-pro"
	}
	return &LiveProvider{
		apiKey: k,
		http:   &http.Client{Timeout: 30 * time.Second},
		model:  model,
	}, nil
}

func (p *LiveProvider) Name() string { return "seedance" }

func (p *LiveProvider) EstimateCost(req provider.GenerationRequest) (int64, int64, error) {
	t, c := Estimate(req)
	return t, c, nil
}

type arkCreateReq struct {
	Model   string     `json:"model"`
	Content []arkPart  `json:"content"`
}
type arkPart struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}
type arkCreateResp struct {
	ID    string `json:"id"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *LiveProvider) GenerateVideo(ctx context.Context, req provider.GenerationRequest) (string, error) {
	parts := []arkPart{{Type: "text", Text: req.Prompt}}
	if req.ImageURL != nil && *req.ImageURL != "" {
		parts = append(parts, arkPart{Type: "image_url", ImageURL: *req.ImageURL})
	}
	body, _ := json.Marshal(arkCreateReq{Model: p.model, Content: parts})

	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		arkBase+"/contents/generations/tasks", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.http.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("seedance create: %s", string(raw))
	}
	var out arkCreateResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", fmt.Errorf("%s: %s", out.Error.Code, out.Error.Message)
	}
	return out.ID, nil
}

type arkStatusResp struct {
	ID      string `json:"id"`
	Status  string `json:"status"` // queued|running|succeeded|failed
	Content *struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
	Usage *struct {
		TotalTokens int64 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *LiveProvider) GetJobStatus(ctx context.Context, providerJobID string) (*provider.JobStatus, error) {
	httpReq, _ := http.NewRequestWithContext(ctx, "GET",
		arkBase+"/contents/generations/tasks/"+providerJobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("seedance status: %s", string(raw))
	}
	var out arkStatusResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	js := &provider.JobStatus{Status: out.Status}
	if out.Content != nil && out.Content.VideoURL != "" {
		js.VideoURL = &out.Content.VideoURL
	}
	if out.Usage != nil {
		t := out.Usage.TotalTokens
		js.ActualTokensUsed = &t
	}
	if out.Error != nil {
		js.ErrorCode = &out.Error.Code
		js.ErrorMessage = &out.Error.Message
	}
	return js, nil
}

func (p *LiveProvider) IsHealthy(ctx context.Context) bool { return p.apiKey != "" }
