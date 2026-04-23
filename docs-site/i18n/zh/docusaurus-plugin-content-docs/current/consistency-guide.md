---
title: 角色一致性
sidebar_label: 角色一致性
description: 使用参考图和连贯组，在批量生成的镜头中保持角色形象稳定。
---

# 角色一致性

视频 AI 模型默认每次生成都是独立的，不知道上一条镜头里的角色长什么样。要让同一个角色在不同镜头里"认得出来"，需要两个配合使用的机制：

1. **参考图** — 告诉模型角色的视觉外貌
2. **提示词中的固定特征描述** — 文字层面锚定角色身份

---

## 参考图

参考图是角色的"视觉锚点"。每条需要保持角色一致的镜头，都应该带上对应的参考图链接。

### 三种参考图类型

| 类型 | CSV 列名 | 控制什么 |
|------|---------|---------|
| 角色图 | `character_ref` | 面部特征、发型、皮肤色调 |
| 服装图 | `outfit_ref` | 单套服装/造型 |
| 场景图 | `scene_ref` | 背景、场地、环境 |

### 好的参考图长什么样

- **正面、光线均匀**：避免侧脸、强烈背光、五官被遮挡
- **最小分辨率 512×512**，推荐 1024×1024 以上
- **单人入镜**，无人群、无文字水印
- **服装图和角色图分开**：如果需要换装，不要只靠角色图

### 在 Batch Studio 中上传参考图

在侧边栏的 **参考图** 区域上传图片文件。上传后，在 CSV 的对应列填写文件名（不含路径）：

```csv
character_ref,outfit_ref,scene_ref
char_lin.jpg,outfit_white_coat.jpg,cafe_morning.jpg
```

或者直接使用 `https://` 链接：

```csv
character_ref
https://cdn.yoursite.com/char_lin.jpg
```

---

## 连贯组

**连贯组**（`continuity_group`）是 Batch Studio 的逻辑分组机制。同一个连贯组内的镜头会自动把第一行出现的参考图信息继承给后续没有单独填写参考图的行。

### 示例：三个连贯组

```csv
shot_id,continuity_group,character_ref,outfit_ref,prompt_en
ep01_s01_001,ep01_s01_lin_cafe,char_lin.jpg,white_coat.jpg,"Lin Yue enters the cafe"
ep01_s01_002,ep01_s01_lin_cafe,,,           "Lin Yue sits down at the table"
ep01_s01_003,ep01_s01_lin_cafe,,,           "Lin Yue stirs her coffee"
ep01_s03_001,ep01_s03_lin_office,char_lin.jpg,suit_jacket.jpg,"Lin Yue at her desk"
ep01_s03_002,ep01_s03_lin_office,,,          "Lin Yue reads documents"
ep02_s01_001,ep02_s01_chen,char_chen.jpg,dark_coat.jpg,"Chen Mo waits in the rain"
```

- 第 2、3 行的 `character_ref` 为空 → 自动继承第 1 行的 `char_lin.jpg`
- 第 4 行换了一套服装 `suit_jacket.jpg` → 开始新的连贯组
- 在 Batch Studio 的结果表格中，继承的字段会以**蓝色高亮**显示

:::tip 一个场景-角色组合 = 一个连贯组
同一个角色在不同场景出现时，要用不同的连贯组名称。把不同场景放同一组会让模型产生视觉混淆。
:::

---

## 提示词中的固定特征描述

**参考图不够用**，必须在每条提示词里重复描述角色的固定视觉特征。

### 角色特征描述模板

```
[角色名], [面部特征], [发型], [特征性配饰] — [动作描述]
```

示例：

```
Lin Yue, mole below left eye, pearl stud earrings, straight black hair — 
walks into the sunlit corner cafe and stops at the window table
```

这几个固定特征（左眼下方的痣、珍珠耳钉）是关键锚点，帮助模型在每一条镜头里保持相同的人物外貌。

### 建立角色档案

建议为每个主要角色建一份 `character_bible.csv`，统一管理描述文字：

```csv
character_id,name_en,physical_traits,default_prompt_prefix
char_lin,Lin Yue,"mole below left eye, pearl stud earrings, straight black hair","Lin Yue, mole below left eye, pearl stud earrings"
char_chen,Chen Mo,"tall, sharp jaw, short neat hair","Chen Mo, tall, sharp jaw, short neat hair"
```

制作清单时，直接从这里复制前缀，保证全集一致。

---

## 已知局限

:::caution 一致性高，但不完美
AI 模型不像真实演员一样"记住"角色。以下情况可能导致画面差异：

- 某条镜头的提示词不小心改了角色描述
- 参考图分辨率太低、面部被遮挡
- 连贯组跨越了差异很大的场景类型（室内/室外、白天/夜晚）
- 同一张参考图被用于太多不同服装的场景

在正式开拍前，用 3–5 条快速测试镜头确认参考图效果。
:::

---

## 推荐工作流

1. 在 `character_bible.csv` 里整理好所有角色的视觉特征
2. 为每个角色准备 1 张高质量正面参考图
3. 每套主要服装单独准备一张 `outfit_ref`
4. 在清单里按场景设置 `continuity_group`
5. 每条提示词都以固定的角色特征前缀开头
6. **先跑快速测试（3 条）确认参考图有效**，再跑大批量
