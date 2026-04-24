# NextAPI SDKs（官方客户端示例）

> **小白**：这里的东西给 **程序员** 用；你只要知道「语言目录里有一份可复制改的示例」即可。

---

## 有哪些？

| 目录 | 语言 | 说明 |
|------|------|------|
| [`python/`](./python/) | Python | 适合脚本、批处理、Jupyter。 |
| [`node/`](./node/) | JavaScript / TypeScript | 适合 Node 或前端构建工具。 |
| [`go/`](./go/) | Go | 适合后端服务集成。 |

每个子目录自有 `README.md`：安装方式、环境变量、最小示例。

---

## 接口以谁为准？

**[`backend/api/openapi.yaml`](../backend/api/openapi.yaml)** 是权威定义（路径、请求体、状态码）。

对接时统一使用你们的 API 基址，例如：`https://api.nextapi.top`。

---

## 和本地 toolkit 的区别？

- **`sdks/`**：给 **开发者** 把 NextAPI 嵌进自己的系统。  
- **`toolkit/`**：给 **运营/制片** 在本地用 CSV、ComfyUI 批量跑（见 [`toolkit/README.zh.md`](../toolkit/README.zh.md)）。

---

## 零基础读者下一步

- 产品是啥：[`docs/BEGINNERS-GUIDE-ZH.md`](../docs/BEGINNERS-GUIDE-ZH.md)  
- 名词表：[`docs/GLOSSARY-ZH.md`](../docs/GLOSSARY-ZH.md)
