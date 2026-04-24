# NextAPI 零基础使用指南（写给完全不懂代码的人）

> 如果你会用手机 App、会在网页上登录和填表，就能读懂这篇。  
> 遇到陌生词请先打开 [`GLOSSARY-ZH.md`](./GLOSSARY-ZH.md) 对照。

---

## 1. NextAPI 是做什么的？

可以把 NextAPI 理解成：**帮你向「视频 AI」下单的正规前台**。

- 客户（或你自己的团队）在网页上注册、充值、拿到一把 **API Key**（像银行卡密码一样保密）。
- 你的程序或我们提供的工具（例如 Batch Studio）把「一句话描述 + 可选参考图」发给 NextAPI。
- NextAPI 负责：**验证你是谁、检查余额、排队、调用上游视频模型、计费、失败退款、记录任务**。
- 你不需要自己去碰火山引擎控制台的复杂接口——**运维在服务器上配置好密钥后**，客户侧只管调用 NextAPI 即可。

---

## 2. 五个网址分别是什么？

记这张表，避免登错网站：

| 网址 | 给谁用 | 你能做什么 |
|------|--------|------------|
| **nextapi.top** | 所有人 | 看介绍、价格、文档链接。 |
| **app.nextapi.top** | **客户** | 注册/登录、创建 API Key、看任务列表、试用。 |
| **admin.nextapi.top** | **老板/运营** | 调账、暂停恶意用户、看审计日志等（需在白名单邮箱里）。 |
| **api.nextapi.top** | **程序** | 真正的接口地址；在 Dashboard 里复制 Key 后，由脚本或软件访问。 |
| **文档站**（若已部署） | 所有人 | 更偏「产品说明」的图文；仓库里在 `docs-site/` 构建。 |

**重要：** 不要把 **Admin** 的地址发给普通客户；那是内部管理入口。

---

## 3. 完全不懂代码，怎么试出第一条视频？

推荐路径：**只用浏览器 + 客户控制台**。

1. 打开 **app.nextapi.top**，用邮箱或社交账号完成注册（背后是 **Clerk** 登录服务）。
2. 登录后找到 **API Key** 页面，创建一把 Key；**只显示一次完整密钥**，请复制保存到安全的地方（密码管理器）。
3. 若控制台里有 **Playground / 试用生成** 类入口，按页面提示填写：
   - **提示词（prompt）**：用中文或英文描述画面。
   - **时长、清晰度、比例** 等：按选项选即可。
4. 提交后会出现 **任务**；多刷新几次，状态会从「排队/运行」变成「成功」，即可预览或下载视频。

若页面上没有试用入口，你可以把 **API Key** 交给懂一点技术的同事，用官方文档里的 **curl 示例** 或 **Python 示例** 发一条请求——你本人不必会写代码，只需保管好 Key。

---

## 4. 积分是怎么扣的？失败了怎么办？

- 创建任务时，系统会先 **预留** 一部分积分（防止你并发把余额刷成负数）。
- 任务 **成功**：按规则扣除实际消耗。
- 任务 **失败**：预留会 **释放/退还**，具体以产品说明和后台展示为准。

若你发现「一直失败但扣费异常」，把 **任务 ID**、时间点、截图发给运维，并查 [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) 里的应急与对账说明。

---

## 5. API Key 的安全规则（必看）

- 把它当成 **银行卡密码**：不要发微信群、不要贴到 GitHub、不要截图给别人。
- 泄露后别人可能盗刷你的积分；怀疑泄露时，应在 Dashboard **立即作废旧 Key** 并创建新 Key。
- 调用 API 时，一般放在 HTTP 头里：`Authorization: Bearer sk_live_你的密钥`（具体以 OpenAPI 文档为准）。

---

## 6. 火山引擎、Dreamina、Seedance 和你有什么关系？

- **火山引擎**是云厂商；**Seedance** 是其中的视频生成模型能力；**Ark** 是上面向开发者暴露的推理接口形态之一。
- **Dreamina** 是控制台里常见的规格/产品线命名；当前仓库对 **2.0** 档位使用四条官方模型名（标准/快速 × 有图/无图），由网关 **自动选择**，无需客户手工填写那串英文 ID。
- 你需要知道的只有一句：**服务器上的 `VOLC_API_KEY` 等配置必须正确**，否则全线任务会失败；这属于 **运维/部署** 范畴，见下一节。

---

## 7. 你要找人「部署」或「改服务器」时，给他看什么？

按顺序给技术人员这几份（都在本仓库 `docs/`）：

1. [`SETUP-GUIDE.md`](./SETUP-GUIDE.md) — 从域名到 systemd 的完整步骤。  
2. [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) — 环境变量清单、数据库迁移、Seedance 模型映射。  
3. [`deploy-cloudflare.md`](./deploy-cloudflare.md) — 前端在 Cloudflare 上的部署方式。  
4. [`backend/api/openapi.yaml`](../backend/api/openapi.yaml) — 对外 API 的权威说明。

你本人不必读懂，只要知道：**缺了这些，对方容易配错 Key 或域名。**

---

## 8. 本地工具（toolkit）要不要装？

- **Batch Studio**：适合一次跑很多条镜头（CSV），在你自己电脑上运行；见 [`toolkit/README.md`](../toolkit/README.md)。  
- **ComfyUI 节点**：适合已经在用 ComfyUI 的画师/技术美术。  

这些都需要本机安装 **Python** 等环境；若你完全不想装，可以只用 **网页控制台 + 请人写脚本**。

---

## 9. 文档地图：我想……该读哪篇？

| 我想…… | 文档 |
|--------|------|
| 搞懂名词 | [`GLOSSARY-ZH.md`](./GLOSSARY-ZH.md) |
| **仓库每个文件夹干什么** | [`REPO-TOUR-ZH.md`](./REPO-TOUR-ZH.md) |
| **点一次生成背后发生什么** | [`FLOW-ZH.md`](./FLOW-ZH.md) |
| **常见问题一句话** | [`FAQ-ZH.md`](./FAQ-ZH.md) |
| 部署上线 | [`SETUP-GUIDE.md`](./SETUP-GUIDE.md) |
| 每天管服务器、跑数据库升级 | [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) |
| 配邮件通知、监控 | [`INTEGRATIONS-GUIDE.md`](./INTEGRATIONS-GUIDE.md) |
| 批量视频、CSV | [`toolkit/docs/batch_studio_guide.md`](../toolkit/docs/batch_studio_guide.md) · 中文导读 [`toolkit/README.zh.md`](../toolkit/README.zh.md) |
| 接口字段、报错码 | [`backend/api/openapi.yaml`](../backend/api/openapi.yaml) + 文档站 **Errors** |
| 程序员接 SDK | [`sdks/README.md`](../sdks/README.md) |
| 整个仓库文档总目录 | [`docs/README.md`](./README.md) |

---

## 10. 最后：遇到问题怎么办？

1. 先看本仓库 [`FAQ-ZH.md`](./FAQ-ZH.md)；再打开文档站的 **常见问题 / 错误排查**（`docs-site` 里 `faq`、`errors`）。  
2. 看本仓库 [`STATUS.md`](../STATUS.md) 里哪些功能已闭环、哪些还在脚手架阶段。  
3. 把 **请求时间、任务 ID、HTTP 状态码、是否改过 Key** 告诉技术支持——信息越具体，越快定位。

你不需要学会写代码，但需要学会：**保管 Key、认准网址、知道去哪份文档找人**。这三件事做对，就能稳定地用 NextAPI。
