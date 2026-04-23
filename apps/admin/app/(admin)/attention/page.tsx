"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { adminFetch } from "@/lib/admin-api"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/i18n/context"

type Row = {
  id: string
  org: string
  rule: string
  reason: string
  age: string
  credits: string
  severity: "high" | "medium" | "low"
}

const MOCK_ROWS: Row[] = [
  {
    id: "job_7Hc9Xk2Lm3NpQ4rS",
    org: "linear-media",
    rule: "upstream_timeout > 300s",
    reason: "Seedance never returned · reservation 1.00 held",
    age: "2m",
    credits: "refund 1.00",
    severity: "high",
  },
  {
    id: "job_4Pt8Yz0Qj9WxVb1A",
    org: "acme-prod",
    rule: "webhook.retries > 5",
    reason: "POST https://acme.com/hooks/nextapi returning 503",
    age: "6m",
    credits: "—",
    severity: "high",
  },
  {
    id: "job_2Lm0FhRk8NeGxT3C",
    org: "parallax-studio",
    rule: "queued > ETA + 60s",
    reason: "Stuck in queued 340s over Seedance ETA of 28s",
    age: "11m",
    credits: "—",
    severity: "medium",
  },
  {
    id: "job_9Qr5Dp7Bj1OeNm6X",
    org: "northwind-labs",
    rule: "reservation.unsettled > 10m",
    reason: "Upstream 202 but no terminal state · release hold",
    age: "18m",
    credits: "release 1.00",
    severity: "medium",
  },
  {
    id: "job_6Xw3Nv2Hc8MkLp4Y",
    org: "acme-prod",
    rule: "content_policy.manual_review",
    reason: "Operator review requested by linked workflow",
    age: "24m",
    credits: "refund 1.00",
    severity: "high",
  },
  {
    id: "job_3Bf0Kq9Uj2IwAa5R",
    org: "stellar-post",
    rule: "billed != reserved",
    reason: "Billed 2.00 vs reservation 1.00 · investigate ledger",
    age: "31m",
    credits: "hold",
    severity: "high",
  },
  {
    id: "job_8Vn7Mj4Tp1LyFb2Q",
    org: "acme-prod",
    rule: "cdn.upload.failed",
    reason: "S3 PUT failed for output · 2 retries remaining",
    age: "44m",
    credits: "—",
    severity: "low",
  },
]

function formatJobAge(createdAt: string): string {
  const t0 = new Date(createdAt).getTime()
  if (Number.isNaN(t0)) return "—"
  const mins = Math.floor((Date.now() - t0) / 60_000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h`
}

type ApiOrg = { ID?: string; id?: string; Name?: string; name?: string }
type ApiJob = {
  ID?: string
  id?: string
  OrgID?: string
  org_id?: string
  Status?: string
  status?: string
  ErrorCode?: string | null
  error_code?: string | null
  ErrorMessage?: string | null
  error_message?: string | null
  ReservedCredits?: number
  reserved_credits?: number
  CreatedAt?: string
  created_at?: string
}
type ApiModerationEvent = {
  ID?: number
  id?: number
  OrgID?: string
  org_id?: string
  Verdict?: string
  verdict?: string
  Reason?: string | null
  reason?: string | null
  InternalNote?: string | null
  internal_note?: string | null
  ProfileUsed?: string
  profile_used?: string
  CreatedAt?: string
  created_at?: string
}

function buildOrgNameMap(orgs: ApiOrg[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const o of orgs) {
    const id = o.ID ?? o.id ?? ""
    const name = o.Name ?? o.name ?? ""
    if (id) m.set(id, name || id.slice(0, 8))
  }
  return m
}

// TODO: align with backend response — job/mod event fields and severity rules.
function mapJobToRow(j: ApiJob, orgNames: Map<string, string>): Row {
  const id = j.ID ?? j.id ?? "—"
  const orgId = j.OrgID ?? j.org_id ?? ""
  const org = orgNames.get(orgId) ?? (orgId ? orgId.slice(0, 8) : "—")
  const status = (j.Status ?? j.status ?? "").toLowerCase()
  const errCode = j.ErrorCode ?? j.error_code ?? ""
  const errMsg = j.ErrorMessage ?? j.error_message ?? ""
  const reserved = j.ReservedCredits ?? j.reserved_credits ?? 0
  const created = j.CreatedAt ?? j.created_at ?? ""
  const severity: Row["severity"] =
    status === "failed" ? "high" : status === "running" ? "medium" : "medium"
  const credits =
    reserved > 0 ? `${reserved} held` : "—"
  return {
    id,
    org,
    rule: errCode ? String(errCode) : status || "job",
    reason: errMsg ? String(errMsg) : `status=${status}`,
    age: formatJobAge(created),
    credits,
    severity,
  }
}

function mapModerationToRow(e: ApiModerationEvent, orgNames: Map<string, string>): Row {
  const nid = e.ID ?? e.id ?? 0
  const id = `mod_${nid}`
  const orgId = e.OrgID ?? e.org_id ?? ""
  const org = orgNames.get(orgId) ?? (orgId ? orgId.slice(0, 8) : "—")
  const verdict = (e.Verdict ?? e.verdict ?? "").toLowerCase()
  const reason = e.Reason ?? e.reason ?? ""
  const profile = e.ProfileUsed ?? e.profile_used ?? ""
  const created = e.CreatedAt ?? e.created_at ?? ""
  const severity: Row["severity"] =
    verdict === "block" ? "high" : verdict === "review" ? "medium" : "low"
  return {
    id,
    org,
    rule: profile ? `moderation · ${profile}` : `moderation · ${verdict || "event"}`,
    reason: reason || "—",
    age: formatJobAge(created),
    credits: "—",
    severity,
  }
}

export default function AttentionQueuePage() {
  const t = useTranslations()
  const p = t.admin.attentionPage
  const [rows, setRows] = useState<Row[]>(MOCK_ROWS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      let orgNames = new Map<string, string>()
      let jobsOk = false
      let modOk = false
      const merged: Row[] = []
      const errParts: string[] = []

      try {
        const orgsRes = (await adminFetch("/orgs")) as { data?: ApiOrg[] }
        orgNames = buildOrgNameMap(orgsRes.data ?? [])
      } catch (e) {
        console.error(e)
        errParts.push("organizations")
      }

      try {
        const [failedRes, runningRes] = await Promise.all([
          adminFetch("/jobs?status=failed") as Promise<{ data?: ApiJob[] }>,
          adminFetch("/jobs?status=running") as Promise<{ data?: ApiJob[] }>,
        ])
        const seen = new Set<string>()
        for (const j of [...(failedRes.data ?? []), ...(runningRes.data ?? [])]) {
          const id = j.ID ?? j.id
          if (!id || seen.has(id)) continue
          seen.add(id)
          merged.push(mapJobToRow(j, orgNames))
        }
        jobsOk = true
      } catch (e) {
        console.error(e)
        errParts.push("jobs")
      }

      try {
        const modRes = (await adminFetch("/moderation/events")) as { data?: ApiModerationEvent[] }
        for (const e of modRes.data ?? []) {
          merged.push(mapModerationToRow(e, orgNames))
        }
        modOk = true
      } catch (e) {
        console.error(e)
        errParts.push("moderation")
      }

      if (!cancelled) {
        if (jobsOk || modOk) {
          setRows(merged.length > 0 ? merged : [])
        } else {
          setRows(MOCK_ROWS)
        }
        if (errParts.length > 0) {
          setLoadError(`Failed to load: ${errParts.join(", ")}`)
        }
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AdminShell
      activeHref="/attention"
      title={p.title}
      description={p.description}
      meta={
        <>
          <span>{p.meta.open}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.oldest}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{p.meta.autoAssigned}</span>
          {loading && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-muted-foreground">{t.common.loading}…</span>
            </>
          )}
        </>
      }
      actions={
        <>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-card/40 px-3 text-[12px] text-foreground hover:bg-card">
            {p.editRules}
          </button>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:bg-foreground/90">
            {p.bulkResolve}
          </button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        {loadError && (
          <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-4 py-2 font-mono text-[11px] text-status-failed">
            {loadError}
          </div>
        )}
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="grid grid-cols-[auto_auto_1.2fr_1fr_auto_auto_auto] items-center gap-4 border-b border-border/60 bg-background/40 px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{p.columns.sev}</span>
            <span>{p.columns.job}</span>
            <span>{p.columns.orgRule}</span>
            <span>{p.columns.reason}</span>
            <span>{p.columns.age}</span>
            <span>{p.columns.credits}</span>
            <span className="text-right">{p.columns.resolve}</span>
          </div>
          <ul className="divide-y divide-border/60 font-mono text-[11.5px]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[auto_auto_1.2fr_1fr_auto_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-card/60"
              >
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] uppercase tracking-[0.12em]",
                    r.severity === "high" && "bg-status-failed/15 text-status-failed",
                    r.severity === "medium" && "bg-status-running/15 text-status-running",
                    r.severity === "low" && "bg-status-queued/15 text-status-queued",
                  )}
                >
                  {r.severity}
                </span>
                <Link
                  href={r.id.startsWith("mod_") ? "/audit" : `https://app.nextapi.top/jobs/${r.id}`}
                  className="truncate text-foreground hover:text-signal"
                >
                  {r.id}
                </Link>
                <div className="min-w-0">
                  <div className="truncate text-foreground/90">{r.org}</div>
                  <div className="truncate text-muted-foreground">{r.rule}</div>
                </div>
                <span className="truncate text-muted-foreground">{r.reason}</span>
                <span className="w-10 text-muted-foreground">{r.age}</span>
                <span
                  className={cn(
                    "w-20",
                    r.credits.startsWith("refund") && "text-status-success",
                    r.credits.startsWith("release") && "text-status-queued",
                    r.credits === "hold" && "text-status-failed",
                  )}
                >
                  {r.credits}
                </span>
                <div className="flex items-center gap-1 justify-self-end">
                  <button className="rounded-md border border-border/80 bg-card/40 px-2 py-0.5 text-[10.5px] text-foreground hover:bg-card">
                    {p.actions.inspect}
                  </button>
                  <button className="rounded-md bg-foreground px-2 py-0.5 text-[10.5px] font-medium text-background hover:bg-foreground/90">
                    {p.actions.resolve}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="text-[13.5px] font-medium tracking-tight">{p.activeRules.title}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {p.activeRules.description}
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-2 font-mono text-[11.5px] md:grid-cols-2">
            <Rule expr="upstream_timeout > 300s" hits="12 / 30d" />
            <Rule expr="webhook.retries > 5" hits="4 / 30d" />
            <Rule expr="queued > ETA + 60s" hits="38 / 30d" />
            <Rule expr="reservation.unsettled > 10m" hits="9 / 30d" />
            <Rule expr="content_policy.manual_review" hits="21 / 30d" />
            <Rule expr="billed != reserved" hits="2 / 30d" />
            <Rule expr="cdn.upload.failed" hits="17 / 30d" />
            <Rule expr="error_rate(org, 1h) > 15%" hits="3 / 30d" />
          </ul>
        </section>
      </div>
    </AdminShell>
  )
}

function Rule({ expr, hits }: { expr: string; hits: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <span className="text-foreground">{expr}</span>
      <span className="text-muted-foreground">{hits}</span>
    </li>
  )
}
