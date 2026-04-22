import Link from "next/link"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { ArrowRight } from "lucide-react"

const INTEGRATIONS = [
  {
    slug: "cursor",
    name: "Cursor",
    desc: "Use NextAPI as an AI video generation tool inside your Cursor IDE agent workflows.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    slug: "n8n",
    name: "n8n",
    desc: "Add video generation nodes to your n8n automation workflows with our HTTP request setup.",
    color: "from-orange-500 to-red-500",
  },
  {
    slug: "dify",
    name: "Dify",
    desc: "Connect NextAPI as a custom tool in Dify to add video generation to your AI applications.",
    color: "from-indigo-500 to-blue-500",
  },
  {
    slug: "langchain",
    name: "LangChain",
    desc: "Use NextAPI as a custom tool in your LangChain agents for automated video generation.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    slug: "comfyui",
    name: "ComfyUI",
    desc: "Integrate NextAPI video generation into your ComfyUI node-based workflows.",
    color: "from-purple-500 to-pink-500",
  },
  {
    slug: "make",
    name: "Make (Integromat)",
    desc: "Build automated video generation scenarios with NextAPI HTTP modules in Make.",
    color: "from-violet-500 to-purple-500",
  },
]

export default function IntegrationsIndexPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <section className="relative isolate pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[640px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
          />
          <div className="mx-auto max-w-7xl px-6">
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl">
              Integrations
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              Connect NextAPI to your existing tools and workflows. Every integration
              uses the same REST API — no custom SDKs required.
            </p>
          </div>
        </section>

        <section className="pb-24 sm:pb-32">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((i) => (
              <Link
                key={i.slug}
                href={`/docs/integrations/${i.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-colors hover:border-indigo-500/30"
              >
                <div
                  className={`mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${i.color} text-white text-[15px] font-bold`}
                >
                  {i.name[0]}
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{i.name}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{i.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-indigo-500">
                  View guide
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
