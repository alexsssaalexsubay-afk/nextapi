package uptoken

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

type AssetClient struct {
	apiKey string
	base   string
	http   *http.Client
}

type Asset struct {
	VirtualID        string `json:"virtual_id"`
	AssetURL         string `json:"asset_url"`
	URL              string `json:"url"`
	Status           string `json:"status"`
	ProcessingStatus string `json:"processing_status"`
	Filename         string `json:"filename"`
	SizeBytes        int64  `json:"size_bytes"`
	RejectionReason  string `json:"rejection_reason"`
}

type AssetError struct {
	StatusCode int
	Code       string
	Message    string
	Type       string
}

func (e *AssetError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return fmt.Sprintf("uptoken asset http %d", e.StatusCode)
}

func NewAssetClientFromEnv() (*AssetClient, error) {
	k := getenvAny("SEEDANCE_RELAY_API_KEY", "UPTOKEN_API_KEY")
	if k == "" {
		return nil, fmt.Errorf("UPTOKEN_API_KEY required for uptoken assets")
	}
	base := getenvAny("SEEDANCE_RELAY_BASE_URL", "UPTOKEN_BASE_URL")
	if base == "" {
		base = uptokenBase
	}
	return &AssetClient{
		apiKey: k,
		base:   strings.TrimRight(base, "/"),
		http:   &http.Client{Timeout: 20 * time.Second},
	}, nil
}

func (c *AssetClient) UploadAsset(ctx context.Context, filename string, contentType string, data []byte) (*Asset, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("uptoken asset form: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return nil, fmt.Errorf("uptoken asset write: %w", err)
	}
	_ = writer.WriteField("content_type", contentType)
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("uptoken asset close: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/assets", &body)
	if err != nil {
		return nil, fmt.Errorf("uptoken asset request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return c.doAsset(req)
}

func (c *AssetClient) GetAsset(ctx context.Context, virtualID string) (*Asset, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/assets/"+virtualID, nil)
	if err != nil {
		return nil, fmt.Errorf("uptoken asset request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	return c.doAsset(req)
}

func (c *AssetClient) WaitAssetActive(ctx context.Context, virtualID string, timeout time.Duration) (*Asset, error) {
	deadline := time.Now().Add(timeout)
	for {
		asset, err := c.GetAsset(ctx, virtualID)
		if err != nil {
			return nil, err
		}
		if asset.Status == "active" || asset.Status == "failed" {
			return asset, nil
		}
		if time.Now().After(deadline) {
			return asset, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

func (c *AssetClient) doAsset(req *http.Request) (*Asset, error) {
	req.Header.Set("User-Agent", "nextapi-gateway/1.0")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("uptoken asset transport: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if err != nil {
		return nil, fmt.Errorf("uptoken asset read: %w", err)
	}
	if resp.StatusCode >= 400 {
		if upstreamErr := decodeAssetError(raw, resp.StatusCode); upstreamErr != nil {
			return nil, upstreamErr
		}
		return nil, fmt.Errorf("uptoken asset http %d: %s", resp.StatusCode, snippet(raw))
	}
	var asset Asset
	if err := json.Unmarshal(raw, &asset); err != nil {
		return nil, fmt.Errorf("uptoken asset decode: %w", err)
	}
	if asset.VirtualID == "" {
		return nil, fmt.Errorf("uptoken asset missing virtual_id")
	}
	return &asset, nil
}

func decodeAssetError(raw []byte, statusCode int) *AssetError {
	var out struct {
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.Error == nil {
		return nil
	}
	return &AssetError{
		StatusCode: statusCode,
		Code:       out.Error.Code,
		Message:    out.Error.Message,
		Type:       out.Error.Type,
	}
}
