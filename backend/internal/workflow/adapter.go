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
	ErrInvalidWorkflow             = errors.New("invalid_workflow")
	ErrWorkflowNotFound            = errors.New("workflow_not_found")
	ErrDirectorEntitlementRequired = errors.New("ai_director_entitlement_required")
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

func WorkflowRequiresDirectorEntitlement(raw json.RawMessage) bool {
	var def Definition
	if err := json.Unmarshal(raw, &def); err != nil {
		return false
	}
	var metadata map[string]any
	if len(def.Metadata) > 0 && json.Unmarshal(def.Metadata, &metadata) == nil {
		if metadata["requires_director_entitlement"] == true {
			return true
		}
	}
	for _, node := range def.Nodes {
		if node.Type == NodeDirectorLLM {
			return true
		}
		var data map[string]any
		if len(node.Data) > 0 && json.Unmarshal(node.Data, &data) == nil && data["requires_director_entitlement"] == true {
			return true
		}
	}
	return false
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
	videoNodes := connectedNodes(def, seedance.ID, NodeVideoInput)
	audioNodes := connectedNodes(def, seedance.ID, NodeAudioInput)
	input := ExistingVideoInputData{
		Prompt:          prompt,
		DurationSeconds: paramsData.Duration,
		Resolution:      paramsData.Resolution,
		Mode:            "normal",
		AspectRatio:     paramsData.AspectRatio,
		FPS:             paramsData.FPS,
		GenerateAudio:   paramsData.GenerateAudio,
		Draft:           paramsData.Draft,
		Seed:            paramsData.Seed,
	}

	images := make([]ImageInputData, 0, len(imageNodes))
	var firstFrameURL *string
	var lastFrameURL *string
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
	for _, image := range images {
		imageType := strings.TrimSpace(strings.ToLower(image.ImageType))
		switch imageType {
		case "first_frame":
			url := image.ImageURL
			firstFrameURL = &url
		case "last_frame":
			url := image.ImageURL
			lastFrameURL = &url
		}
	}
	if firstFrameURL != nil {
		input.FirstFrameURL = firstFrameURL
		input.LastFrameURL = lastFrameURL
	} else if lastFrameURL != nil {
		return nil, provider.GenerationRequest{}, nil, fmt.Errorf("%w: last_frame image requires a first_frame image", ErrInvalidWorkflow)
	} else if len(images) == 1 && strings.TrimSpace(strings.ToLower(images[0].ImageType)) == "character" {
		input.FirstFrameURL = &images[0].ImageURL
	} else {
		input.ImageURLs = make([]string, 0, len(images))
		for _, image := range images {
			input.ImageURLs = append(input.ImageURLs, image.ImageURL)
		}
	}
	input.VideoURLs, err = mediaURLsFromVideoNodes(videoNodes)
	if err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}
	input.AudioURLs, err = mediaURLsFromAudioNodes(audioNodes)
	if err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}
	if err := validateWorkflowMediaLimits(input); err != nil {
		return nil, provider.GenerationRequest{}, nil, err
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
		FPS:             input.FPS,
		GenerateAudio:   input.GenerateAudio,
		Draft:           input.Draft,
		Seed:            input.Seed,
		FirstFrameURL:   input.FirstFrameURL,
		LastFrameURL:    input.LastFrameURL,
		ImageURLs:       input.ImageURLs,
		VideoURLs:       input.VideoURLs,
		AudioURLs:       input.AudioURLs,
	}
	if err := validateWorkflowPromptOrMedia(req); err != nil {
		return nil, provider.GenerationRequest{}, nil, err
	}

	return &payload, req, inputJSON, nil
}

func validateWorkflowMediaLimits(input ExistingVideoInputData) error {
	if len(input.ImageURLs) > 9 {
		return fmt.Errorf("%w: image_urls max 9", ErrInvalidWorkflow)
	}
	if len(input.VideoURLs) > 3 {
		return fmt.Errorf("%w: video_urls max 3", ErrInvalidWorkflow)
	}
	if len(input.AudioURLs) > 3 {
		return fmt.Errorf("%w: audio_urls max 3", ErrInvalidWorkflow)
	}
	if input.LastFrameURL != nil && strings.TrimSpace(*input.LastFrameURL) != "" &&
		(input.FirstFrameURL == nil || strings.TrimSpace(*input.FirstFrameURL) == "") {
		return fmt.Errorf("%w: last_frame_url requires first_frame_url", ErrInvalidWorkflow)
	}
	hasVisual := len(input.ImageURLs) > 0 || len(input.VideoURLs) > 0 ||
		(input.FirstFrameURL != nil && strings.TrimSpace(*input.FirstFrameURL) != "")
	if len(input.AudioURLs) > 0 && !hasVisual {
		return fmt.Errorf("%w: audio_urls requires image, video, or first_frame input", ErrInvalidWorkflow)
	}
	return nil
}

func mediaURLsFromVideoNodes(nodes []Node) ([]string, error) {
	out := make([]string, 0, len(nodes))
	for _, node := range nodes {
		var video VideoInputData
		if err := decodeNodeData(node, &video); err != nil {
			return nil, err
		}
		videoURL := strings.TrimSpace(video.VideoURL)
		if videoURL == "" {
			return nil, fmt.Errorf("%w: video.input video_url is required", ErrInvalidWorkflow)
		}
		if err := abuse.ValidatePublicOrAssetURL(videoURL); err != nil {
			return nil, fmt.Errorf("%w: video.input video_url must be public https or active asset", ErrInvalidWorkflow)
		}
		out = append(out, videoURL)
	}
	return out, nil
}

func mediaURLsFromAudioNodes(nodes []Node) ([]string, error) {
	out := make([]string, 0, len(nodes))
	for _, node := range nodes {
		var audio AudioInputData
		if err := decodeNodeData(node, &audio); err != nil {
			return nil, err
		}
		audioURL := strings.TrimSpace(audio.AudioURL)
		if audioURL == "" {
			return nil, fmt.Errorf("%w: audio.input audio_url is required", ErrInvalidWorkflow)
		}
		if err := abuse.ValidatePublicOrAssetURL(audioURL); err != nil {
			return nil, fmt.Errorf("%w: audio.input audio_url must be public https or active asset", ErrInvalidWorkflow)
		}
		out = append(out, audioURL)
	}
	return out, nil
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
	if params.FPS != 0 && params.FPS != 24 && params.FPS != 30 {
		return fmt.Errorf("%w: fps must be 24 or 30", ErrInvalidWorkflow)
	}
	if _, ok := provider.AllowedResolutions()[strings.TrimSpace(params.Resolution)]; !ok {
		return fmt.Errorf("%w: resolution is unsupported", ErrInvalidWorkflow)
	}
	return nil
}

var allowedAspectRatios = map[string]struct{}{
	"16:9": {}, "9:16": {}, "1:1": {}, "4:3": {}, "3:4": {}, "21:9": {}, "adaptive": {},
}
