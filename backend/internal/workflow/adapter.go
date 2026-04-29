package workflow

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/abuse"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/provider"
)

var (
	ErrInvalidWorkflow  = errors.New("invalid_workflow")
	ErrWorkflowNotFound = errors.New("workflow_not_found")
)

func WorkflowToExistingVideoPayload(raw json.RawMessage) (*ExistingVideoPayload, provider.GenerationRequest, json.RawMessage, error) {
	var def Definition
	if err := json.Unmarshal(raw, &def); err != nil {
		return nil, provider.GenerationRequest{}, nil, fmt.Errorf("%w: invalid JSON", ErrInvalidWorkflow)
	}

	videoNodes := nodesByType(def.Nodes, NodeSeedanceVideo)
	if len(videoNodes) != 1 {
		return nil, provider.GenerationRequest{}, nil, fmt.Errorf("%w: exactly one %s node is required for single run", ErrInvalidWorkflow, NodeSeedanceVideo)
	}
	return videoNodeToPayload(def, videoNodes[0])
}

func WorkflowToGenerationRequests(raw json.RawMessage) ([]ExistingVideoPayload, []provider.GenerationRequest, []json.RawMessage, error) {
	var def Definition
	if err := json.Unmarshal(raw, &def); err != nil {
		return nil, nil, nil, fmt.Errorf("%w: invalid JSON", ErrInvalidWorkflow)
	}
	videoNodes := nodesByType(def.Nodes, NodeSeedanceVideo)
	if len(videoNodes) == 0 {
		return nil, nil, nil, fmt.Errorf("%w: %s node is required", ErrInvalidWorkflow, NodeSeedanceVideo)
	}
	payloads := make([]ExistingVideoPayload, 0, len(videoNodes))
	requests := make([]provider.GenerationRequest, 0, len(videoNodes))
	inputs := make([]json.RawMessage, 0, len(videoNodes))
	for _, node := range videoNodes {
		payload, req, inputJSON, err := videoNodeToPayload(def, node)
		if err != nil {
			return nil, nil, nil, err
		}
		payloads = append(payloads, *payload)
		requests = append(requests, req)
		inputs = append(inputs, inputJSON)
	}
	return payloads, requests, inputs, nil
}

func videoNodeToPayload(def Definition, seedance Node) (*ExistingVideoPayload, provider.GenerationRequest, json.RawMessage, error) {
	seedance, err := getNode(def.Nodes, seedance.ID)
	if err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}

	prompt := ""
	if promptNode, err := firstConnectedNode(def, seedance.ID, NodePromptInput); err == nil {
		var promptData PromptInputData
		if err := decodeNodeData(promptNode, &promptData); err != nil {
			return nil, provider.GenerationRequest{}, nil, err
		}
		prompt = strings.TrimSpace(promptData.Prompt)
	}

	paramsData := VideoParamsData{
		Duration:   5,
		Resolution: provider.DefaultResolution(),
	}
	if paramsNode, paramsErr := firstConnectedNode(def, seedance.ID, NodeVideoParams); paramsErr == nil {
		if err := decodeNodeData(paramsNode, &paramsData); err != nil {
			return nil, provider.GenerationRequest{}, nil, err
		}
	}
	if paramsData.Duration <= 0 {
		paramsData.Duration = 5
	}
	if paramsData.Resolution == "" {
		paramsData.Resolution = provider.DefaultResolution()
	}
	if err := validateVideoParams(paramsData); err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}

	imageNodes := connectedNodes(def, seedance.ID, NodeImageInput)
	input := ExistingVideoInputData{
		Prompt:          prompt,
		DurationSeconds: paramsData.Duration,
		Resolution:      paramsData.Resolution,
		Mode:            "normal",
		AspectRatio:     paramsData.AspectRatio,
		GenerateAudio:   paramsData.GenerateAudio,
		Draft:           paramsData.Draft,
		Seed:            paramsData.Seed,
	}

	images := make([]ImageInputData, 0, len(imageNodes))
	for _, node := range imageNodes {
		var image ImageInputData
		if err := decodeNodeData(node, &image); err != nil {
			return nil, provider.GenerationRequest{}, nil, err
		}
		imageURL := strings.TrimSpace(image.ImageURL)
		if imageURL == "" {
			return nil, provider.GenerationRequest{}, nil, fmt.Errorf("%w: image.input image_url is required", ErrInvalidWorkflow)
		}
		if err := abuse.ValidatePublicOrAssetURL(imageURL); err != nil {
			return nil, provider.GenerationRequest{}, nil, fmt.Errorf("%w: image.input image_url must be public https or active asset", ErrInvalidWorkflow)
		}
		image.ImageURL = imageURL
		images = append(images, image)
	}
	if len(images) == 1 && images[0].ImageType == "character" {
		input.FirstFrameURL = &images[0].ImageURL
	} else {
		input.ImageURLs = make([]string, 0, len(images))
		for _, image := range images {
			input.ImageURLs = append(input.ImageURLs, image.ImageURL)
		}
	}

	model := strings.TrimSpace(def.Model)
	var seedanceData SeedanceVideoData
	if len(seedance.Data) > 0 {
		if err := decodeNodeData(seedance, &seedanceData); err != nil {
			return nil, provider.GenerationRequest{}, nil, err
		}
		if strings.TrimSpace(seedanceData.Model) != "" {
			model = strings.TrimSpace(seedanceData.Model)
		}
	}
	if model == "" {
		model = "seedance-2.0-pro"
	}

	payload := ExistingVideoPayload{Model: model, Input: input}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, provider.GenerationRequest{}, nil, fmt.Errorf("marshal video input: %w", err)
	}

	req := provider.GenerationRequest{
		Model:           model,
		Prompt:          input.Prompt,
		DurationSeconds: input.DurationSeconds,
		Resolution:      input.Resolution,
		Mode:            input.Mode,
		AspectRatio:     input.AspectRatio,
		GenerateAudio:   input.GenerateAudio,
		Draft:           input.Draft,
		Seed:            input.Seed,
		FirstFrameURL:   input.FirstFrameURL,
		ImageURLs:       input.ImageURLs,
	}
	if err := validateWorkflowPromptOrMedia(req); err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}

	return &payload, req, inputJSON, nil
}

func validateWorkflowPromptOrMedia(req provider.GenerationRequest) error {
	if strings.TrimSpace(req.Prompt) != "" || provider.HasVisualInput(req) {
		return nil
	}
	return fmt.Errorf("%w: prompt.input or visual media input is required", ErrInvalidWorkflow)
}

func singleNode(nodes []Node, typ string) (Node, error) {
	var out *Node
	for i := range nodes {
		if nodes[i].Type != typ {
			continue
		}
		if out != nil {
			return Node{}, fmt.Errorf("%w: only one %s node is supported", ErrInvalidWorkflow, typ)
		}
		out = &nodes[i]
	}
	if out == nil {
		return Node{}, fmt.Errorf("%w: %s node is required", ErrInvalidWorkflow, typ)
	}
	return *out, nil
}

func nodesByType(nodes []Node, typ string) []Node {
	out := make([]Node, 0)
	for _, node := range nodes {
		if node.Type == typ {
			out = append(out, node)
		}
	}
	return out
}

func getNode(nodes []Node, id string) (Node, error) {
	for _, node := range nodes {
		if node.ID == id {
			return node, nil
		}
	}
	return Node{}, fmt.Errorf("%w: node not found", ErrInvalidWorkflow)
}

func firstConnectedNode(def Definition, targetID string, typ string) (Node, error) {
	nodes := connectedNodes(def, targetID, typ)
	if len(nodes) == 0 {
		return Node{}, fmt.Errorf("%w: connected %s node is required", ErrInvalidWorkflow, typ)
	}
	return nodes[0], nil
}

func connectedNodes(def Definition, targetID string, typ string) []Node {
	byID := make(map[string]Node, len(def.Nodes))
	for _, node := range def.Nodes {
		byID[node.ID] = node
	}
	out := make([]Node, 0)
	for _, edge := range def.Edges {
		if edge.Target != targetID {
			continue
		}
		node, ok := byID[edge.Source]
		if !ok || node.Type != typ {
			continue
		}
		out = append(out, node)
	}
	return out
}

func decodeNodeData(node Node, out any) error {
	if len(node.Data) == 0 {
		return nil
	}
	if err := json.Unmarshal(node.Data, out); err != nil {
		return fmt.Errorf("%w: invalid data for %s", ErrInvalidWorkflow, node.Type)
	}
	return nil
}

func validateVideoParams(params VideoParamsData) error {
	if params.Duration < 4 || params.Duration > 15 {
		return fmt.Errorf("%w: duration must be between 4 and 15", ErrInvalidWorkflow)
	}
	if params.AspectRatio != "" {
		if _, ok := allowedAspectRatios[params.AspectRatio]; !ok {
			return fmt.Errorf("%w: aspect_ratio is unsupported", ErrInvalidWorkflow)
		}
	}
	if _, ok := provider.AllowedResolutions()[strings.TrimSpace(params.Resolution)]; !ok {
		return fmt.Errorf("%w: resolution is unsupported", ErrInvalidWorkflow)
	}
	return nil
}

var allowedAspectRatios = map[string]struct{}{
	"16:9": {}, "9:16": {}, "1:1": {}, "4:3": {}, "3:4": {}, "21:9": {}, "adaptive": {},
}
