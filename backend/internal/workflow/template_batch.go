package workflow

import (
	"encoding/json"
	"fmt"
	"sort"
)

const maxTemplateBatchVariants = 100

type templateBatchManifest struct {
	TemplateID string           `json:"template_id"`
	Template   string           `json:"template"`
	Mode       string           `json:"mode"`
	Variants   []map[string]any `json:"variants"`
}

func expandTemplateInputs(base map[string]any, variables map[string][]any, mode string) ([]map[string]any, error) {
	if len(variables) == 0 {
		return []map[string]any{cloneInputs(base)}, nil
	}
	if mode == "" {
		mode = "cartesian"
	}
	keys := make([]string, 0, len(variables))
	for key, values := range variables {
		if len(values) == 0 {
			return nil, fmt.Errorf("%w: variable %s has no values", ErrInvalidWorkflow, key)
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	switch mode {
	case "cartesian":
		out := []map[string]any{cloneInputs(base)}
		for _, key := range keys {
			next := make([]map[string]any, 0, len(out)*len(variables[key]))
			for _, item := range out {
				for _, value := range variables[key] {
					clone := cloneInputs(item)
					clone[key] = value
					next = append(next, clone)
					if len(next) > maxTemplateBatchVariants {
						return nil, fmt.Errorf("%w: too many template variants", ErrInvalidWorkflow)
					}
				}
			}
			out = next
		}
		return out, nil
	case "zip":
		count := len(variables[keys[0]])
		for _, key := range keys[1:] {
			if len(variables[key]) != count {
				return nil, fmt.Errorf("%w: zip variables must have the same length", ErrInvalidWorkflow)
			}
		}
		if count > maxTemplateBatchVariants {
			return nil, fmt.Errorf("%w: too many template variants", ErrInvalidWorkflow)
		}
		out := make([]map[string]any, 0, count)
		for i := 0; i < count; i++ {
			clone := cloneInputs(base)
			for _, key := range keys {
				clone[key] = variables[key][i]
			}
			out = append(out, clone)
		}
		return out, nil
	default:
		return nil, fmt.Errorf("%w: unsupported batch mode", ErrInvalidWorkflow)
	}
}

func cloneInputs(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func marshalTemplateBatchManifest(templateID string, slug string, mode string, variants []map[string]any) json.RawMessage {
	raw, _ := json.Marshal(templateBatchManifest{
		TemplateID: templateID,
		Template:   slug,
		Mode:       mode,
		Variants:   variants,
	})
	return raw
}
