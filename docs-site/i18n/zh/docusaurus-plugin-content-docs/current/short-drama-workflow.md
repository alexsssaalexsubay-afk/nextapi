---
title: 短剧制作工作流
sidebar_label: 短剧工作流
description: 从剧本到成片的六阶段短剧 AI 制作流程。
---

# 短剧制作工作流

本文介绍使用 NextAPI 生产短剧内容的完整六阶段流程——从角色定稿到剪辑输出。适合 5–30 分钟的短剧集，单集场景在 15–50 条镜头之间。

---

## 整体流程图

```
1. 角色定案 → 2. 场景设计 → 3. 拍摄清单 → 4. 预检与测试 → 5. 正式批量 → 6. 剪辑输出
```

---

## 第一阶段：角色定案

**目标：确定每个主要角色的视觉固定特征，建立角色档案。**

在正式写清单之前，先把每个主角的外形落实成文字并选好参考图。这一步做好，后面所有镜头的一致性才有保障。

### 角色档案表（character_bible.csv）

```csv
character_id,name_cn,name_en,physical_traits,default_prompt_prefix,ref_image,notes
char_lin,林悦,Lin Yue,"左眼下方小痣，珍珠耳钉，直发","Lin Yue, mole below left eye, pearl stud earrings",char_lin.jpg,主角
char_chen,陈默,Chen Mo,"高挑，轮廓分明，寸头","Chen Mo, tall, sharp jaw, short neat hair",char_chen.jpg,男主角
```

### 参考图要求

- **正面、均匀光线、单人入镜**
- 最小分辨率 512×512，推荐 1024×1024
- 每套主要服装单独准备一张服装图（不要靠角色图兼顾换装）

---

## 第二阶段：场景设计

**目标：定义每个主要场景的视觉风格，准备场景参考图。**

### 场景档案表（scene_bible.csv）

```csv
scene_id,location_cn,location_en,lighting,atmosphere,ref_image,typical_aspect_ratio
scene_cafe,晨间咖啡馆,Morning Cafe,暖调阳光/晨光从左侧入射,温馨亲密,cafe_morning.jpg,9:16
scene_office,公司办公室,Office,冷色日光灯,紧张专业,office_day.jpg,16:9
scene_rain,夜雨街头,Rainy Street,霓虹反光/冷蓝色调,忧郁戏剧,rain_street.jpg,9:16
```

场景参考图是整集视觉统一性的基础。同一个场地在所有镜头中都用同一张 `scene_ref`。

---

## 第三阶段：拍摄清单

**目标：把剧本分解成单条镜头的 CSV 行。**

### 清单结构

参考 `toolkit/short_drama_pack/sample_data/shot_manifest.csv`，推荐结构如下：

```csv
episode,scene_id,shot_id,continuity_group,character_id,character_ref,outfit_ref,scene_ref,prompt_en,camera,motion,mood,duration,aspect_ratio,negative_prompt
```

### 拆镜头的基本原则

每一行代表一个**单镜头**。如果一个场景有三种景别（远景建立、中景对话、特写反应），就拆成三行。

| 镜头类型 | 时长建议 | 景别 |
|---------|---------|------|
| 建立镜头 | 4–6 秒 | 全景/远景 |
| 对话镜头 | 4–5 秒 | 中景/半身 |
| 反应镜头 | 3–4 秒 | 近景/特写 |
| 情绪镜头 | 3–5 秒 | 特写 |

### 写提示词的公式

```
[角色固定特征] — [动作] ; [镜头描述] ; [光线/氛围] ; [情绪]
```

示例：

```
Lin Yue, mole below left eye, pearl stud earrings — 
spots Chen Mo across the cafe and hesitates;
medium shot, slight push-in;
warm backlight from the window;
uncertain, heart fluttering
```

---

## 第四阶段：预检与测试

**目标：在花完整预算之前，确认一切设置正确。**

### 检查清单

- [ ] 所有角色参考图已上传，文件名和 CSV 里的完全一致
- [ ] 每个场景都有 `scene_ref`
- [ ] 每个服装版本都有 `outfit_ref`
- [ ] 连贯组命名规范一致（建议格式：`集号_场景_角色`）
- [ ] 每条提示词都包含角色固定特征前缀
- [ ] `negative_prompt` 在所有行保持统一
- [ ] 在 Batch Studio 里点击**验证 CSV**，无红色错误

### 快速测试

从每个主要场景各取 1 条镜头，单独跑一次快速测试。**视觉确认**：

- 角色面部特征是否正确
- 服装颜色和款式是否符合预期
- 场景氛围是否和参考图匹配

:::warning 不要跳过这一步
100 条镜头中，第 1 条的问题不发现，其余 99 条会犯同样的错。
:::

---

## 第五阶段：正式批量生成

**目标：高效完成全集镜头的生成与下载。**

### 并发设置建议

| 镜头数 | 推荐并发 | 预计时间 |
|--------|---------|---------|
| ≤ 30   | 5       | 10–25 分钟 |
| 30–100 | 5–8     | 25–60 分钟 |
| 100+   | 8–12（稳定后再调） | 60–180 分钟 |

### 批次拆分建议

超过 100 条镜头时，建议按集数或场景拆分成多个批次，每批 50–80 条。好处：

- 单批失败影响范围小
- 可以边跑边预览已完成的镜头
- 文件管理更清晰

### 处理失败镜头

批次完成后，用 **🔁 仅重试失败项** 处理失败行，不影响成功的镜头。常见原因和处理：

- **内容审核拦截**：调整提示词措辞后重试
- **超时**：服务端拥堵，稍等片刻直接重试
- **余额不足**：充值后继续，失败的积分会退回

---

## 第六阶段：剪辑输出

**目标：整理素材，交付剪辑团队或完成后期。**

### 输出目录结构

```
output/
├── batch_ep01_20260423/
│   ├── ep01_s01_001.mp4
│   ├── ep01_s01_002.mp4
│   ├── ...
│   └── result_manifest.csv
├── batch_ep01_retry_20260423/
│   └── ep01_s01_045.mp4   ← 重试成功的镜头
└── batch_ep02_20260424/
    ├── ep02_s01_001.mp4
    └── ...
```

### 交付给剪辑的建议

1. 导出 `result_manifest.csv`，用于素材追踪
2. 按集数整理 MP4 文件夹
3. 附上角色档案和场景档案，方便补拍时保持一致性
4. 记录本集使用的参考图版本（角色和服装图有可能迭代）

---

## 生产建议

### 第一集先做小样本

新项目第一集先做 10–15 条测试镜头，确认整体风格和角色还原度，再全集推进。

### 主镜头优先

先拍对叙事最重要的镜头（高潮、情感转折点），再拍过场和建立镜头。如果总镜头数不得不削减，可以在过场镜头上节省，不影响核心叙事。

### 反向提示词要统一

全集统一使用同一套反向提示词，输出质量会更稳定：

```
watermark, distorted face, extra fingers, extra limbs, low quality, blur, text overlay
```
