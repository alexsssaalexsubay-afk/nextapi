package gateway

import (
	"errors"
	"fmt"
	"strings"
)

type videoContentMediaURL struct {
	URL string `json:"url"`
}

type videoContentPart struct {
	Type     string                `json:"type"`
	Text     string                `json:"text,omitempty"`
	Role     string                `json:"role,omitempty"`
	ImageURL *videoContentMediaURL `json:"image_url,omitempty"`
	VideoURL *videoContentMediaURL `json:"video_url,omitempty"`
	AudioURL *videoContentMediaURL `json:"audio_url,omitempty"`
}

type videoContentFields struct {
	Prompt        string
	ImageURLs     []string
	VideoURLs     []string
	AudioURLs     []string
	FirstFrameURL *string
	LastFrameURL  *string
}

func normalizeVideoInput(input *videoInput) error {
	if input == nil {
		return nil
	}
	if err := normalizeRatioAlias(&input.AspectRatio, &input.Ratio); err != nil {
		return err
	}
	if len(input.Content) == 0 {
		return nil
	}
	if hasFlatMediaOrPrompt(input.Prompt, input.ImageURL, input.ImageURLs, input.VideoURLs, input.AudioURLs, input.FirstFrameURL, input.LastFrameURL) {
		return errors.New("content cannot be combined with prompt, image_url, image_urls, video_urls, audio_urls, first_frame_url, or last_frame_url")
	}
	fields, err := videoContentFieldsFromParts(input.Content)
	if err != nil {
		return err
	}
	input.Prompt = fields.Prompt
	input.ImageURLs = fields.ImageURLs
	input.VideoURLs = fields.VideoURLs
	input.AudioURLs = fields.AudioURLs
	input.FirstFrameURL = fields.FirstFrameURL
	input.LastFrameURL = fields.LastFrameURL
	return nil
}

func normalizeGenerateReq(req *generateReq) error {
	if req == nil {
		return nil
	}
	if err := normalizeRatioAlias(&req.AspectRatio, &req.Ratio); err != nil {
		return err
	}
	if len(req.Content) == 0 {
		return nil
	}
	if hasFlatMediaOrPrompt(req.Prompt, req.ImageURL, req.ImageURLs, req.VideoURLs, req.AudioURLs, req.FirstFrameURL, req.LastFrameURL) {
		return errors.New("content cannot be combined with prompt, image_url, image_urls, video_urls, audio_urls, first_frame_url, or last_frame_url")
	}
	fields, err := videoContentFieldsFromParts(req.Content)
	if err != nil {
		return err
	}
	req.Prompt = fields.Prompt
	req.ImageURLs = fields.ImageURLs
	req.VideoURLs = fields.VideoURLs
	req.AudioURLs = fields.AudioURLs
	req.FirstFrameURL = fields.FirstFrameURL
	req.LastFrameURL = fields.LastFrameURL
	return nil
}

func normalizeRatioAlias(aspectRatio *string, ratio *string) error {
	if aspectRatio == nil || ratio == nil {
		return nil
	}
	*aspectRatio = strings.TrimSpace(*aspectRatio)
	*ratio = strings.TrimSpace(*ratio)
	if *aspectRatio != "" && *ratio != "" && *aspectRatio != *ratio {
		return errors.New("ratio and aspect_ratio must match when both are provided")
	}
	if *aspectRatio == "" {
		*aspectRatio = *ratio
	}
	return nil
}

func hasFlatMediaOrPrompt(prompt string, imageURL *string, imageURLs []string, videoURLs []string, audioURLs []string, firstFrameURL *string, lastFrameURL *string) bool {
	if strings.TrimSpace(prompt) != "" {
		return true
	}
	if imageURL != nil && strings.TrimSpace(*imageURL) != "" {
		return true
	}
	return hasAnyString(imageURLs) || hasAnyString(videoURLs) || hasAnyString(audioURLs) ||
		(firstFrameURL != nil && strings.TrimSpace(*firstFrameURL) != "") ||
		(lastFrameURL != nil && strings.TrimSpace(*lastFrameURL) != "")
}

func hasAnyString(values []string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return true
		}
	}
	return false
}

func videoContentFieldsFromParts(parts []videoContentPart) (videoContentFields, error) {
	fields := videoContentFields{
		ImageURLs: make([]string, 0),
		VideoURLs: make([]string, 0),
		AudioURLs: make([]string, 0),
	}
	texts := make([]string, 0, 1)
	for i, part := range parts {
		typ := strings.TrimSpace(part.Type)
		role := strings.TrimSpace(part.Role)
		switch typ {
		case "text":
			if text := strings.TrimSpace(part.Text); text != "" {
				texts = append(texts, text)
			}
		case "image_url":
			u, err := contentURL(i, "image_url", part.ImageURL)
			if err != nil {
				return videoContentFields{}, err
			}
			switch role {
			case "", "reference_image":
				fields.ImageURLs = append(fields.ImageURLs, u)
			case "first_frame":
				if fields.FirstFrameURL != nil {
					return videoContentFields{}, fmt.Errorf("content[%d]: only one first_frame image is allowed", i)
				}
				fields.FirstFrameURL = &u
			case "last_frame":
				if fields.LastFrameURL != nil {
					return videoContentFields{}, fmt.Errorf("content[%d]: only one last_frame image is allowed", i)
				}
				fields.LastFrameURL = &u
			default:
				return videoContentFields{}, fmt.Errorf("content[%d].role is unsupported for image_url", i)
			}
		case "video_url":
			if role != "" && role != "reference_video" {
				return videoContentFields{}, fmt.Errorf("content[%d].role is unsupported for video_url", i)
			}
			u, err := contentURL(i, "video_url", part.VideoURL)
			if err != nil {
				return videoContentFields{}, err
			}
			fields.VideoURLs = append(fields.VideoURLs, u)
		case "audio_url":
			if role != "" && role != "reference_audio" {
				return videoContentFields{}, fmt.Errorf("content[%d].role is unsupported for audio_url", i)
			}
			u, err := contentURL(i, "audio_url", part.AudioURL)
			if err != nil {
				return videoContentFields{}, err
			}
			fields.AudioURLs = append(fields.AudioURLs, u)
		default:
			return videoContentFields{}, fmt.Errorf("content[%d].type must be text, image_url, video_url, or audio_url", i)
		}
	}
	fields.Prompt = strings.Join(texts, "\n\n")
	return fields, nil
}

func contentURL(index int, field string, value *videoContentMediaURL) (string, error) {
	if value == nil || strings.TrimSpace(value.URL) == "" {
		return "", fmt.Errorf("content[%d].%s.url is required", index, field)
	}
	return strings.TrimSpace(value.URL), nil
}
