-- +goose Up
-- +goose StatementBegin

WITH catalog(slug, name, description, category, aspect_ratio, duration_seconds, estimated_cents, prompt_template) AS (
  VALUES
    ('short-drama-reversal-hook-v1', '3 分钟反转短剧', '把一句冲突梗概拆成强钩子、情绪递进和结尾反转的短剧测试片。', 'short_drama', '9:16', 8, 800, '短剧反转开场：前三秒给出强冲突，中段用特写和对视升级情绪，结尾留下反转钩子。画面真实、人物一致、节奏紧凑。'),
    ('short-drama-suspense-cold-open-v1', '悬疑冷开场', '适合悬疑、推理、惊悚账号的 10 秒冷开场分镜。', 'short_drama', '9:16', 10, 900, '悬疑冷开场：雨夜、证据特写、主角发现异常、镜头缓慢推进，最后停在一个未解释的线索上。电影感、低饱和、紧张。'),
    ('short-drama-romance-conflict-v1', '甜宠冲突短剧', '用误会、对视和情绪释放生成甜宠/霸总类短剧素材。', 'short_drama', '9:16', 8, 800, '甜宠短剧冲突：男女主在高级室内场景中发生误会，先冷峻对峙，再出现细微心动表情，镜头强调眼神和手部动作。'),
    ('short-drama-dialogue-two-shot-v1', '双人对白分镜', '适合多角色对话、访谈式剧情和账号连续剧。', 'short_drama', '9:16', 8, 800, '双人对白分镜：A/B 角色交替近景，中景交代关系，情绪从克制到爆发，镜头稳定、表情自然、人物服装一致。'),
    ('ecommerce-product-hero-v1', '商品英雄短片', '用商品图生成开箱、材质、使用场景和购买 CTA。', 'ecommerce', '9:16', 6, 600, '商品英雄短片：商品从干净背景中被自然拿起，展示材质细节和核心卖点，光影高级，最后出现适合社媒投放的 CTA 氛围。'),
    ('ecommerce-fashion-tryon-v1', '服饰上身种草', '适合服饰、鞋包、配饰的模特上身视频。', 'ecommerce', '9:16', 8, 800, '服饰上身种草：模特自然走动，镜头从全身到细节，突出剪裁、材质、搭配和生活方式场景。真实光线，高级社媒广告感。'),
    ('ecommerce-beauty-before-after-v1', '美妆前后对比', '适合护肤、彩妆、个护产品的对比式短片。', 'ecommerce', '9:16', 7, 700, '美妆前后对比：先展示质地和上脸细节，再展示自然变化和完成效果，镜头干净、肤质真实、不过度夸张。'),
    ('ecommerce-home-lifestyle-v1', '家居生活方式', '适合家居、香氛、灯具、小家电的氛围短片。', 'ecommerce', '16:9', 8, 800, '家居生活方式广告：温暖空间、产品融入真实生活场景，慢推镜头、细节特写、氛围光，突出舒适和品质感。'),
    ('talking-knowledge-hook-v1', '知识口播爆点', '适合知识博主把观点拆成强钩子口播。', 'talking_creator', '9:16', 8, 800, '知识口播短片：开头一句反常识观点，中间给出三点解释，结尾总结行动建议。人物自然面对镜头，字幕节奏清晰。'),
    ('talking-founder-story-v1', '创始人出镜介绍', '适合 SaaS、品牌和产品创始人讲使命与产品价值。', 'talking_creator', '16:9', 10, 900, '创始人出镜介绍：创始人在简洁工作室中讲述一个真实问题、为什么现在解决、产品带来的变化。镜头稳重、有信任感。'),
    ('talking-sales-ugc-v1', '带货 UGC 口播', '适合短视频带货、测评和达人矩阵。', 'talking_creator', '9:16', 7, 700, 'UGC 口播广告：真实自拍视频风格，先说痛点，再展示产品解决过程和结果，语气自然可信，最后轻 CTA。'),
    ('ad-brand-15s-v1', '15 秒品牌广告', '把品牌卖点变成视觉隐喻和高记忆点广告。', 'advertising', '16:9', 10, 900, '15 秒品牌广告：开场用强视觉隐喻表达痛点，中段展示转变，结尾留出品牌口号和产品出现的空间。高级、克制、有记忆点。'),
    ('ad-ugc-native-v1', 'UGC 原生广告', '适合信息流投放的真实用户视角广告。', 'advertising', '9:16', 7, 700, 'UGC 原生广告：普通用户在真实场景中发现问题、试用产品、表达惊喜，镜头手持自然，避免过度广告感。'),
    ('ad-festival-promo-v1', '节日促销广告', '适合节日活动、礼盒、限时优惠和倒计时。', 'advertising', '9:16', 8, 800, '节日促销广告：礼盒、灯光、节日氛围、产品特写和倒计时情绪，画面温暖、有购买冲动。'),
    ('ad-outdoor-billboard-v1', '户外大屏广告', '适合大字报、品牌露出和 3 秒可读创意。', 'advertising', '16:9', 5, 500, '户外大屏广告：极简大字、强对比色、产品或品牌核心视觉，三秒内可理解，镜头模拟城市大屏展示。'),
    ('launch-teaser-countdown-v1', '新品发布预告', '适合新品、App、硬件和内容 IP 的悬念预告。', 'product_launch', '16:9', 8, 800, '新品发布预告：倒计时、局部特写、快速闪回、神秘光影，最后停在即将发布的视觉上，不提前露出全部信息。'),
    ('launch-saas-feature-v1', 'SaaS 功能发布', '把软件新功能讲成问题、演示、收益和 CTA。', 'product_launch', '16:9', 8, 800, 'SaaS 功能发布片：先展示用户痛点，再用干净界面动效演示功能，最后用结果数字和 CTA 收束。专业、可信。'),
    ('launch-app-preview-v1', 'App 预览视频', '适合应用商店、落地页和社媒投放。', 'product_launch', '9:16', 8, 800, 'App 预览视频：手机界面动效、核心功能三连展示、真实使用场景和评分口碑氛围，节奏轻快。'),
    ('launch-hardware-reveal-v1', '硬件发布片', '适合设备、穿戴、消费电子和智能硬件。', 'product_launch', '16:9', 8, 800, '硬件发布片：金属/玻璃材质特写、结构线条、真实使用场景、参数卡片空间，画面冷静高级。'),
    ('education-five-step-tutorial-v1', '五步教程视频', '把复杂操作拆成清晰步骤和错误提醒。', 'education', '16:9', 10, 900, '五步教程视频：每一步都有清晰画面、编号、操作提示和常见错误提醒，节奏稳定，适合教学和产品教程。'),
    ('education-course-promo-v1', '课程宣传片', '适合知识付费、训练营和公开课预热。', 'education', '9:16', 8, 800, '课程宣传片：提出学习痛点，展示课程结构、讲师可信背书和学习成果，结尾鼓励报名。'),
    ('education-lab-demo-v1', '实验操作演示', '适合实验、手工、厨房、设备操作类内容。', 'education', '16:9', 10, 900, '实验操作演示：材料摆放、步骤特写、注意事项和结果展示，镜头清楚，手部动作稳定，避免杂乱背景。'),
    ('education-concept-animation-v1', '概念解释动画', '用比喻和图解解释抽象概念。', 'education', '16:9', 8, 800, '概念解释动画：用一个生活化比喻解释抽象概念，画面包含图解、流程箭头和重点文字空间。'),
    ('game-character-card-v1', '游戏角色设定卡', '适合角色、武器、技能和待机动作展示。', 'game_animation', '16:9', 8, 800, '游戏角色设定卡：角色站姿、武器特写、技能释放瞬间、UI 卡片空间，风格统一，适合宣传 PV。'),
    ('game-pixel-cutscene-v1', '像素风过场动画', '适合复古游戏、独立游戏和剧情过场。', 'game_animation', '16:9', 8, 800, '像素风过场动画：角色进入场景、对白框出现、关键道具发光、镜头横向移动，复古但清晰。'),
    ('anime-opening-shotlist-v1', '动漫 OP 分镜', '适合群像、角色切换和音乐节奏感镜头。', 'game_animation', '16:9', 10, 900, '动漫 OP 分镜：角色群像、快速切镜、风吹头发、跑动、强光过渡，节奏贴合音乐高潮。'),
    ('game-boss-entrance-v1', 'Boss 登场短片', '适合反派、怪物和游戏关卡宣传。', 'game_animation', '16:9', 8, 800, 'Boss 登场短片：环境压迫感、巨大阴影、局部特写、能量爆发和标题卡空间，镜头震撼。'),
    ('brand-origin-story-v1', '品牌起源故事', '讲清品牌为什么诞生、解决什么问题。', 'brand_story', '16:9', 10, 900, '品牌起源故事：从真实痛点开始，展示创始瞬间、第一次解决方案、今天的使命，画面温暖可信。'),
    ('brand-customer-case-v1', '用户案例纪录片', '适合 B2B 客户案例、成功故事和销售素材。', 'brand_story', '16:9', 10, 900, '用户案例纪录片：用户背景、挑战、解决过程、成果数字，画面真实，有采访和场景 B-roll 感。'),
    ('brand-team-culture-v1', '团队文化短片', '适合招聘、企业文化和团队建设。', 'brand_story', '16:9', 8, 800, '团队文化短片：真实办公协作、白板讨论、产品演示、团队笑容和使命口号，可信不浮夸。'),
    ('social-tiktok-hook-v1', 'TikTok/Reels 爆款钩子', '前三秒制造冲突、好奇和停留。', 'social', '9:16', 5, 500, '社媒爆款钩子：前三秒强反差、快速字幕空间、表情/动作抓人，中间展示关键变化，最后停在悬念。'),
    ('social-xiaohongshu-cover-v1', '小红书封面视频', '适合生活方式、攻略、测评类封面短片。', 'social', '9:16', 5, 500, '小红书封面视频：干净构图、标题留白、生活方式场景、柔和色彩，前两秒就能看懂主题。'),
    ('social-comparison-review-v1', '对比测评视频', '适合 A/B 对比、测评和种草结论。', 'social', '9:16', 8, 800, '对比测评视频：左右或前后对比，展示维度、评分和结论，镜头清楚，避免夸张虚假。'),
    ('social-trend-react-v1', '热点借势模板', '把热点话题转成品牌可用的短视频创意。', 'social', '9:16', 6, 600, '热点借势短片：先给热点语境，再自然连接品牌观点或产品场景，节奏快，避免误导和过度蹭热点。')
)
INSERT INTO templates (
  name,
  slug,
  description,
  category,
  default_model,
  default_resolution,
  default_aspect_ratio,
  default_duration,
  input_schema,
  workflow_json,
  recommended_inputs_schema,
  visibility,
  estimated_cost_cents
)
SELECT
  name,
  slug,
  description,
  category,
  'seedance-2.0-pro',
  '1080p',
  aspect_ratio,
  duration_seconds,
  jsonb_build_array(
    jsonb_build_object(
      'key', 'prompt',
      'label', '创意简报',
      'type', 'textarea',
      'required', true,
      'placeholder', prompt_template
    )
  ),
  jsonb_build_object(
    'name', name,
    'model', 'seedance-2.0-pro',
    'metadata', jsonb_build_object('source', 'system_template_catalog', 'template_slug', slug),
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'id', 'prompt',
        'type', 'prompt.input',
        'position', jsonb_build_object('x', 40, 'y', 160),
        'data', jsonb_build_object('template_key', 'prompt', 'label', '创意简报', 'prompt', prompt_template)
      ),
      jsonb_build_object(
        'id', 'params',
        'type', 'video.params',
        'position', jsonb_build_object('x', 360, 'y', 160),
        'data', jsonb_build_object('template_key', 'params', 'label', '视频参数', 'duration', duration_seconds, 'aspect_ratio', aspect_ratio, 'resolution', '1080p')
      ),
      jsonb_build_object(
        'id', 'video',
        'type', 'seedance.video',
        'position', jsonb_build_object('x', 680, 'y', 160),
        'data', jsonb_build_object('label', 'Seedance 视频', 'model', 'seedance-2.0-pro')
      ),
      jsonb_build_object(
        'id', 'output',
        'type', 'output.preview',
        'position', jsonb_build_object('x', 980, 'y', 160),
        'data', jsonb_build_object('label', '输出预览')
      )
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('source', 'prompt', 'target', 'video'),
      jsonb_build_object('source', 'params', 'target', 'video'),
      jsonb_build_object('source', 'video', 'target', 'output')
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'key', 'prompt',
      'label', '创意简报',
      'type', 'textarea',
      'required', true,
      'placeholder', prompt_template
    )
  ),
  'system',
  estimated_cents
FROM catalog
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_model = EXCLUDED.default_model,
  default_resolution = EXCLUDED.default_resolution,
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
  'short-drama-reversal-hook-v1',
  'short-drama-suspense-cold-open-v1',
  'short-drama-romance-conflict-v1',
  'short-drama-dialogue-two-shot-v1',
  'ecommerce-product-hero-v1',
  'ecommerce-fashion-tryon-v1',
  'ecommerce-beauty-before-after-v1',
  'ecommerce-home-lifestyle-v1',
  'talking-knowledge-hook-v1',
  'talking-founder-story-v1',
  'talking-sales-ugc-v1',
  'ad-brand-15s-v1',
  'ad-ugc-native-v1',
  'ad-festival-promo-v1',
  'ad-outdoor-billboard-v1',
  'launch-teaser-countdown-v1',
  'launch-saas-feature-v1',
  'launch-app-preview-v1',
  'launch-hardware-reveal-v1',
  'education-five-step-tutorial-v1',
  'education-course-promo-v1',
  'education-lab-demo-v1',
  'education-concept-animation-v1',
  'game-character-card-v1',
  'game-pixel-cutscene-v1',
  'anime-opening-shotlist-v1',
  'game-boss-entrance-v1',
  'brand-origin-story-v1',
  'brand-customer-case-v1',
  'brand-team-culture-v1',
  'social-tiktok-hook-v1',
  'social-xiaohongshu-cover-v1',
  'social-comparison-review-v1',
  'social-trend-react-v1'
);

-- +goose StatementEnd
