---
title: API 密钥使用指南
sidebar_label: API 密钥
description: 在 Batch Studio、ComfyUI、Python、curl、Postman 中使用你的 API 密钥，以及安全管理和多密钥策略。
---

# API 密钥使用指南

你的 API 密钥（`sk_live_…`）是访问 NextAPI 的凭证，每一次请求都需要它来进行身份验证。本文介绍如何在各种工具中正确使用密钥、如何保证安全，以及常见问题的处理方法。

---

## 获取密钥

访问 [app.nextapi.top](https://app.nextapi.top) → **密钥 → 新建密钥**。

给密钥起一个容易分辨的名字（例如 `batch-studio-生产`、`comfyui-开发`）。创建后立刻复制——**只显示一次**。

:::danger 密钥只显示一次
创建后只能看到完整密钥这一次。之后控制台只显示前缀。如果丢失，只能撤销并重新创建。
:::

---

## 在 Batch Studio 中使用密钥

**左侧边栏 → 连接设置 → API 密钥（sk_live_…）**

把密钥粘贴进去。密钥只保存在浏览器的会话内存中，不会写入磁盘，也不会发送给 `api.nextapi.top` 以外的任何服务器。

**每次启动都要重新粘贴太麻烦？** 用环境变量：

```bash
export NEXTAPI_KEY=sk_live_yourkey
export NEXTAPI_BASE_URL=https://api.nextapi.top
streamlit run app.py
```

Batch Studio 启动时会自动读取这两个环境变量，提前填好字段。

---

## 在 ComfyUI 中使用密钥

### 方式 A：直接填在 Auth 节点里

打开 **NextAPI · Auth** 节点 → 找到 **api_key** 字段 → 粘贴密钥。

这样最方便，但密钥会被保存在工作流的 JSON 文件里。**不要把这个文件提交到公开仓库。**

### 方式 B：使用环境变量（推荐）

```bash
export NEXTAPI_KEY=sk_live_yourkey
```

重启 ComfyUI。Auth 节点的字段为空时会自动读取 `NEXTAPI_KEY`。

**Windows 用户：**

```cmd
set NEXTAPI_KEY=sk_live_yourkey
```

或者在 **系统属性 → 环境变量** 里添加，这样重启后仍然有效。

---

## 在 Python 中使用密钥

### 同步写法（requests）

```python
import os
import requests

API_KEY = os.getenv("NEXTAPI_KEY")   # 或直接写 "sk_live_yourkey"
BASE_URL = "https://api.nextapi.top"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 提交生成任务
resp = requests.post(
    f"{BASE_URL}/v1/video/generations",
    json={
        "prompt": "林悦走进咖啡馆，柔和的晨光",
        "duration": 5,
        "aspect_ratio": "16:9",
    },
    headers=headers,
    timeout=30,
)
resp.raise_for_status()
job = resp.json()
print(f"任务 ID: {job['id']}  预估积分: {job['estimated_credits']}")

# 轮询结果
import time
while True:
    r = requests.get(f"{BASE_URL}/v1/jobs/{job['id']}", headers=headers)
    data = r.json()
    print(f"状态: {data['status']}")
    if data["status"] in ("succeeded", "failed"):
        break
    time.sleep(4)

if data["status"] == "succeeded":
    print(f"视频地址: {data['video_url']}")
else:
    print(f"失败: {data['error_code']} — {data['error_message']}")
```

### 异步写法（aiohttp）

```python
import asyncio
import aiohttp
import os

API_KEY = os.getenv("NEXTAPI_KEY")
BASE_URL = "https://api.nextapi.top"

async def generate_and_poll(prompt: str) -> str | None:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        # 提交
        async with session.post(
            f"{BASE_URL}/v1/video/generations",
            json={"prompt": prompt, "duration": 5, "aspect_ratio": "16:9"},
        ) as resp:
            job = await resp.json()
            job_id = job["id"]

        # 轮询
        while True:
            async with session.get(f"{BASE_URL}/v1/jobs/{job_id}") as resp:
                data = await resp.json()
            if data["status"] == "succeeded":
                return data["video_url"]
            if data["status"] == "failed":
                print(f"失败: {data['error_code']}")
                return None
            await asyncio.sleep(4)

url = asyncio.run(generate_and_poll("林悦走进咖啡馆"))
print(url)
```

:::tip 直接用 toolkit 的客户端
`toolkit/batch_studio/api_client.py` 是封装好的生产级异步客户端，内置重试、退避和下载逻辑。可以直接在自己的脚本里引入：

```python
from api_client import ClientConfig, NextAPIClient

cfg = ClientConfig(base_url="https://api.nextapi.top", api_key="sk_live_…")
async with NextAPIClient(cfg) as client:
    resp = await client.submit_generation({"prompt": "…", "duration": 5, "aspect_ratio": "16:9"})
```
:::

---

## 用 curl 调用

提交生成任务：

```bash
curl -X POST https://api.nextapi.top/v1/video/generations \
  -H "Authorization: Bearer sk_live_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "林悦走进咖啡馆，柔和的晨光",
    "duration": 5,
    "aspect_ratio": "16:9"
  }'
```

查询任务状态：

```bash
curl https://api.nextapi.top/v1/jobs/job_abc123 \
  -H "Authorization: Bearer sk_live_yourkey"
```

把密钥存成变量，避免每次重复输入：

```bash
export NEXTAPI_KEY=sk_live_yourkey

curl -X POST https://api.nextapi.top/v1/video/generations \
  -H "Authorization: Bearer $NEXTAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "...", "duration": 5, "aspect_ratio": "16:9"}'
```

---

## 在 Postman 中使用密钥

1. 新建请求 → **POST** → `https://api.nextapi.top/v1/video/generations`
2. 切换到 **Authorization** 标签页 → 类型选 **Bearer Token** → 粘贴密钥
3. 切换到 **Body** 标签页 → **raw** → **JSON**
4. 填写请求体：

```json
{
  "prompt": "林悦走进咖啡馆，柔和的晨光",
  "duration": 5,
  "aspect_ratio": "16:9"
}
```

5. 点击 **Send**

**查询任务：**  
复制这个请求 → 改成 **GET** 方法 → 地址改为 `https://api.nextapi.top/v1/jobs/{job_id}` → 把 `{job_id}` 替换成第一步返回的 ID。

---

## 多密钥使用策略

### 什么时候需要多个密钥

| 场景 | 建议 |
|------|------|
| 生产 vs 开发/测试 | 必须分开，一个环境一个密钥 |
| 多个团队成员 | 每人一个密钥，或按项目分配 |
| 不同批次需要不同速率限制 | 给每个密钥配置不同的 RPM 上限 |
| 给客户开放 API 访问 | 为客户单独创建密钥 |

### 密钥命名规范

在控制台里起描述性的名字：

```
batch-studio-生产
comfyui-开发
ci-自动化测试
客户-某某公司
```

这样在需要撤销某一个密钥时，不会误操作其他的。

### 密钥轮换流程

1. 在控制台创建**新密钥**（可以用相同或更新后的设置）
2. 在 Batch Studio、ComfyUI、环境变量等各个地方更新为新密钥
3. **跑一次快速测试，确认新密钥能正常工作**
4. 确认没问题后，在控制台**撤销旧密钥**

在确认新密钥可用之前，不要急着删除旧密钥。

### 生产密钥和测试密钥不要混用

- 生产密钥：真实积分，真实调用，真实数据
- 测试密钥：速率限制更低，只用于开发和实验

如果不小心用错了密钥环境跑一个 500 条镜头的批次，既浪费积分，又可能搞乱计费记录。

---

## 密钥安全守则

### 要这样做 ✅
- 把密钥存在环境变量或 `.env` 文件里
- 把 `.env` 加入 `.gitignore`
- 每 90 天或怀疑泄露时轮换密钥
- 不同项目使用不同密钥

### 不要这样做 ❌
- 把密钥硬编码写进代码文件
- 把密钥提交到任何 Git 仓库（无论公开还是私有）
- 在截图、Slack、邮件、Issue 里粘贴密钥
- 多人共用同一个密钥

**如果发现密钥出现在 `git log`、截图，或任何你没打算放的地方：**

1. 立即去控制台撤销该密钥
2. 创建一个新密钥
3. 在所有工具里更新为新密钥

---

## 密钥相关问题排查

| 现象 | 可能原因 | 解决方式 |
|------|----------|---------|
| `401 Unauthorized` | 密钥错误、已被撤销或格式不对 | 确认密钥以 `sk_live_` 开头；如有问题重新生成 |
| 看起来正确但还是 `401` | 粘贴时带了前后空格 | 重新仔细粘贴，或改用环境变量 |
| `402 余额不足` | 组织没有积分 | 控制台 → 计费 → 充值 |
| `429 请求太频繁` | 超过密钥 RPM 限制 | 降低并发数；或在控制台提高密钥的 `rate_limit_rpm` |
| curl 能用但 Batch Studio 不行 | 环境变量冲突 | 检查 `NEXTAPI_KEY` 是否指向旧密钥 |
| 密钥丢了 | 控制台创建后只显示一次前缀 | 轮换：新建密钥 → 更新各工具 → 撤销旧密钥 |
