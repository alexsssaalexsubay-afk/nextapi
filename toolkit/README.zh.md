# NextAPI 本地工具包（小白导读）

> 英文完整版见 [`README.md`](./README.md)。这里用中文说明 **你要不要装、装完干什么**。

---

## 这是啥？

**toolkit** 是在 **你自己电脑上** 跑的 Python 小工具，用来：

- **Batch Studio**：用 CSV 一次提交很多条镜头，带校验和重试。
- **ComfyUI 节点**：在 ComfyUI 里拖节点调用 NextAPI。
- **短剧素材包**：角色表、场景表、镜头表示例，方便制片先填表再批量跑。

它们 **不是** 网站本体；客户日常也可以 **只用浏览器 + API**，不装这些。

---

## 你需要什么？

1. 电脑上能装 **Python 3**（具体版本见各子目录 `requirements.txt`）。  
2. 在 **app.nextapi.top** 拿到 **`sk_live_…` API Key**（当密码保管）。  
3. 网络能访问 **`https://api.nextapi.top`**（或你们自托管的 API 地址）。

不会装 Python 的话，把这篇和 [`README.md`](./README.md) 转给技术同事即可。

---

## 最快试跑（Batch Studio）

```bash
cd toolkit/batch_studio
python3 -m venv .venv
source .venv/bin/activate   # Windows 用 .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

浏览器打开后，在侧边栏粘贴 Key，上传 `sample_data/shot_manifest.csv`，先点校验再小批量试跑。

更细的步骤：[`docs/quickstart.md`](docs/quickstart.md)（英文）、[`docs/batch_studio_guide.md`](docs/batch_studio_guide.md)。

---

## 和「官方 API」啥关系？

工具内部也是调 **`POST /v1/video/generations`** 等 HTTP 接口（与当前代码一致）。  
**新对接自家系统** 请优先读仓库里的 **`backend/api/openapi.yaml`**（`/v1/videos` 等新路径）。

---

## 出问题？

先看 [`docs/troubleshooting.md`](docs/troubleshooting.md)。  
概念不懂：仓库 [`docs/GLOSSARY-ZH.md`](../docs/GLOSSARY-ZH.md)、[`docs/FAQ-ZH.md`](../docs/FAQ-ZH.md)。
