import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  ListChecks,
  MonitorCog,
  SearchCheck,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"

const setupSteps = [
  "登录 https://app.nextapi.top，进入 API Keys，创建并复制 sk_*。完整 key 只显示一次。",
  "确认第三方工具支持 Custom HTTP Request、OpenAPI Tool、Custom Provider 或 Bearer Token 其中一种能力。",
  "Base URL 填 https://api.nextapi.top/v1；如果工具拆分 Host 和 Path，Host 填 https://api.nextapi.top，Path 填 /v1/videos。",
  "Headers 必填 Authorization: Bearer sk_... 和 Content-Type: application/json。",
  "创建视频只调用 POST /v1/videos，Body 必须是 JSON。不要填写上游 provider key，也不要暴露任何供应商密钥。",
  "保存创建响应里的 id，再轮询 GET /v1/videos/{id} 或 GET /v1/videos/{id}/wait。",
  "只有 status = succeeded 且 output.url 或 output.video_url 有值，才算生成成功。",
] as const

const configRows = [
  ["Base URL / 基址", "https://api.nextapi.top/v1"],
  ["Fallback root / 根地址", "https://api.nextapi.top"],
  ["Create path / 创建路径", "POST /v1/videos"],
  ["Poll path / 轮询路径", "GET /v1/videos/{id}"],
  ["Wait path / 长轮询路径", "GET /v1/videos/{id}/wait"],
  ["Authorization", "Bearer sk_..."],
  ["Content-Type", "application/json"],
  ["Models / 模型", "seedance-2.0-pro, seedance-2.0-fast, seedance-v2-pro"],
] as const

const toolRows = [
  {
    tool: "ComfyUI",
    support: "Trusted HTTP/API request custom node",
    configuration:
      "Core ComfyUI does not ship a native NextAPI provider. Use a trusted HTTP/API request custom node to POST /v1/videos, store id, then GET /v1/videos/{id}.",
    status: "Path available; packaged NextAPI node pending",
    href: "https://docs.comfy.org/development/core-concepts/custom-nodes",
  },
  {
    tool: "n8n",
    support: "Built-in HTTP Request node",
    configuration:
      "Create Header Auth or set headers in the HTTP Request node. POST the JSON body, then add a second HTTP Request node for polling.",
    status: "Good fit for automation workflows",
    href: "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/",
  },
  {
    tool: "Make",
    support: "HTTP app / Make a request",
    configuration:
      "Use HTTP > Make a request. Add method, URL, Authorization, Content-Type, raw JSON body, then chain a polling request.",
    status: "Good fit for no-code workflows",
    href: "https://apps.make.com/http",
  },
  {
    tool: "Dify",
    support: "Custom tool / OpenAPI schema",
    configuration:
      "Create a custom tool that defines POST /v1/videos and GET /v1/videos/{id}, then configure bearer-token auth with the NextAPI key.",
    status: "Good fit for AI app builders",
    href: "https://docs.dify.ai/en/use-dify/workspace/tools",
  },
  {
    tool: "AI-CanvasPro",
    support: "User-installed upstream only",
    configuration:
      "Install the official upstream yourself. Generic provider fields may help for some model types, but its video node is not verified against NextAPI /v1/videos yet.",
    status: "Do not redistribute; adapter pending verification",
    href: "https://github.com/ashuoAI/AI-CanvasPro",
  },
  {
    tool: "Runway / Pika / Luma / Kling / Canva-style hosted editors",
    support: "No generic NextAPI key path verified",
    configuration:
      "Use only if the product exposes a custom HTTP, OpenAPI, or OpenAI-compatible provider setting. Most hosted editors hardcode their own providers.",
    status: "Not enough evidence",
    href: null,
  },
] as const

const toolPlaybooks = [
  {
    tool: "ComfyUI",
    summary: "不是在原生 ComfyUI 设置里填 key；当前严格做法是通过可信 HTTP/API request 自定义节点接入。",
    steps: [
      "只使用本地或你信任的 ComfyUI 安装，不要把 sk_* 粘到陌生网页镜像。",
      "安装一个可信的 HTTP/API Request 自定义节点。",
      "添加创建请求节点：method = POST，URL = https://api.nextapi.top/v1/videos。",
      "Headers 添加 Authorization: Bearer sk_... 与 Content-Type: application/json。",
      "Body 使用 JSON，至少包含 model 与 input.prompt。",
      "把响应里的 id 保存到后续节点，再用 GET https://api.nextapi.top/v1/videos/{id} 轮询。",
      "读取 output.url；若只看到 output.video_url，也可以作为下载地址使用。",
    ],
  },
  {
    tool: "n8n",
    summary: "n8n 最适合做“表单/表格/队列 -> 生成视频 -> 下载或发通知”的自动化流程。",
    steps: [
      "创建 Header Auth credential，Header Name = Authorization，Header Value = Bearer sk_...。",
      "添加 HTTP Request 节点，Method = POST，URL = https://api.nextapi.top/v1/videos。",
      "Body Content Type 选 JSON，Body 填 model 与 input。",
      "把返回 id 传给第二个 HTTP Request 节点。",
      "第二个节点 Method = GET，URL = https://api.nextapi.top/v1/videos/{{$json.id}}。",
      "判断 status，成功后把 output.url 传给下载、存储或通知节点。",
    ],
  },
  {
    tool: "Make",
    summary: "Make 适合无代码用户，把 NextAPI 作为 HTTP 模块里的一个视频生成步骤。",
    steps: [
      "添加 HTTP app，选择 Make a request。",
      "Method = POST，URL = https://api.nextapi.top/v1/videos。",
      "Headers 填 Authorization: Bearer sk_... 与 Content-Type: application/json。",
      "Body type 选 Raw，Content type 选 JSON，粘贴请求体。",
      "用后续 HTTP 模块轮询 GET /v1/videos/{id}，或设置间隔后再查。",
      "status = succeeded 后再读取 output.url。",
    ],
  },
  {
    tool: "Dify",
    summary: "Dify 应走 Custom tool / OpenAPI schema，不要把 NextAPI 当成聊天模型随便塞进去。",
    steps: [
      "在 Dify 工作区创建 Custom tool。",
      "导入或填写 OpenAPI schema，至少定义 POST /v1/videos 与 GET /v1/videos/{id}。",
      "认证方式选择 Bearer token，填入 NextAPI 的 sk_*。",
      "工作流里先调用创建视频工具，保存 id。",
      "再调用查询工具轮询结果，并把 output.url 返回给用户。",
    ],
  },
] as const

const troubleshooting = [
  ["401 / unauthorized", "key 缺失、复制不完整、Bearer 前缀漏写，或 key 已撤销。重新在 app.nextapi.top 创建并替换。"],
  ["402 / insufficient_credits", "账户余额不足或预算限制触发。先充值或调低测试任务规模。"],
  ["404 / not_found", "轮询 id 写错，或使用了其他账号的 key。创建和查询必须使用同一个 NextAPI key。"],
  ["422 / invalid_request", "JSON 字段不符合 OpenAPI：确认 model、input.prompt、duration_seconds、resolution。"],
  ["一直 queued/running", "视频任务是异步的。先用 5 秒、720p 测试；自动化工具里加等待或使用 /wait。"],
] as const

export default function ThirdPartyToolsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <section className="relative isolate overflow-hidden border-b border-border/70 bg-background px-6 py-16 sm:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(129,140,248,0.24),transparent_70%)]"
          />
          <div className="mx-auto max-w-5xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-medium text-indigo-600 dark:text-indigo-300">
              <KeyRound className="size-3.5" />
              Third-party tools / 第三方工具接入
            </div>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-5xl">
              把 NextAPI Key 填进 ComfyUI、n8n、Make、Dify。
            </h1>
            <p className="mt-5 max-w-3xl text-[16px] leading-relaxed text-muted-foreground">
              如果你不想在 NextAPI 控制台里生成视频，可以把 NextAPI 当作视频后端，用支持自定义 HTTP、OpenAPI 或 Bearer Token 的工具来调用。下面是中文严格配置流程和可验证的工具路径。
            </p>
            <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
              Use NextAPI as the video backend behind ComfyUI-style workflows, automation tools, or local canvases that can call a custom API.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="https://app.nextapi.top"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-600"
              >
                创建 API Key
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="#strict-flow"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                查看严格配置流程
              </Link>
            </div>
          </div>
        </section>

        <section id="strict-flow" className="px-6 py-14">
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="min-w-0 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-status-success/25 bg-status-success-dim text-status-success">
                  <ListChecks className="size-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-semibold text-foreground">中文严格配置流程</h2>
                  <p className="text-[13px] text-muted-foreground">
                    按这个顺序配置，用户不需要理解供应商密钥或内部任务系统。
                  </p>
                </div>
              </div>
              <ol className="mt-5 space-y-3">
                {setupSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] text-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 break-words">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="min-w-0 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-500">
                  <MonitorCog className="size-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-semibold text-foreground">字段照填表</h2>
                  <p className="text-[13px] text-muted-foreground">
                    第三方工具里看到这些字段时，就按右侧填写。
                  </p>
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-border/80">
                <table className="w-full text-left text-[13px]">
                  <tbody className="divide-y divide-border/70">
                    {configRows.map(([label, value]) => (
                      <ConfigRow key={label} label={label} value={value} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto min-w-0 max-w-5xl rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-500">
                <ClipboardCheck className="size-5" />
              </span>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Universal REST configuration</h2>
                <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                  所有第三方工具本质上都走这两步：先创建异步视频任务，再轮询任务结果。
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Create video / 创建视频</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">{`POST https://api.nextapi.top/v1/videos
Authorization: Bearer sk_...
Content-Type: application/json

{
  "model": "seedance-2.0-pro",
  "input": {
    "prompt": "A cinematic product reveal",
    "duration_seconds": 5,
    "resolution": "720p"
  }
}`}</pre>
              </div>
              <div className="rounded-xl border border-border/80 bg-background p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Poll result / 轮询结果</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">{`GET https://api.nextapi.top/v1/videos/{id}
Authorization: Bearer sk_...

Wait until:
status = "succeeded"
output.url or output.video_url is present`}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">按工具配置</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                这些不是泛泛而谈的“支持 API Key”。每个工具都写清楚应该进哪个能力入口、填哪些字段、怎样拿到最终视频。
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {toolPlaybooks.map((playbook) => (
                <article key={playbook.tool} className="min-w-0 rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-500">
                      <Wrench className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-[17px] font-semibold text-foreground">{playbook.tool}</h3>
                      <p className="mt-1 break-words text-[13.5px] leading-relaxed text-muted-foreground">{playbook.summary}</p>
                    </div>
                  </div>
                  <ol className="mt-4 space-y-2">
                    {playbook.steps.map((step, index) => (
                      <li key={step} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                        <span className="mt-0.5 font-mono text-[11px] text-indigo-500">{String(index + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 break-words">{step}</span>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="compatibility" className="px-6 pb-14">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Tool setup matrix</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                下面列的是当前能讲清楚的第三方路径；有些是 HTTP 工作流，不是原生模型供应商集成。
              </p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="border-b border-border bg-muted/35 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Tool</th>
                    <th className="px-5 py-3 font-medium">How it accepts NextAPI</th>
                    <th className="px-5 py-3 font-medium">Configuration</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {toolRows.map((row) => (
                    <tr key={row.tool} className="align-top">
                      <td className="px-5 py-4 font-medium text-foreground">
                        {row.href ? (
                          <Link href={row.href} className="text-indigo-500 hover:text-indigo-600">
                            {row.tool}
                          </Link>
                        ) : (
                          row.tool
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{row.support}</td>
                      <td className="px-5 py-4 leading-relaxed text-muted-foreground">{row.configuration}</td>
                      <td className="px-5 py-4 font-mono text-[12px] text-indigo-500">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-status-success/25 bg-status-success-dim text-status-success">
                  <SearchCheck className="size-5" />
                </span>
                <h2 className="text-[17px] font-semibold text-foreground">验收检查</h2>
              </div>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted-foreground">
                <li>POST 返回 HTTP 202，并有 id、status、estimated_cost_cents。</li>
                <li>GET 使用同一个 sk_* 查询同一个 id。</li>
                <li>小任务先跑通：720p、5 秒、短提示词。</li>
                <li>成功标准是 status = succeeded 且 output.url 或 output.video_url 可访问。</li>
              </ul>
            </div>

            <div className="min-w-0 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                  <TriangleAlert className="size-5" />
                </span>
                <h2 className="text-[17px] font-semibold text-foreground">排障表</h2>
              </div>
              <div className="mt-4 space-y-3">
                {troubleshooting.map(([code, reason]) => (
                  <div key={code} className="rounded-xl border border-border/70 bg-background/70 p-3">
                    <div className="font-mono text-[12px] text-foreground">{code}</div>
                    <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-14">
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-border bg-card p-6">
              <h2 className="text-[17px] font-semibold text-foreground">AI-CanvasPro note</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                AI-CanvasPro 是第三方本地画布。用户可以自行从官方上游仓库安装。NextAPI 目前不分发、不镜像、不白标它，也不会承诺它的视频节点已经兼容 NextAPI，除非后续有可验证 adapter。
              </p>
              <Link
                href="https://github.com/ashuoAI/AI-CanvasPro"
                className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-indigo-500 hover:text-indigo-600"
              >
                Official AI-CanvasPro repository
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="min-w-0 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-status-success/25 bg-status-success-dim text-status-success">
                  <ShieldCheck className="size-5" />
                </span>
                <h2 className="text-[17px] font-semibold text-foreground">密钥安全</h2>
              </div>
              <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted-foreground">
                <li>只把 sk_* 填入本地工具、可信自动化账户或你自己控制的服务端。</li>
                <li>不要把 key 填进非官方托管镜像、陌生网页客户端或公开工作流模板。</li>
                <li>怀疑泄露时，立刻在 app.nextapi.top 撤销旧 key 并创建新 key。</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto max-w-5xl rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-indigo-500/25 bg-background text-indigo-500">
                  <CheckCircle2 className="size-5" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-foreground">Creator Kit is planned</h2>
                  <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
                    NextAPI 会做自己的填 key 即用工具：用户只填 NextAPI Key，任务、计费、视频存储都走现有网关，不暴露上游供应商 key，也不另建第二套计费。
                  </p>
                </div>
              </div>
              <Link
                href="https://app.nextapi.top"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-600"
              >
                创建 API Key
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-44 bg-muted/25 px-4 py-3 font-medium text-muted-foreground">{label}</th>
      <td className="break-words px-4 py-3 font-mono text-[12.5px] text-foreground">{value}</td>
    </tr>
  )
}
