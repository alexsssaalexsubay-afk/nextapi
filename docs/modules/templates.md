# Templates — 模板封装系统

## 目的

把 Seedance API 能力封装成"短剧模板""电商模板""图生视频模板"等预设，
让用户不需要面对原始 API 参数，选模板 → 上传素材 → 点生成。

## 数据模型

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id),  -- NULL = 系统模板
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  default_model TEXT NOT NULL DEFAULT 'seedance-2.0-pro',
  default_resolution TEXT NOT NULL DEFAULT '1080p',
  default_duration INT NOT NULL DEFAULT 5,
  default_aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  default_max_parallel INT NOT NULL DEFAULT 5,
  input_schema JSONB NOT NULL DEFAULT '[]',
  default_prompt_template TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  pricing_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 字段说明

- `org_id`: NULL 表示系统模板（管理员创建），非 NULL 表示 org 私有模板
- `category`: general / short_drama / ecommerce / real_person / image_to_video
- `input_schema`: JSON 数组，定义用户需要填的字段（prompt、image_url 等）
- `default_prompt_template`: 带占位符的 prompt 模板，如 `{character} walks into {scene}`
- `visibility`: public（所有人可见）/ private（仅创建者 org）/ system（系统模板）
- `pricing_multiplier`: 计费倍率，1.00 = 标准价

### batch_runs 关联

```sql
ALTER TABLE batch_runs ADD COLUMN template_id UUID REFERENCES templates(id);
```

## API

### GET /v1/templates
列出当前 org 可用的模板（系统模板 + org 私有模板）。

### GET /v1/templates/:id
获取模板详情。

### POST /v1/templates (admin)
创建系统模板。

### POST /v1/templates (org)
创建 org 私有模板。

### PATCH /v1/templates/:id
更新模板。

### DELETE /v1/templates/:id
删除模板。

## Dashboard 集成

Batch Studio 页面加模板选择器：
1. 在 CSV 上传之前，展示模板卡片列表
2. 选择模板后，自动预填 model、resolution、duration、aspect_ratio
3. 如果模板有 default_prompt_template，在 shot editor 里预填

## 预置系统模板

| slug | name | category | defaults |
|------|------|----------|----------|
| short-drama-16x9 | 短剧横屏 | short_drama | 16:9, 5s, 1080p |
| short-drama-9x16 | 短剧竖屏 | short_drama | 9:16, 5s, 1080p |
| ecommerce-product | 电商产品视频 | ecommerce | 16:9, 5s, 1080p |
| image-to-video | 图生视频 | image_to_video | 16:9, 5s, 1080p |
| real-person-talking | 真人口播 | real_person | 9:16, 10s, 1080p |
