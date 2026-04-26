-- +goose Up
-- +goose StatementBegin

INSERT INTO templates (
    name,
    slug,
    description,
    category,
    default_aspect_ratio,
    default_duration,
    input_schema,
    workflow_json,
    recommended_inputs_schema,
    visibility,
    estimated_cost_cents
) VALUES
(
    '短剧爆款模板',
    'short-drama-production-v1',
    '上传男女主图和剧情关键词，一键生成短剧情绪视频。',
    'short_drama',
    '9:16',
    5,
    '[{"key":"female_image","label":"女主图","type":"image"},{"key":"male_image","label":"男主图","type":"image"},{"key":"scene","label":"场景","type":"text"},{"key":"plot","label":"剧情关键词","type":"text"}]',
    '{"name":"短剧爆款模板","model":"seedance-2.0-pro","nodes":[{"id":"female_image","type":"image.input","position":{"x":40,"y":80},"data":{"template_key":"female_image","label":"女主图","image_type":"character"}},{"id":"male_image","type":"image.input","position":{"x":40,"y":240},"data":{"template_key":"male_image","label":"男主图","image_type":"reference"}},{"id":"prompt","type":"prompt.input","position":{"x":40,"y":400},"data":{"template_key":"prompt","label":"剧情提示词","prompt":"短剧模板占位提示词"}},{"id":"params","type":"video.params","position":{"x":360,"y":240},"data":{"template_key":"params","label":"视频参数","duration":5,"aspect_ratio":"9:16","resolution":"1080p","consistency_mode":"character"}},{"id":"video","type":"seedance.video","position":{"x":680,"y":240},"data":{"label":"Seedance 视频","model":"seedance-2.0-pro"}},{"id":"output","type":"output.preview","position":{"x":980,"y":240},"data":{"label":"输出预览"}}],"edges":[{"source":"female_image","target":"video"},{"source":"male_image","target":"video"},{"source":"prompt","target":"video"},{"source":"params","target":"video"},{"source":"video","target":"output"}]}',
    '[{"key":"female_image","label":"女主图","type":"image","target_node_id":"female_image"},{"key":"male_image","label":"男主图","type":"image","target_node_id":"male_image"},{"key":"scene","label":"场景","type":"text","target_node_id":"prompt"},{"key":"plot","label":"剧情关键词","type":"text","target_node_id":"prompt"}]',
    'system',
    500
),
(
    '电商商品视频模板',
    'ecommerce-product-production-v1',
    '上传商品图和卖点，快速生成可投放商品视频素材。',
    'ecommerce',
    '9:16',
    5,
    '[{"key":"product_image","label":"商品图","type":"image"},{"key":"selling_points","label":"商品卖点","type":"text"},{"key":"model_style","label":"模特风格","type":"text"},{"key":"scene","label":"场景","type":"text"}]',
    '{"name":"电商商品视频模板","model":"seedance-2.0-pro","nodes":[{"id":"product_image","type":"image.input","position":{"x":40,"y":120},"data":{"template_key":"product_image","label":"商品图","image_type":"reference"}},{"id":"prompt","type":"prompt.input","position":{"x":40,"y":320},"data":{"template_key":"prompt","label":"广告提示词","prompt":"电商模板占位提示词"}},{"id":"params","type":"video.params","position":{"x":360,"y":240},"data":{"template_key":"params","label":"视频参数","duration":5,"aspect_ratio":"9:16","resolution":"1080p"}},{"id":"video","type":"seedance.video","position":{"x":680,"y":240},"data":{"label":"Seedance 视频","model":"seedance-2.0-pro"}},{"id":"output","type":"output.preview","position":{"x":980,"y":240},"data":{"label":"输出预览"}}],"edges":[{"source":"product_image","target":"video"},{"source":"prompt","target":"video"},{"source":"params","target":"video"},{"source":"video","target":"output"}]}',
    '[{"key":"product_image","label":"商品图","type":"image","target_node_id":"product_image"},{"key":"selling_points","label":"商品卖点","type":"text","target_node_id":"prompt"},{"key":"model_style","label":"模特风格","type":"text","target_node_id":"prompt"},{"key":"scene","label":"场景","type":"text","target_node_id":"prompt"}]',
    'system',
    500
),
(
    '口播达人模板',
    'talking-creator-production-v1',
    '上传人物图和口播文案，生成账号矩阵口播素材。',
    'talking_creator',
    '9:16',
    5,
    '[{"key":"character_image","label":"人物图","type":"image"},{"key":"script","label":"口播文案","type":"text"},{"key":"tone","label":"语气风格","type":"text"},{"key":"background","label":"背景","type":"text"}]',
    '{"name":"口播达人模板","model":"seedance-2.0-pro","nodes":[{"id":"character_image","type":"image.input","position":{"x":40,"y":120},"data":{"template_key":"character_image","label":"人物图","image_type":"character"}},{"id":"prompt","type":"prompt.input","position":{"x":40,"y":320},"data":{"template_key":"prompt","label":"口播提示词","prompt":"口播模板占位提示词"}},{"id":"params","type":"video.params","position":{"x":360,"y":240},"data":{"template_key":"params","label":"视频参数","duration":5,"aspect_ratio":"9:16","resolution":"1080p","consistency_mode":"character"}},{"id":"video","type":"seedance.video","position":{"x":680,"y":240},"data":{"label":"Seedance 视频","model":"seedance-2.0-pro"}},{"id":"output","type":"output.preview","position":{"x":980,"y":240},"data":{"label":"输出预览"}}],"edges":[{"source":"character_image","target":"video"},{"source":"prompt","target":"video"},{"source":"params","target":"video"},{"source":"video","target":"output"}]}',
    '[{"key":"character_image","label":"人物图","type":"image","target_node_id":"character_image"},{"key":"script","label":"口播文案","type":"text","target_node_id":"prompt"},{"key":"tone","label":"语气风格","type":"text","target_node_id":"prompt"},{"key":"background","label":"背景","type":"text","target_node_id":"prompt"}]',
    'system',
    500
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    default_aspect_ratio = EXCLUDED.default_aspect_ratio,
    default_duration = EXCLUDED.default_duration,
    input_schema = EXCLUDED.input_schema,
    workflow_json = EXCLUDED.workflow_json,
    recommended_inputs_schema = EXCLUDED.recommended_inputs_schema,
    visibility = EXCLUDED.visibility,
    estimated_cost_cents = EXCLUDED.estimated_cost_cents,
    updated_at = now();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM templates
WHERE slug IN (
    'short-drama-production-v1',
    'ecommerce-product-production-v1',
    'talking-creator-production-v1'
);
-- +goose StatementEnd
