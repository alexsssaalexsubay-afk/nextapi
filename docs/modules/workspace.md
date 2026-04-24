# Workspace — 项目 + 素材库

## 目的

给短剧/电商团队提供轻量级项目管理：
项目 → 角色/场景素材库 → 分镜表 → 批量生成。

不做重型 DAM（数字资产管理），只做"够用"的素材组织。

## 数据模型

### projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### project_assets

```sql
CREATE TABLE project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('character','scene','prop','reference')),
  name TEXT NOT NULL,
  image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### batch_runs 关联

```sql
ALTER TABLE batch_runs ADD COLUMN project_id UUID REFERENCES projects(id);
```

## API

### Projects
- `GET /v1/projects` — 列出 org 的项目
- `POST /v1/projects` — 创建项目
- `GET /v1/projects/:id` — 项目详情
- `PATCH /v1/projects/:id` — 更新项目
- `DELETE /v1/projects/:id` — 删除项目

### Project Assets
- `GET /v1/projects/:id/assets` — 列出项目素材
- `POST /v1/projects/:id/assets` — 添加素材
- `DELETE /v1/projects/:id/assets/:assetId` — 删除素材

## Dashboard

### /projects 页面
- 项目卡片列表（名称、描述、创建时间、批次数）
- 新建项目按钮

### /projects/:id 页面
- 项目信息头部
- 素材库 tab（角色、场景、道具、参考图）
- 分镜编辑器 tab（复用 shot-editor 组件）
- 批次历史 tab
- "从这个项目生成批次"按钮
