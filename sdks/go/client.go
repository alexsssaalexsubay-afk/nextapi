package nextapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.nextapi.top"

type Client struct {
	APIKey  string
	BaseURL string
	HTTP    *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey:  apiKey,
		BaseURL: defaultBaseURL,
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

type GenerateRequest struct {
	Prompt          string `json:"prompt"`
	Model           string `json:"model,omitempty"`
	ImageURL        string `json:"image_url,omitempty"`
	DurationSeconds int    `json:"duration_seconds,omitempty"`
	Resolution      string `json:"resolution,omitempty"`
	Mode            string `json:"mode,omitempty"`
}

type GenerateResponse struct {
	ID                 string `json:"id"`
	Status             string `json:"status"`
	EstimatedCostCents int    `json:"estimated_cost_cents"`
}

type Job struct {
	ID     string          `json:"id"`
	Status string          `json:"status"`
	Output json.RawMessage `json:"output,omitempty"`
	Error  *APIErrorBody   `json:"error,omitempty"`
}

type APIErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Error struct {
	Code       string
	Message    string
	StatusCode int
}

func (e *Error) Error() string {
	return fmt.Sprintf("nextapi: [%s] %s", e.Code, e.Message)
}

var terminalStatuses = map[string]struct{}{
	"succeeded": {}, "failed": {}, "canceled": {}, "cancelled": {},
	"completed": {}, "error": {},
}

func (c *Client) baseURL() string {
	if c.BaseURL == "" {
		return defaultBaseURL
	}
	return strings.TrimRight(c.BaseURL, "/")
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL()+path, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		var env struct {
			Error *APIErrorBody `json:"error"`
		}
		_ = json.Unmarshal(data, &env)
		code := fmt.Sprintf("http_%d", resp.StatusCode)
		msg := string(data)
		if env.Error != nil {
			if env.Error.Code != "" {
				code = env.Error.Code
			}
			if env.Error.Message != "" {
				msg = env.Error.Message
			}
		}
		return &Error{Code: code, Message: msg, StatusCode: resp.StatusCode}
	}

	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	if req.Model == "" {
		req.Model = "seedance-v2-pro"
	}
	if req.DurationSeconds == 0 {
		req.DurationSeconds = 5
	}
	if req.Resolution == "" {
		req.Resolution = "1080p"
	}
	if req.Mode == "" {
		req.Mode = "normal"
	}
	input := req
	input.Model = ""
	payload := struct {
		Model string          `json:"model"`
		Input GenerateRequest `json:"input"`
	}{
		Model: req.Model,
		Input: input,
	}
	var out GenerateResponse
	if err := c.do(ctx, http.MethodPost, "/v1/videos", payload, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetVideo(ctx context.Context, videoID string) (*Job, error) {
	var out Job
	if err := c.do(ctx, http.MethodGet, "/v1/videos/"+videoID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) GetJob(ctx context.Context, jobID string) (*Job, error) {
	return c.GetVideo(ctx, jobID)
}

func (c *Client) Wait(ctx context.Context, jobID string, timeout, pollInterval time.Duration) (*Job, error) {
	if timeout == 0 {
		timeout = 10 * time.Minute
	}
	if pollInterval == 0 {
		pollInterval = 5 * time.Second
	}
	deadline := time.Now().Add(timeout)
	for {
		job, err := c.GetVideo(ctx, jobID)
		if err != nil {
			return nil, err
		}
		if _, ok := terminalStatuses[strings.ToLower(job.Status)]; ok {
			return job, nil
		}
		if time.Now().After(deadline) {
			return nil, &Error{Code: "timeout", Message: fmt.Sprintf("job %s did not finish within %s", jobID, timeout)}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
	}
}
