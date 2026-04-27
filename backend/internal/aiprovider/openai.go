package aiprovider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
)

type Runtime struct {
	service *Service
	http    *http.Client
}

func NewRuntime(service *Service) *Runtime {
	return &Runtime{service: service, http: &http.Client{Timeout: 45 * time.Second}}
}

func (r *Runtime) GenerateTextWithProvider(ctx context.Context, providerID string, messages []Message, options TextOptions) (TextResult, error) {
	prov, err := r.loadProvider(ctx, providerID, domain.AIProviderTypeText)
	if err != nil {
		return TextResult{}, err
	}
	key, err := DecryptAPIKey(prov.APIKeyEncrypted)
	if err != nil {
		r.log(ctx, prov, "", nil, err)
		return TextResult{}, err
	}
	out, err := r.openAIChat(ctx, *prov, key, messages, options)
	r.log(ctx, prov, summarizeMessages(messages), out.Usage, err)
	return out, err
}

func (r *Runtime) GenerateImageWithProvider(ctx context.Context, providerID string, prompt string, options ImageOptions) (ImageResult, error) {
	prov, err := r.loadProvider(ctx, providerID, domain.AIProviderTypeImage)
	if err != nil {
		return ImageResult{}, err
	}
	key, err := DecryptAPIKey(prov.APIKeyEncrypted)
	if err != nil {
		r.log(ctx, prov, "", nil, err)
		return ImageResult{}, err
	}
	out, err := r.openAIImage(ctx, *prov, key, prompt, options)
	r.log(ctx, prov, truncate(prompt, 200), out.Usage, err)
	return out, err
}

func (r *Runtime) TestProvider(ctx context.Context, providerID string) error {
	prov, err := r.service.Get(ctx, providerID)
	if err != nil {
		return err
	}
	switch prov.Type {
	case domain.AIProviderTypeText:
		_, err = r.GenerateTextWithProvider(ctx, prov.ID, []Message{{Role: "user", Content: "Reply with OK."}}, TextOptions{MaxTokens: intPtr(8)})
	case domain.AIProviderTypeImage:
		_, err = r.GenerateImageWithProvider(ctx, prov.ID, "simple gray square", ImageOptions{Resolution: "1024x1024"})
	case domain.AIProviderTypeVideo:
		videoProvider := strings.TrimSpace(prov.Provider)
		if videoProvider != "seedance-relay" && videoProvider != "uptoken-seedance" {
			err = ErrInvalidProvider
		}
	default:
		err = ErrInvalidProvider
	}
	if err != nil {
		return err
	}
	return nil
}

func (r *Runtime) loadProvider(ctx context.Context, providerID string, typ string) (*domain.AIProvider, error) {
	var prov *domain.AIProvider
	var err error
	if strings.TrimSpace(providerID) == "" {
		prov, err = r.service.Default(ctx, typ)
	} else {
		prov, err = r.service.Get(ctx, providerID)
	}
	if err != nil {
		return nil, err
	}
	if prov.Type != typ {
		return nil, ErrInvalidProvider
	}
	if !prov.Enabled {
		return nil, ErrProviderDisabled
	}
	return prov, nil
}

func (r *Runtime) openAIChat(ctx context.Context, prov domain.AIProvider, apiKey string, messages []Message, options TextOptions) (TextResult, error) {
	if apiStyle(prov) == "anthropic" || strings.EqualFold(prov.Provider, "anthropic") {
		return r.anthropicChat(ctx, prov, apiKey, messages, options)
	}
	model := strings.TrimSpace(options.Model)
	if model == "" {
		model = prov.Model
	}
	body := map[string]any{
		"model":    model,
		"messages": messages,
	}
	if options.Temperature != nil {
		body["temperature"] = *options.Temperature
	}
	if options.MaxTokens != nil {
		body["max_tokens"] = *options.MaxTokens
	}
	if options.JSONMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	raw, err := r.postJSON(ctx, endpoint(prov, "/chat/completions"), apiKey, body)
	if err != nil {
		return TextResult{}, err
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage json.RawMessage `json:"usage"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return TextResult{}, err
	}
	if len(parsed.Choices) == 0 {
		return TextResult{}, errors.New("empty provider response")
	}
	return TextResult{Text: parsed.Choices[0].Message.Content, Raw: raw, Usage: parsed.Usage}, nil
}

func (r *Runtime) openAIImage(ctx context.Context, prov domain.AIProvider, apiKey string, prompt string, options ImageOptions) (ImageResult, error) {
	model := strings.TrimSpace(options.Model)
	if model == "" {
		model = prov.Model
	}
	size := strings.TrimSpace(options.Resolution)
	if size == "" {
		size = "1024x1024"
	}
	body := map[string]any{"model": model, "prompt": prompt, "size": size, "n": 1}
	raw, err := r.postJSON(ctx, endpoint(prov, "/images/generations"), apiKey, body)
	if err != nil {
		return ImageResult{}, err
	}
	var parsed struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
		Usage json.RawMessage `json:"usage"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return ImageResult{}, err
	}
	if len(parsed.Data) == 0 || strings.TrimSpace(parsed.Data[0].URL) == "" {
		return ImageResult{}, errors.New("empty image provider response")
	}
	return ImageResult{ImageURL: parsed.Data[0].URL, Raw: raw, Usage: parsed.Usage}, nil
}

func (r *Runtime) postJSON(ctx context.Context, url string, apiKey string, body any) (json.RawMessage, error) {
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := r.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("provider request failed")
	}
	return data, nil
}

func (r *Runtime) anthropicChat(ctx context.Context, prov domain.AIProvider, apiKey string, messages []Message, options TextOptions) (TextResult, error) {
	model := strings.TrimSpace(options.Model)
	if model == "" {
		model = prov.Model
	}
	maxTokens := 1024
	if options.MaxTokens != nil && *options.MaxTokens > 0 {
		maxTokens = *options.MaxTokens
	}
	system, turnMessages := anthropicMessages(messages)
	body := map[string]any{
		"model":      model,
		"max_tokens": maxTokens,
		"messages":   turnMessages,
	}
	if system != "" {
		body["system"] = system
	}
	if options.Temperature != nil {
		body["temperature"] = *options.Temperature
	}
	raw, err := r.postAnthropicJSON(ctx, endpoint(prov, "/v1/messages"), apiKey, body, anthropicVersion(prov))
	if err != nil {
		return TextResult{}, err
	}
	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage json.RawMessage `json:"usage"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return TextResult{}, err
	}
	var b strings.Builder
	for _, block := range parsed.Content {
		if block.Text != "" {
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(block.Text)
		}
	}
	if strings.TrimSpace(b.String()) == "" {
		return TextResult{}, errors.New("empty provider response")
	}
	return TextResult{Text: b.String(), Raw: raw, Usage: parsed.Usage}, nil
}

func (r *Runtime) postAnthropicJSON(ctx context.Context, url string, apiKey string, body any, version string) (json.RawMessage, error) {
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Anthropic-Version", version)
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	resp, err := r.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New("provider request failed")
	}
	return data, nil
}

func anthropicMessages(messages []Message) (string, []Message) {
	var systemParts []string
	out := make([]Message, 0, len(messages))
	for _, msg := range messages {
		role := strings.TrimSpace(msg.Role)
		content := strings.TrimSpace(msg.Content)
		if content == "" {
			continue
		}
		if role == "system" {
			systemParts = append(systemParts, content)
			continue
		}
		if role != "assistant" {
			role = "user"
		}
		out = append(out, Message{Role: role, Content: content})
	}
	if len(out) == 0 {
		out = append(out, Message{Role: "user", Content: "OK"})
	}
	return strings.Join(systemParts, "\n\n"), out
}

func endpoint(prov domain.AIProvider, suffix string) string {
	base := strings.TrimRight(strings.TrimSpace(prov.BaseURL), "/")
	if base == "" {
		switch prov.Provider {
		case "anthropic":
			base = "https://api.anthropic.com"
		case "deepseek":
			base = "https://api.deepseek.com/v1"
		case "google", "gemini":
			base = "https://generativelanguage.googleapis.com/v1beta/openai"
		case "glm":
			base = "https://open.bigmodel.cn/api/paas/v4"
		case "kimi", "moonshot":
			base = "https://api.moonshot.cn/v1"
		case "minimax":
			base = "https://api.minimax.io/v1"
		case "qwen", "dashscope":
			base = "https://dashscope.aliyuncs.com/compatible-mode/v1"
		case "byteplus":
			base = "https://ark.ap-southeast.bytepluses.com/api/v3"
		default:
			base = "https://api.openai.com/v1"
		}
	}
	return base + suffix
}

func apiStyle(prov domain.AIProvider) string {
	var cfg ProviderConfig
	_ = json.Unmarshal(prov.ConfigJSON, &cfg)
	return strings.TrimSpace(cfg.APIStyle)
}

func anthropicVersion(prov domain.AIProvider) string {
	var cfg ProviderConfig
	_ = json.Unmarshal(prov.ConfigJSON, &cfg)
	if strings.TrimSpace(cfg.AnthropicVersion) != "" {
		return strings.TrimSpace(cfg.AnthropicVersion)
	}
	return "2023-06-01"
}

func (r *Runtime) log(ctx context.Context, prov *domain.AIProvider, request string, usage json.RawMessage, err error) {
	if prov == nil || r.service == nil {
		return
	}
	if len(usage) == 0 {
		usage = json.RawMessage(`{}`)
	}
	r.service.Log(ctx, domain.AIProviderLog{
		ProviderID:      &prov.ID,
		Type:            prov.Type,
		RequestSummary:  truncate(request, 500),
		ResponseSummary: successSummary(err),
		UsageJSON:       usage,
		Error:           sanitizeErr(err),
	})
}

func summarizeMessages(messages []Message) string {
	if len(messages) == 0 {
		return ""
	}
	return messages[len(messages)-1].Role + ":" + truncate(messages[len(messages)-1].Content, 180)
}

func truncate(v string, n int) string {
	v = strings.TrimSpace(v)
	if len(v) <= n {
		return v
	}
	return v[:n]
}

func successSummary(err error) string {
	if err != nil {
		return "failed"
	}
	return "ok"
}

func intPtr(v int) *int { return &v }
