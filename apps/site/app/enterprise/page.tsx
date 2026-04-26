"use client"

import * as React from "react"
import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { CheckCircle2, ArrowRight, Building2, Zap, Shield, HeadphonesIcon } from "lucide-react"
import { useI18n } from "@/lib/i18n/context"

const COPY = {
  en: {
    badge: "Enterprise",
    heroTitleBefore: "Scale your video pipeline with",
    heroTitleAccent: "Enterprise SLAs",
    heroSubtitle:
      "Dedicated capacity, guaranteed throughput, custom moderation profiles, and a solutions architect to design your integration.",
    features: [
      {
        icon: Zap,
        title: "Dedicated Capacity",
        desc: "Guaranteed throughput with isolated queue lanes — no noisy neighbors.",
      },
      {
        icon: Shield,
        title: "Enterprise SLAs",
        desc: "99.95% uptime, P95 latency guarantees, and 24/7 incident response.",
      },
      {
        icon: Building2,
        title: "Custom Moderation",
        desc: "Configurable trust & safety profiles tailored to your compliance needs.",
      },
      {
        icon: HeadphonesIcon,
        title: "Solutions Architect",
        desc: "A dedicated engineer to design your integration and optimize throughput.",
      },
    ],
    formTitle: "Contact our Sales team",
    formSubtitle: "Tell us about your use case and we'll design a capacity plan for you.",
    submittedTitle: "Request received",
    submittedBody:
      "Our solutions architect will contact you within 12 hours to discuss dedicated capacity.",
    name: "Name",
    company: "Company",
    email: "Work Email",
    volumeLabel: "Monthly Video Volume",
    volumePlaceholder: "Select volume...",
    volumes: [
      { value: "lt-10k", label: "< 10,000 videos / month" },
      { value: "10k-50k", label: "10,000 – 50,000 videos / month" },
      { value: "50k-plus", label: "50,000+ videos / month" },
    ],
    latency: "Target P95 Latency",
    latencyPh: "e.g. < 60s per video",
    messageLabel: "Tell us more (optional)",
    messagePh: "Describe your use case, compliance requirements, etc.",
    submit: "Request Enterprise Access",
    submitting: "Submitting...",
    namePh: "Jane Smith",
    companyPh: "Acme Inc.",
    emailPh: "jane@acme.com",
    formError: "Something went wrong. Please try again.",
  },
  zh: {
    badge: "企业方案",
    heroTitleBefore: "规模化你的视频管线，依托",
    heroTitleAccent: "企业级 SLA",
    heroSubtitle:
      "独享容量、稳定吞吐、可定制的内容安全策略，并由解决方案架构师协助你完成接入与容量规划。",
    features: [
      {
        icon: Zap,
        title: "独享容量",
        desc: "隔离队列通道，保障吞吐，避免公共资源上的邻居干扰。",
      },
      {
        icon: Shield,
        title: "企业 SLA",
        desc: "99.95% 可用性、P95 时延承诺与 7×24 事件响应。",
      },
      {
        icon: Building2,
        title: "可定制审核",
        desc: "按合规需求配置 trust & safety 策略。",
      },
      {
        icon: HeadphonesIcon,
        title: "解决方案架构师",
        desc: "专属工程师协助集成设计与吞吐优化。",
      },
    ],
    formTitle: "联系销售团队",
    formSubtitle: "告诉我们你的业务场景，我们会给出容量与接入方案。",
    submittedTitle: "已收到你的需求",
    submittedBody: "解决方案架构师会在 12 小时内联系你，沟通独享容量与后续步骤。",
    name: "姓名",
    company: "公司",
    email: "工作邮箱",
    volumeLabel: "每月视频量级",
    volumePlaceholder: "请选择…",
    volumes: [
      { value: "lt-10k", label: "低于 1 万条 / 月" },
      { value: "10k-50k", label: "1 万 – 5 万条 / 月" },
      { value: "50k-plus", label: "5 万条以上 / 月" },
    ],
    latency: "目标 P95 时延",
    latencyPh: "例如每条 < 60 秒",
    messageLabel: "更多信息（可选）",
    messagePh: "用例、合规要求、上线时间等",
    submit: "提交企业接入申请",
    submitting: "提交中…",
    namePh: "张三",
    companyPh: "某某科技",
    emailPh: "name@company.com",
    formError: "提交失败，请稍后重试。",
  },
} as const

export default function EnterprisePage() {
  const { locale } = useI18n()
  const t = COPY[locale]
  const [submitted, setSubmitted] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get("name") as string,
      company: form.get("company") as string,
      email: form.get("email") as string,
      volume: form.get("volume") as string,
      latency: form.get("latency") as string,
      message: form.get("message") as string,
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.nextapi.top"
      const res = await fetch(`${apiUrl}/v1/sales/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || `Request failed: ${res.status}`)
      }
      setSubmitted(true)
    } catch {
      setError(t.formError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <section className="relative isolate overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[640px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
          />
          <div className="mx-auto max-w-7xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-foreground/80 backdrop-blur-sm">
              <Building2 className="size-3.5 text-indigo-500" />
              {t.badge}
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
              {locale === "zh" ? (
                <>
                  {t.heroTitleBefore}
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                    {t.heroTitleAccent}
                  </span>
                </>
              ) : (
                <>
                  {t.heroTitleBefore}{" "}
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                    {t.heroTitleAccent}
                  </span>
                </>
              )}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              {t.heroSubtitle}
            </p>
          </div>
        </section>

        <section className="pb-16 sm:pb-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 sm:grid-cols-2 lg:grid-cols-4">
            {t.features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-indigo-500/30"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500 dark:text-indigo-400">
                  <f.icon className="size-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-24 sm:pb-32">
          <div className="mx-auto max-w-2xl px-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-indigo-500/5 dark:shadow-indigo-500/10">
              <div className="border-b border-border bg-muted/30 px-6 py-5 sm:px-8">
                <h2 className="text-xl font-semibold text-foreground">{t.formTitle}</h2>
                <p className="mt-1 text-[13.5px] text-muted-foreground">{t.formSubtitle}</p>
              </div>

              {submitted ? (
                <div className="flex flex-col items-center gap-4 px-6 py-16 text-center sm:px-8">
                  <div className="inline-flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <CheckCircle2 className="size-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{t.submittedTitle}</h3>
                  <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">{t.submittedBody}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={t.name} name="name" required placeholder={t.namePh} />
                    <Field label={t.company} name="company" required placeholder={t.companyPh} />
                  </div>
                  <Field label={t.email} name="email" type="email" required placeholder={t.emailPh} />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-foreground">{t.volumeLabel}</label>
                    <select
                      name="volume"
                      required
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">{t.volumePlaceholder}</option>
                      {t.volumes.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field label={t.latency} name="latency" placeholder={t.latencyPh} />
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-foreground">{t.messageLabel}</label>
                    <textarea
                      name="message"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder={t.messagePh}
                    />
                  </div>

                  {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{error}</p> : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-indigo-500/70 hover:brightness-110 disabled:opacity-60"
                  >
                    {loading ? t.submitting : t.submit}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  )
}
