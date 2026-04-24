-- +goose Up
-- +goose StatementBegin

-- ─── 1. Templates table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID        REFERENCES orgs(id),
    name                  TEXT        NOT NULL,
    slug                  TEXT        NOT NULL UNIQUE,
    description           TEXT,
    cover_image_url       TEXT,
    category              TEXT        NOT NULL DEFAULT 'general',
    default_model         TEXT        NOT NULL DEFAULT 'seedance-2.0-pro',
    default_resolution    TEXT        NOT NULL DEFAULT '1080p',
    default_duration      INT         NOT NULL DEFAULT 5,
    default_aspect_ratio  TEXT        NOT NULL DEFAULT '16:9',
    default_max_parallel  INT         NOT NULL DEFAULT 5,
    input_schema          JSONB       NOT NULL DEFAULT '[]',
    default_prompt_template TEXT,
    visibility            TEXT        NOT NULL DEFAULT 'private',
    pricing_multiplier    NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(org_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_visibility ON templates(visibility);

-- ─── 2. Link batch_runs to templates ─────────────────────────────────────
ALTER TABLE batch_runs ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id);

-- ─── 3. Seed system templates ────────────────────────────────────────────
INSERT INTO templates (name, slug, category, default_aspect_ratio, default_duration, visibility)
VALUES
    ('短剧横屏', 'short-drama-16x9', 'short_drama', '16:9', 5, 'system'),
    ('短剧竖屏', 'short-drama-9x16', 'short_drama', '9:16', 5, 'system'),
    ('电商产品视频', 'ecommerce-product', 'ecommerce', '16:9', 5, 'system'),
    ('图生视频', 'image-to-video', 'image_to_video', '16:9', 5, 'system'),
    ('真人口播', 'real-person-talking', 'real_person', '9:16', 10, 'system')
ON CONFLICT (slug) DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE batch_runs DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS templates;
-- +goose StatementEnd
