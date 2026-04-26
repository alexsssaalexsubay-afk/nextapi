package workflow

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	batchsvc "github.com/alexsssaalexsubay-afk/nextapi/backend/internal/batch"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/domain"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/job"
	"github.com/alexsssaalexsubay-afk/nextapi/backend/internal/throughput"
	"gorm.io/gorm"
)

type Service struct {
	db         *gorm.DB
	jobs       *job.Service
	batches    *batchsvc.Service
	throughput *throughput.Service
}

func NewService(db *gorm.DB, jobs *job.Service) *Service {
	return &Service{db: db, jobs: jobs}
}

func (s *Service) SetThroughput(tp *throughput.Service) { s.throughput = tp }

func (s *Service) SetBatchService(batches *batchsvc.Service) { s.batches = batches }

type CreateInput struct {
	OrgID        string
	ProjectID    *string
	Name         string
	Description  *string
	WorkflowJSON json.RawMessage
}

type UpdateInput struct {
	Name         *string
	Description  *string
	WorkflowJSON *json.RawMessage
	ChangeNote   *string
}

type RunInput struct {
	OrgID    string
	APIKeyID *string
}

type RunResult struct {
	RunID              string `json:"run_id"`
	TaskID             string `json:"task_id"`
	VideoID            string `json:"video_id"`
	Status             string `json:"status"`
	EstimatedCostCents int64  `json:"estimated_cost_cents"`
}

type SaveAsTemplateInput struct {
	OrgID                  string
	WorkflowID             string
	Name                   string
	Description            *string
	Category               string
	CoverImageURL          *string
	PreviewVideoURL        *string
	RecommendedInputSchema json.RawMessage
}

type UseTemplateInput struct {
	OrgID      string
	TemplateID string
	Name       string
}

type ExportResult struct {
	Payload    ExistingVideoPayload `json:"payload"`
	Curl       string               `json:"curl"`
	JavaScript string               `json:"javascript"`
	Python     string               `json:"python"`
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*domain.Workflow, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = "Untitled workflow"
	}
	if err := s.validateWorkflowJSON(in.WorkflowJSON); err != nil {
		return nil, err
	}
	if err := s.validateProject(ctx, in.OrgID, in.ProjectID); err != nil {
		return nil, err
	}
	row := domain.Workflow{
		OrgID:        in.OrgID,
		ProjectID:    in.ProjectID,
		Name:         name,
		Description:  in.Description,
		WorkflowJSON: in.WorkflowJSON,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	if _, err := s.createVersion(ctx, row.ID, row.WorkflowJSON, "created workflow", nil); err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) Get(ctx context.Context, orgID, id string) (*domain.Workflow, error) {
	var row domain.Workflow
	err := s.db.WithContext(ctx).Where("id = ? AND org_id = ?", id, orgID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrWorkflowNotFound
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) List(ctx context.Context, orgID string, limit int) ([]domain.Workflow, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []domain.Workflow
	err := s.db.WithContext(ctx).
		Where("org_id = ?", orgID).
		Order("updated_at DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

func (s *Service) Update(ctx context.Context, orgID, id string, in UpdateInput) (*domain.Workflow, error) {
	updates := map[string]any{"updated_at": time.Now()}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: name is required", ErrInvalidWorkflow)
		}
		updates["name"] = name
	}
	if in.Description != nil {
		updates["description"] = in.Description
	}
	if in.WorkflowJSON != nil {
		if err := s.validateWorkflowJSON(*in.WorkflowJSON); err != nil {
			return nil, err
		}
		updates["workflow_json"] = *in.WorkflowJSON
	}
	res := s.db.WithContext(ctx).
		Model(&domain.Workflow{}).
		Where("id = ? AND org_id = ?", id, orgID).
		Updates(updates)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, ErrWorkflowNotFound
	}
	row, err := s.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	note := "saved workflow"
	if in.ChangeNote != nil && strings.TrimSpace(*in.ChangeNote) != "" {
		note = strings.TrimSpace(*in.ChangeNote)
	}
	if _, err := s.createVersion(ctx, row.ID, row.WorkflowJSON, note, nil); err != nil {
		return nil, err
	}
	return row, nil
}

func (s *Service) Duplicate(ctx context.Context, orgID, id string) (*domain.Workflow, error) {
	original, err := s.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	name := original.Name + " Copy"
	return s.Create(ctx, CreateInput{
		OrgID:        orgID,
		ProjectID:    original.ProjectID,
		Name:         name,
		Description:  original.Description,
		WorkflowJSON: original.WorkflowJSON,
	})
}

func (s *Service) Run(ctx context.Context, workflowID string, in RunInput) (*RunResult, error) {
	row, err := s.Get(ctx, in.OrgID, workflowID)
	if err != nil {
		return nil, err
	}
	payload, req, inputJSON, err := WorkflowToExistingVideoPayload(row.WorkflowJSON)
	if err != nil {
		return nil, err
	}

	res, err := s.jobs.Create(ctx, job.CreateInput{
		OrgID:    in.OrgID,
		APIKeyID: in.APIKeyID,
		Request:  req,
	})
	if err != nil {
		return nil, err
	}

	metadata, _ := json.Marshal(map[string]any{"workflow_id": row.ID})
	video := domain.Video{
		OrgID:              in.OrgID,
		APIKeyID:           in.APIKeyID,
		Model:              payload.Model,
		Status:             "queued",
		Input:              inputJSON,
		Metadata:           metadata,
		UpstreamJobID:      &res.JobID,
		EstimatedCostCents: res.EstimatedCredits,
		ReservedCents:      res.EstimatedCredits,
	}
	if err := s.db.WithContext(ctx).Create(&video).Error; err != nil {
		s.failQueuedJobAfterVideoWriteError(res.JobID, in.OrgID, in.APIKeyID, res.EstimatedCredits)
		return nil, err
	}

	snapshot, _ := json.Marshal(map[string]any{
		"workflow": row.WorkflowJSON,
		"payload":  payload,
	})
	run := domain.WorkflowRun{
		WorkflowID:    row.ID,
		OrgID:         in.OrgID,
		JobID:         res.JobID,
		VideoID:       &video.ID,
		Status:        res.Status,
		InputSnapshot: snapshot,
	}
	if err := s.db.WithContext(ctx).Create(&run).Error; err != nil {
		return nil, err
	}

	return &RunResult{
		RunID:              run.ID,
		TaskID:             video.ID,
		VideoID:            video.ID,
		Status:             video.Status,
		EstimatedCostCents: res.EstimatedCredits,
	}, nil
}

func (s *Service) ListVersions(ctx context.Context, orgID, workflowID string) ([]domain.WorkflowVersion, error) {
	if _, err := s.Get(ctx, orgID, workflowID); err != nil {
		return nil, err
	}
	var rows []domain.WorkflowVersion
	err := s.db.WithContext(ctx).
		Where("workflow_id = ?", workflowID).
		Order("version DESC").
		Find(&rows).Error
	return rows, err
}

func (s *Service) CreateVersion(ctx context.Context, orgID, workflowID string, note *string) (*domain.WorkflowVersion, error) {
	row, err := s.Get(ctx, orgID, workflowID)
	if err != nil {
		return nil, err
	}
	version, err := s.createVersion(ctx, row.ID, row.WorkflowJSON, noteString(note, "manual snapshot"), nil)
	if err != nil {
		return nil, err
	}
	return version, nil
}

func (s *Service) RestoreVersion(ctx context.Context, orgID, workflowID, versionID string) (*domain.Workflow, error) {
	if _, err := s.Get(ctx, orgID, workflowID); err != nil {
		return nil, err
	}
	var version domain.WorkflowVersion
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workflow_id = ?", versionID, workflowID).
		First(&version).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkflowNotFound
		}
		return nil, err
	}
	raw := version.WorkflowJSON
	note := "restored version " + strconv.Itoa(version.Version)
	return s.Update(ctx, orgID, workflowID, UpdateInput{WorkflowJSON: &raw, ChangeNote: &note})
}

func (s *Service) SaveAsTemplate(ctx context.Context, in SaveAsTemplateInput) (*domain.Template, error) {
	row, err := s.Get(ctx, in.OrgID, in.WorkflowID)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = row.Name
	}
	category := strings.TrimSpace(in.Category)
	if category == "" {
		category = "canvas"
	}
	schema := in.RecommendedInputSchema
	if len(schema) == 0 {
		schema = json.RawMessage(`[]`)
	}
	template := domain.Template{
		OrgID:                  &in.OrgID,
		Name:                   name,
		Slug:                   uniqueSlug(name),
		Description:            in.Description,
		CoverImageURL:          in.CoverImageURL,
		Category:               category,
		DefaultModel:           "seedance-2.0-pro",
		DefaultResolution:      "1080p",
		DefaultDuration:        5,
		DefaultAspectRatio:     "9:16",
		DefaultMaxParallel:     5,
		InputSchema:            json.RawMessage(`[]`),
		WorkflowJSON:           row.WorkflowJSON,
		RecommendedInputSchema: schema,
		Visibility:             "private",
		PricingMultiplier:      1.00,
		PreviewVideoURL:        in.PreviewVideoURL,
	}
	if err := s.db.WithContext(ctx).Create(&template).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (s *Service) CreateFromTemplate(ctx context.Context, in UseTemplateInput) (*domain.Workflow, error) {
	var tmpl domain.Template
	if err := s.db.WithContext(ctx).
		Where("id = ? AND (visibility = 'system' OR org_id = ?)", in.TemplateID, in.OrgID).
		First(&tmpl).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkflowNotFound
		}
		return nil, err
	}
	if len(tmpl.WorkflowJSON) == 0 {
		return nil, fmt.Errorf("%w: template has no workflow", ErrInvalidWorkflow)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = tmpl.Name + " Workflow"
	}
	workflow, err := s.Create(ctx, CreateInput{
		OrgID:        in.OrgID,
		Name:         name,
		Description:  tmpl.Description,
		WorkflowJSON: tmpl.WorkflowJSON,
	})
	if err != nil {
		return nil, err
	}
	_ = s.db.WithContext(ctx).Model(&domain.Template{}).
		Where("id = ?", tmpl.ID).
		UpdateColumn("usage_count", gorm.Expr("usage_count + 1")).Error
	return workflow, nil
}

func (s *Service) RunTemplate(ctx context.Context, templateID string, in TemplateRunInput) (*RunResult, error) {
	var tmpl domain.Template
	if err := s.db.WithContext(ctx).
		Where("(id = ? OR slug = ?) AND (visibility = 'system' OR org_id = ?)", templateID, templateID, in.OrgID).
		First(&tmpl).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkflowNotFound
		}
		return nil, err
	}
	if len(tmpl.WorkflowJSON) == 0 {
		return nil, fmt.Errorf("%w: template has no workflow", ErrInvalidWorkflow)
	}
	workflowJSON, err := ApplyTemplateInputs(tmpl.Slug, tmpl.WorkflowJSON, in.Inputs)
	if err != nil {
		return nil, err
	}
	workflow, err := s.Create(ctx, CreateInput{
		OrgID:        in.OrgID,
		Name:         tmpl.Name + " Run",
		Description:  tmpl.Description,
		WorkflowJSON: workflowJSON,
	})
	if err != nil {
		return nil, err
	}
	out, err := s.Run(ctx, workflow.ID, RunInput{
		OrgID:    in.OrgID,
		APIKeyID: in.APIKeyID,
	})
	if err != nil {
		return nil, err
	}
	_ = s.db.WithContext(ctx).Model(&domain.Template{}).
		Where("id = ?", tmpl.ID).
		UpdateColumn("usage_count", gorm.Expr("usage_count + 1")).Error
	return out, nil
}

func (s *Service) RunTemplateBatch(ctx context.Context, templateID string, in TemplateBatchRunInput) (*batchsvc.CreateResult, error) {
	if s.batches == nil {
		return nil, fmt.Errorf("%w: batch service is unavailable", ErrInvalidWorkflow)
	}
	var tmpl domain.Template
	if err := s.db.WithContext(ctx).
		Where("(id = ? OR slug = ?) AND (visibility = 'system' OR org_id = ?)", templateID, templateID, in.OrgID).
		First(&tmpl).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkflowNotFound
		}
		return nil, err
	}
	if len(tmpl.WorkflowJSON) == 0 {
		return nil, fmt.Errorf("%w: template has no workflow", ErrInvalidWorkflow)
	}
	variants, err := expandTemplateInputs(in.Inputs, in.Variables, in.Mode)
	if err != nil {
		return nil, err
	}
	shots := make([]job.CreateInput, 0, len(variants))
	for _, variant := range variants {
		workflowJSON, err := ApplyTemplateInputs(tmpl.Slug, tmpl.WorkflowJSON, variant)
		if err != nil {
			return nil, err
		}
		_, req, _, err := WorkflowToExistingVideoPayload(workflowJSON)
		if err != nil {
			return nil, err
		}
		shots = append(shots, job.CreateInput{
			OrgID:    in.OrgID,
			APIKeyID: in.APIKeyID,
			Request:  req,
		})
	}
	manifest := marshalTemplateBatchManifest(tmpl.ID, tmpl.Slug, in.Mode, variants)
	out, err := s.batches.Create(ctx, batchsvc.CreateInput{
		OrgID:       in.OrgID,
		APIKeyID:    in.APIKeyID,
		Name:        in.Name,
		MaxParallel: in.MaxParallel,
		Shots:       shots,
		Manifest:    manifest,
	})
	if err != nil {
		return nil, err
	}
	_ = s.db.WithContext(ctx).Model(&domain.Template{}).
		Where("id = ?", tmpl.ID).
		UpdateColumn("usage_count", gorm.Expr("usage_count + ?", len(shots))).Error
	return out, nil
}

func (s *Service) ExportAPI(ctx context.Context, orgID, workflowID string) (*ExportResult, error) {
	row, err := s.Get(ctx, orgID, workflowID)
	if err != nil {
		return nil, err
	}
	payload, _, _, err := WorkflowToExistingVideoPayload(row.WorkflowJSON)
	if err != nil {
		return nil, err
	}
	body, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, err
	}
	bodyString := string(body)
	return &ExportResult{
		Payload: *payload,
		Curl: "curl -X POST https://api.nextapi.top/v1/videos \\\n" +
			"  -H \"Authorization: Bearer $NEXTAPI_KEY\" \\\n" +
			"  -H \"Content-Type: application/json\" \\\n" +
			"  -d '" + bodyString + "'",
		JavaScript: "await fetch(\"https://api.nextapi.top/v1/videos\", {\n" +
			"  method: \"POST\",\n" +
			"  headers: {\n" +
			"    \"Authorization\": `Bearer ${process.env.NEXTAPI_KEY}`,\n" +
			"    \"Content-Type\": \"application/json\",\n" +
			"  },\n" +
			"  body: JSON.stringify(" + bodyString + "),\n" +
			"})",
		Python: "import os\nimport requests\n\n" +
			"payload = " + bodyString + "\n\n" +
			"response = requests.post(\n" +
			"    \"https://api.nextapi.top/v1/videos\",\n" +
			"    headers={\"Authorization\": f\"Bearer {os.environ['NEXTAPI_KEY']}\"},\n" +
			"    json=payload,\n" +
			")\n" +
			"response.raise_for_status()\n" +
			"print(response.json())",
	}, nil
}

func (s *Service) validateWorkflowJSON(raw json.RawMessage) error {
	if len(raw) == 0 {
		return fmt.Errorf("%w: workflow_json is required", ErrInvalidWorkflow)
	}
	var def Definition
	if err := json.Unmarshal(raw, &def); err != nil {
		return fmt.Errorf("%w: invalid workflow_json", ErrInvalidWorkflow)
	}
	if len(def.Nodes) == 0 {
		return fmt.Errorf("%w: at least one node is required", ErrInvalidWorkflow)
	}
	return nil
}

func (s *Service) createVersion(ctx context.Context, workflowID string, raw json.RawMessage, note string, createdBy *string) (*domain.WorkflowVersion, error) {
	var maxVersion int
	if err := s.db.WithContext(ctx).
		Model(&domain.WorkflowVersion{}).
		Where("workflow_id = ?", workflowID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion).Error; err != nil {
		return nil, err
	}
	version := domain.WorkflowVersion{
		WorkflowID:   workflowID,
		Version:      maxVersion + 1,
		WorkflowJSON: raw,
		ChangeNote:   &note,
		CreatedBy:    createdBy,
	}
	if err := s.db.WithContext(ctx).Create(&version).Error; err != nil {
		return nil, err
	}
	return &version, nil
}

func noteString(note *string, fallback string) string {
	if note == nil || strings.TrimSpace(*note) == "" {
		return fallback
	}
	return strings.TrimSpace(*note)
}

func uniqueSlug(name string) string {
	base := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range base {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if ok {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "canvas-template"
	}
	return out + "-" + strconv.FormatInt(time.Now().UnixNano(), 36)
}

func (s *Service) validateProject(ctx context.Context, orgID string, projectID *string) error {
	if projectID == nil || *projectID == "" {
		return nil
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&domain.Project{}).
		Where("id = ? AND org_id = ?", *projectID, orgID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("%w: project not found", ErrInvalidWorkflow)
	}
	return nil
}

func (s *Service) failQueuedJobAfterVideoWriteError(jobID string, orgID string, apiKeyID *string, reservedCents int64) {
	bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	now := time.Now()
	_ = s.db.WithContext(bgCtx).Model(&domain.Job{}).
		Where("id = ?", jobID).
		Updates(map[string]any{
			"status":        domain.JobFailed,
			"error_code":    "video_record_failed",
			"error_message": "could not persist workflow video record",
			"completed_at":  now,
		}).Error
	if s.throughput != nil {
		_ = s.throughput.ReleaseForKey(bgCtx, orgID, apiKeyID, jobID)
	}
	if reservedCents <= 0 {
		return
	}
	refundCents := reservedCents
	_ = s.db.WithContext(bgCtx).Create(&domain.CreditsLedger{
		OrgID:        orgID,
		DeltaCredits: reservedCents,
		DeltaCents:   &refundCents,
		Reason:       domain.ReasonRefund,
		JobID:        &jobID,
		Note:         "refund: workflow video record write failed",
	}).Error
}
