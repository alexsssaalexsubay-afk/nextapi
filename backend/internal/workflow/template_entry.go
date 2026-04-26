package workflow

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

const (
	templateShortDrama = "short-drama-production-v1"
	templateEcommerce  = "ecommerce-product-production-v1"
	templateTalking    = "talking-creator-production-v1"
)

type TemplateRunInput struct {
	OrgID    string
	APIKeyID *string
	Inputs   map[string]any
}

type TemplateBatchRunInput struct {
	OrgID       string
	APIKeyID    *string
	Name        *string
	MaxParallel *int
	Inputs      map[string]any
	Variables   map[string][]any
	Mode        string
}

func ApplyTemplateInputs(slug string, raw json.RawMessage, inputs map[string]any) (json.RawMessage, error) {
	var def Definition
	if err := json.Unmarshal(raw, &def); err != nil {
		return nil, fmt.Errorf("%w: invalid template workflow", ErrInvalidWorkflow)
	}
	if len(def.Nodes) == 0 {
		return nil, fmt.Errorf("%w: template workflow has no nodes", ErrInvalidWorkflow)
	}
	switch slug {
	case templateShortDrama:
		if err := applyShortDramaInputs(&def, inputs); err != nil {
			return nil, err
		}
	case templateEcommerce:
		if err := applyEcommerceInputs(&def, inputs); err != nil {
			return nil, err
		}
	case templateTalking:
		if err := applyTalkingInputs(&def, inputs); err != nil {
			return nil, err
		}
	default:
		if err := applyGenericTemplateInputs(&def, inputs); err != nil {
			return nil, err
		}
	}
	out, err := json.Marshal(def)
	if err != nil {
		return nil, fmt.Errorf("marshal template workflow: %w", err)
	}
	return out, nil
}

func applyGenericTemplateInputs(def *Definition, inputs map[string]any) error {
	for i := range def.Nodes {
		data := map[string]any{}
		if len(def.Nodes[i].Data) > 0 {
			if err := json.Unmarshal(def.Nodes[i].Data, &data); err != nil {
				return fmt.Errorf("%w: invalid data for %s", ErrInvalidWorkflow, def.Nodes[i].Type)
			}
		}
		key, _ := data["template_key"].(string)
		if key == "" {
			key = def.Nodes[i].ID
		}
		switch def.Nodes[i].Type {
		case NodeImageInput:
			if value, ok := optionalStringInput(inputs, key); ok {
				data["image_url"] = value
			}
		case NodePromptInput:
			if value, ok := optionalStringInput(inputs, key); ok {
				data["prompt"] = value
			}
			if value, ok := optionalStringInput(inputs, "prompt"); ok {
				data["prompt"] = value
			}
		case NodeVideoParams:
			if duration, ok, err := optionalIntInput(inputs, "duration"); err != nil {
				return err
			} else if ok {
				data["duration"] = duration
			}
			if aspectRatio, ok := optionalStringInput(inputs, "aspect_ratio"); ok {
				data["aspect_ratio"] = aspectRatio
			}
			if resolution, ok := optionalStringInput(inputs, "resolution"); ok {
				data["resolution"] = resolution
			}
		}
		raw, err := json.Marshal(data)
		if err != nil {
			return fmt.Errorf("marshal node data: %w", err)
		}
		def.Nodes[i].Data = raw
	}
	return nil
}

func applyShortDramaInputs(def *Definition, inputs map[string]any) error {
	femaleImage, err := requiredStringInput(inputs, "female_image")
	if err != nil {
		return err
	}
	maleImage, err := requiredStringInput(inputs, "male_image")
	if err != nil {
		return err
	}
	scene, err := requiredStringInput(inputs, "scene")
	if err != nil {
		return err
	}
	plot, err := requiredStringInput(inputs, "plot")
	if err != nil {
		return err
	}
	if err := setImageNode(def, "female_image", femaleImage); err != nil {
		return err
	}
	if err := setImageNode(def, "male_image", maleImage); err != nil {
		return err
	}
	prompt := "电影级短剧情绪场景：女主与男主在 " + scene + " 中发生冲突，剧情：" + plot +
		"。镜头：强情绪、对视、推近、光影对比强烈，人物一致性，真实电影质感，场景连续。"
	if err := setPromptNode(def, prompt); err != nil {
		return err
	}
	return setOptionalParams(def, inputs)
}

func applyEcommerceInputs(def *Definition, inputs map[string]any) error {
	productImage, err := requiredStringInput(inputs, "product_image")
	if err != nil {
		return err
	}
	sellingPoints, err := requiredStringInput(inputs, "selling_points")
	if err != nil {
		return err
	}
	modelStyle, err := requiredStringInput(inputs, "model_style")
	if err != nil {
		return err
	}
	scene, err := requiredStringInput(inputs, "scene")
	if err != nil {
		return err
	}
	if err := setImageNode(def, "product_image", productImage); err != nil {
		return err
	}
	prompt := "商业广告质感商品视频：商品在 " + scene + " 中展示，模特风格：" + modelStyle +
		"。突出卖点：" + sellingPoints + "。真实光影、真实手部动作、商品高光清晰、购买欲强、适合社媒投放。"
	if err := setPromptNode(def, prompt); err != nil {
		return err
	}
	return setOptionalParams(def, inputs)
}

func applyTalkingInputs(def *Definition, inputs map[string]any) error {
	characterImage, err := requiredStringInput(inputs, "character_image")
	if err != nil {
		return err
	}
	script, err := requiredStringInput(inputs, "script")
	if err != nil {
		return err
	}
	tone, err := requiredStringInput(inputs, "tone")
	if err != nil {
		return err
	}
	background, err := requiredStringInput(inputs, "background")
	if err != nil {
		return err
	}
	if err := setImageNode(def, "character_image", characterImage); err != nil {
		return err
	}
	prompt := "真实口播达人视频：人物在 " + background + " 背景中自然口播，语气风格：" + tone +
		"。口播内容：" + script + "。镜头稳定，微表情自然，手势克制真实，博主感强，适合账号矩阵发布。"
	if err := setPromptNode(def, prompt); err != nil {
		return err
	}
	return setOptionalParams(def, inputs)
}

func setImageNode(def *Definition, key string, imageURL string) error {
	return updateNodeData(def, key, NodeImageInput, func(data map[string]any) {
		data["image_url"] = imageURL
	})
}

func setPromptNode(def *Definition, prompt string) error {
	return updateNodeData(def, "prompt", NodePromptInput, func(data map[string]any) {
		data["prompt"] = prompt
	})
}

func setOptionalParams(def *Definition, inputs map[string]any) error {
	duration, hasDuration, err := optionalIntInput(inputs, "duration")
	if err != nil {
		return err
	}
	return updateNodeData(def, "params", NodeVideoParams, func(data map[string]any) {
		if hasDuration {
			data["duration"] = duration
		}
		if aspectRatio, ok := optionalStringInput(inputs, "aspect_ratio"); ok {
			data["aspect_ratio"] = aspectRatio
		}
		if resolution, ok := optionalStringInput(inputs, "resolution"); ok {
			data["resolution"] = resolution
		}
	})
}

func updateNodeData(def *Definition, key string, nodeType string, update func(map[string]any)) error {
	for i := range def.Nodes {
		if def.Nodes[i].Type != nodeType {
			continue
		}
		data := map[string]any{}
		if len(def.Nodes[i].Data) > 0 {
			if err := json.Unmarshal(def.Nodes[i].Data, &data); err != nil {
				return fmt.Errorf("%w: invalid data for %s", ErrInvalidWorkflow, nodeType)
			}
		}
		templateKey, _ := data["template_key"].(string)
		if def.Nodes[i].ID != key && templateKey != key {
			continue
		}
		update(data)
		raw, err := json.Marshal(data)
		if err != nil {
			return fmt.Errorf("marshal node data: %w", err)
		}
		def.Nodes[i].Data = raw
		return nil
	}
	return fmt.Errorf("%w: template node %s is missing", ErrInvalidWorkflow, key)
}

func requiredStringInput(inputs map[string]any, key string) (string, error) {
	value, ok := optionalStringInput(inputs, key)
	if !ok {
		return "", fmt.Errorf("%w: input %s is required", ErrInvalidWorkflow, key)
	}
	return value, nil
}

func optionalStringInput(inputs map[string]any, key string) (string, bool) {
	raw, ok := inputs[key]
	if !ok || raw == nil {
		return "", false
	}
	switch v := raw.(type) {
	case string:
		out := strings.TrimSpace(v)
		return out, out != ""
	case json.Number:
		out := strings.TrimSpace(v.String())
		return out, out != ""
	default:
		out := strings.TrimSpace(fmt.Sprint(v))
		return out, out != ""
	}
}

func optionalIntInput(inputs map[string]any, key string) (int, bool, error) {
	raw, ok := inputs[key]
	if !ok || raw == nil {
		return 0, false, nil
	}
	switch v := raw.(type) {
	case int:
		return v, true, nil
	case int64:
		return int(v), true, nil
	case float64:
		return int(v), true, nil
	case json.Number:
		n, err := strconv.Atoi(v.String())
		return n, err == nil, err
	case string:
		if strings.TrimSpace(v) == "" {
			return 0, false, nil
		}
		n, err := strconv.Atoi(strings.TrimSpace(v))
		return n, err == nil, err
	default:
		return 0, false, fmt.Errorf("%w: input %s must be a number", ErrInvalidWorkflow, key)
	}
}
