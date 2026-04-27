package vimaxruntime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/aiprovider"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/director"
)

var ErrRuntimeUnavailable = errors.New("director_runtime_unavailable")

type Runner struct {
	endpointURL     string
	runtimeToken    string
	callbackBaseURL string
	callbackToken   string
	allowFallback   bool
	http            *http.Client
}

func NewRunner(cfg RunnerConfig) *Runner {
	return &Runner{
		endpointURL:     strings.TrimSpace(cfg.EndpointURL),
		runtimeToken:    strings.TrimSpace(cfg.RuntimeToken),
		callbackBaseURL: strings.TrimSpace(cfg.CallbackBaseURL),
		callbackToken:   strings.TrimSpace(cfg.CallbackToken),
		allowFallback:   cfg.AllowFallback,
		http:            &http.Client{Timeout: 90 * time.Second},
	}
}

func (r *Runner) GenerateStoryboard(ctx context.Context, in director.GenerateShotsInput, deps director.PlannerDeps) (*director.Storyboard, error) {
	if r.endpointURL != "" {
		out, err := r.runSidecar(ctx, in)
		if err == nil {
			storyboard, err := normalizeStoryboard(&out.Storyboard, in)
			if err != nil {
				return nil, err
			}
			storyboard.EngineUsed = director.EngineAdvancedSidecar
			storyboard.EngineStatus = &director.EngineStatus{
				RequestedEngine:   director.EngineAdvancedRequested,
				EngineUsed:        director.EngineAdvancedSidecar,
				FallbackUsed:      false,
				FallbackEnabled:   r.allowFallback,
				SidecarConfigured: true,
				SidecarHealthy:    true,
			}
			return storyboard, nil
		}
		if !r.allowFallback {
			return nil, fmt.Errorf("%w: %v", director.ErrPlannerUnavailable, err)
		}
		return r.runProviderManagedFallbackWithStatus(ctx, in, deps, "sidecar_unavailable", true)
	}
	return r.runProviderManagedFallbackWithStatus(ctx, in, deps, "sidecar_not_configured", false)
}

func (r *Runner) RuntimeStatus(ctx context.Context) director.EngineStatus {
	status := director.EngineStatus{
		RequestedEngine:   director.EngineAdvancedRequested,
		EngineUsed:        director.EngineAdvancedRequested,
		FallbackUsed:      false,
		FallbackEnabled:   r.allowFallback,
		SidecarConfigured: r.endpointURL != "",
		SidecarHealthy:    false,
	}
	if r.allowFallback {
		status.EngineUsed = director.EngineAdvancedFallback
		status.FallbackUsed = true
	}
	if r.endpointURL == "" {
		status.Reason = "sidecar_not_configured"
		return status
	}
	healthCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(healthCtx, http.MethodGet, strings.TrimRight(r.endpointURL, "/")+"/health", nil)
	if err != nil {
		status.Reason = "health_request_failed"
		return status
	}
	if r.runtimeToken != "" {
		req.Header.Set("X-Director-Sidecar-Token", r.runtimeToken)
	}
	resp, err := r.http.Do(req)
	if err != nil {
		status.Reason = "sidecar_unreachable"
		return status
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status.Reason = "sidecar_unhealthy"
		return status
	}
	status.EngineUsed = director.EngineAdvancedSidecar
	status.FallbackUsed = false
	status.SidecarHealthy = true
	return status
}

func (r *Runner) runSidecar(ctx context.Context, in director.GenerateShotsInput) (*RunResponse, error) {
	body := RunRequest{
		Engine:          SidecarProductName,
		Story:           in.Story,
		Genre:           in.Genre,
		Style:           in.Style,
		Scene:           in.Scene,
		OrgID:           in.OrgID,
		ShotCount:       in.ShotCount,
		DurationPerShot: in.DurationPerShot,
		Characters:      in.Characters,
		TextProviderID:  in.TextProviderID,
		Callback: CallbackConfig{
			BaseURL:       r.callbackBaseURL,
			Token:         r.callbackToken,
			TextEndpoint:  "/text",
			ImageEndpoint: "/image",
		},
		Policy: ProviderPolicy{
			NoExternalKeys:       true,
			AllowedModelExits:    []string{"textProvider", "imageProvider", "createVideoTask"},
			StorageMode:          "nextapi_assets",
			TaskStatusMode:       "nextapi_workflow_jobs",
			BillingMode:          "nextapi_billing",
			ProductBrand:         "NextAPI Director",
			DoNotExposeUpstream:  true,
			WorkflowOutputSchema: "nextapi.director.storyboard.v1",
		},
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(r.endpointURL, "/")+"/v1/director/storyboard", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-NextAPI-Provider-Policy", "managed-no-external-keys")
	if r.runtimeToken != "" {
		req.Header.Set("X-Director-Sidecar-Token", r.runtimeToken)
	}
	resp, err := r.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, ErrRuntimeUnavailable
	}
	var out RunResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *Runner) runProviderManagedFallback(ctx context.Context, in director.GenerateShotsInput, deps director.PlannerDeps) (*director.Storyboard, error) {
	if deps.Text == nil {
		return nil, ErrRuntimeUnavailable
	}
	messages := []aiprovider.Message{
		{Role: "system", Content: managedDirectorSystemPrompt},
		{Role: "user", Content: managedDirectorUserPrompt(in)},
	}
	res, err := deps.Text.GenerateTextWithProvider(ctx, in.TextProviderID, messages, aiprovider.TextOptions{JSONMode: true})
	if err != nil {
		return nil, err
	}
	var out director.Storyboard
	if err := json.Unmarshal([]byte(stripJSONFence(res.Text)), &out); err != nil {
		return nil, director.ErrInvalidStoryboard
	}
	return normalizeStoryboard(&out, in)
}

func (r *Runner) runProviderManagedFallbackWithStatus(ctx context.Context, in director.GenerateShotsInput, deps director.PlannerDeps, reason string, sidecarConfigured bool) (*director.Storyboard, error) {
	out, err := r.runProviderManagedFallback(ctx, in, deps)
	if err != nil {
		return nil, err
	}
	out.EngineUsed = director.EngineAdvancedFallback
	out.EngineStatus = &director.EngineStatus{
		RequestedEngine:   director.EngineAdvancedRequested,
		EngineUsed:        director.EngineAdvancedFallback,
		FallbackUsed:      true,
		FallbackEnabled:   r.allowFallback,
		SidecarConfigured: sidecarConfigured,
		SidecarHealthy:    false,
		Reason:            reason,
	}
	return out, nil
}

func normalizeStoryboard(out *director.Storyboard, in director.GenerateShotsInput) (*director.Storyboard, error) {
	if out == nil || strings.TrimSpace(out.Title) == "" || len(out.Shots) == 0 {
		return nil, director.ErrInvalidStoryboard
	}
	if len(out.Shots) > in.ShotCount {
		out.Shots = out.Shots[:in.ShotCount]
	}
	for i := range out.Shots {
		if out.Shots[i].ShotIndex <= 0 {
			out.Shots[i].ShotIndex = i + 1
		}
		if out.Shots[i].Duration <= 0 {
			out.Shots[i].Duration = in.DurationPerShot
		}
		if out.Shots[i].Duration <= 0 {
			out.Shots[i].Duration = 4
		}
		if strings.TrimSpace(out.Shots[i].VideoPrompt) == "" || strings.TrimSpace(out.Shots[i].ImagePrompt) == "" {
			return nil, director.ErrInvalidStoryboard
		}
		if out.Shots[i].ReferenceAssets == nil {
			out.Shots[i].ReferenceAssets = []string{}
		}
	}
	return out, nil
}

func managedDirectorUserPrompt(in director.GenerateShotsInput) string {
	raw, _ := json.Marshal(in)
	return string(raw)
}

func stripJSONFence(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "```json")
	v = strings.TrimPrefix(v, "```")
	v = strings.TrimSuffix(v, "```")
	return strings.TrimSpace(v)
}

const managedDirectorSystemPrompt = `你是 NextAPI Director 的内部导演引擎适配层。
请按专业短剧导演、编剧、分镜师、AI 视频提示词专家的流程，把用户剧情拆成多镜头计划。
要求：
1. 输出严格 JSON，不要 Markdown。
2. 保持角色一致性、服装一致性、场景连续性、情绪递进。
3. 每个镜头必须能映射到 Seedance 视频生成任务。
4. 不要提及任何第三方开源项目或上游供应商名称。
5. 不要包含 API key、base_url 或任何外部调用配置。

输出 JSON schema：
{
  "title": string,
  "summary": string,
  "shots": [
    {
      "shotIndex": number,
      "title": string,
      "duration": number,
      "scene": string,
      "camera": string,
      "emotion": string,
      "action": string,
      "videoPrompt": string,
      "imagePrompt": string,
      "negativePrompt": string,
      "referenceAssets": string[]
    }
  ]
}`
