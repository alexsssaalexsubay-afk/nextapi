"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { AI_PROVIDER_PRESETS, presetByID, presetsForType, type AIProviderPreset } from "@/lib/ai-provider-presets"
import { useTranslations } from "@/lib/i18n/context"

type AIProvider = {
  id: string
  name: string
  type: "text" | "image" | "video"
  provider: string
  base_url: string
  key_hint: string
  model: string
  enabled: boolean
  is_default: boolean
  config_json: Record<string, unknown>
  updated_at?: string
}

type ProviderLog = {
  id: number
  provider_id?: string
  type: string
  request_summary: string
  response_summary: string
  error: string
  created_at: string
}

type DirectorMeteringEvent = {
  id: number
  org_id: string
  director_job_id?: string
  step_id?: string
  job_id?: string
  provider_id?: string
  meter_type: string
  units: number
  estimated_cents: number
  actual_cents: number
  status: string
  created_at: string
}

type DirectorMeteringSummary = {
  available: boolean
  calls_24h: number
  units_24h: number
  rated_cents_24h: number
  recent: DirectorMeteringEvent[]
}

type DirectorStepEvent = {
  id: string
  step_key: string
  status: string
  error_code?: string
  job_id?: string
  created_at: string
}

type DirectorJobEvent = {
  id: string
  org_id: string
  workflow_id?: string
  workflow_run_id?: string
  batch_run_id?: string
  title: string
  status: string
  engine_used: string
  fallback_used: boolean
  created_by: string
  updated_at: string
  step_summary: Record<string, number>
  recent_steps: DirectorStepEvent[]
  metering_cents: number
  metering_calls: number
  selected_asset_count: number
}

type DirectorJobsSummary = {
  available: boolean
  total: number
  running: number
  failed: number
  fallback_runs: number
  advanced_runs: number
  recent: DirectorJobEvent[]
  unavailable_why?: string
}

type DirectorRuntimePolicy = {
  product_brand: string
  public_engine: string
  storage_mode: string
  task_status_mode: string
  billing_mode: string
  workflow_output_schema: string
  provider_keys_exposed: boolean
  upstream_exposed: boolean
}

type DirectorRuntimeConfig = {
  sidecar_configured: boolean
  sidecar_token_configured: boolean
  callback_configured: boolean
  callback_token_configured: boolean
  fallback_enabled: boolean
  fail_closed: boolean
  ready_for_sidecar: boolean
  missing_requirements?: string[]
  policy: DirectorRuntimePolicy
}

type AIDirectorAdminStatus = {
  providers: Array<{ type: string; configured: boolean; default_id?: string; model?: string }>
  active_vips: number
  runtime?: DirectorRuntimeConfig
  metering?: DirectorMeteringSummary
  jobs?: DirectorJobsSummary
  usage_notice: string
}

type AIDirectorEntitlement = {
  org_id: string
  enabled: boolean
  tier: string
  expires_at?: string
  note?: string
}

type ConfirmedOTP = Extract<OTPDialogResult, { confirmed: true }>

const TYPES = ["text", "image", "video"] as const
const CAPABILITIES = ["text", "image", "video", "avatar"] as const

type CapabilityKind = (typeof CAPABILITIES)[number]

export default function AIProvidersPage() {
  const t = useTranslations()
  const p = t.admin.aiProvidersPage
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [logs, setLogs] = useState<ProviderLog[]>([])
  const [directorStatus, setDirectorStatus] = useState<AIDirectorAdminStatus | null>(null)
  const [selected, setSelected] = useState<AIProvider | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    action: string
    target: string
    hint: string
    run: (result: ConfirmedOTP) => Promise<void>
  } | null>(null)
  const [form, setForm] = useState({
    name: "",
    type: "text",
    provider: "deepseek",
    baseUrl: "",
    apiKey: "",
    model: "deepseek-chat",
    enabled: false,
    isDefault: false,
    configJSON: "{}",
  })
  const [vipOrgID, setVipOrgID] = useState("")
  const [vipForm, setVipForm] = useState<AIDirectorEntitlement>({ org_id: "", enabled: true, tier: "vip", expires_at: "", note: "" })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [providerRes, logRes, directorRes] = await Promise.all([
        adminFetch("/ai-providers") as Promise<{ data?: AIProvider[] }>,
        adminFetch("/ai-provider-logs") as Promise<{ data?: ProviderLog[] }>,
        adminFetch("/ai-director/status") as Promise<AIDirectorAdminStatus>,
      ])
      setProviders(providerRes.data ?? [])
      setLogs(logRes.data ?? [])
      setDirectorStatus(directorRes)
    } catch (e) {
      setError(e instanceof Error ? e.message : p.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [p.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  function edit(row: AIProvider) {
    setSelected(row)
    setForm({
      name: row.name,
      type: row.type,
      provider: row.provider,
      baseUrl: row.base_url,
      apiKey: "",
      model: row.model,
      enabled: row.enabled,
      isDefault: row.is_default,
      configJSON: JSON.stringify(row.config_json ?? {}, null, 2),
    })
  }

  function reset() {
    setSelected(null)
    setForm({ name: "", type: "text", provider: "deepseek", baseUrl: "", apiKey: "", model: "deepseek-chat", enabled: false, isDefault: false, configJSON: "{}" })
  }

  function applyPreset(id: string) {
    const preset = presetByID(id)
    if (!preset) return
    setSelected(null)
    setForm((current) => ({
      ...current,
      name: preset.label,
      type: preset.type,
      provider: preset.provider,
      baseUrl: preset.baseURL,
      apiKey: "",
      model: preset.model,
      enabled: false,
      isDefault: false,
      configJSON: JSON.stringify({
        api_style: preset.apiStyle,
        capability: preset.capability,
        tier: preset.tier,
        anthropic_version: preset.apiStyle === "anthropic" ? "2023-06-01" : undefined,
      }, null, 2),
    }))
  }

  function withOTP(action: string, target: string, hint: string, run: (result: ConfirmedOTP) => Promise<void>) {
    setPending({ action, target, hint, run })
  }

  async function handleOTP(result: OTPDialogResult) {
    const current = pending
    setPending(null)
    if (!result.confirmed || !current) return
    try {
      await current.run(result)
      setOk(p.saved)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : p.saveFailed)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    let config: Record<string, unknown>
    try {
      config = JSON.parse(form.configJSON) as Record<string, unknown>
    } catch {
      setError("Invalid config JSON")
      return
    }
    if (form.isDefault && !form.enabled) {
      setError(p.defaultRequiresEnabled)
      return
    }
    if (providerRequiresManagedKey(form.type) && (form.enabled || form.isDefault) && !form.apiKey.trim() && !selected?.key_hint) {
      setError(p.keyRequiredWhenEnabled)
      return
    }
    const body = {
      name: form.name,
      type: form.type,
      provider: form.provider,
      base_url: form.baseUrl,
      api_key: form.apiKey,
      model: form.model,
      enabled: form.enabled,
      is_default: form.isDefault,
      config_json: config,
    }
    const path = selected ? `/ai-providers/${selected.id}` : "/ai-providers"
    const method = selected ? "PATCH" : "POST"
    withOTP("ai_provider.save", selected?.id ?? "new", p.otpProvider, async (result) => {
      await adminFetchWithOTP(path, result.otpId, result.otpCode, {
        method,
        body: JSON.stringify(body),
      })
      reset()
    })
  }

  function setDefault(row: AIProvider) {
    withOTP("ai_provider.default", row.id, `${p.setDefault}: ${row.name}`, async (result) => {
      await adminFetchWithOTP(`/ai-providers/${row.id}/default`, result.otpId, result.otpCode, { method: "POST" })
    })
  }

  function test(row: AIProvider) {
    withOTP("ai_provider.test", row.id, `${p.test}: ${row.name}`, async (result) => {
      await adminFetchWithOTP(`/ai-providers/${row.id}/test`, result.otpId, result.otpCode, { method: "POST" })
      setOk(p.testOK)
    })
  }

  function remove(row: AIProvider) {
    withOTP("ai_provider.delete", row.id, `${p.delete}: ${row.name}`, async (result) => {
      await adminFetchWithOTP(`/ai-providers/${row.id}`, result.otpId, result.otpCode, { method: "DELETE" })
      if (selected?.id === row.id) reset()
    })
  }

  async function loadEntitlement() {
    if (!vipOrgID.trim()) return
    setError(null)
    try {
      const row = await adminFetch(`/orgs/${vipOrgID.trim()}/ai-director`) as AIDirectorEntitlement
      setVipForm({
        org_id: row.org_id,
        enabled: row.enabled,
        tier: row.tier || "vip",
        expires_at: row.expires_at ?? "",
        note: row.note ?? "",
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : p.loadFailed)
    }
  }

  function saveEntitlement() {
    if (!vipOrgID.trim()) return
    withOTP("ai_director.entitlement", vipOrgID.trim(), p.otpDirector, async (result) => {
      await adminFetchWithOTP(`/orgs/${vipOrgID.trim()}/ai-director`, result.otpId, result.otpCode, {
        method: "PUT",
        body: JSON.stringify({
          enabled: vipForm.enabled,
          tier: vipForm.tier,
          expires_at: vipForm.expires_at || "",
          note: vipForm.note || "",
        }),
      })
    })
  }

  return (
    <AdminShell activeHref="/ai-providers" title={p.title} description={p.description}>
      <OTPDialog open={pending != null} action={pending?.action ?? "ai_provider"} targetId={pending?.target ?? ""} hint={pending?.hint ?? ""} onResult={handleOTP} />
      <div className="grid gap-6 p-6 xl:grid-cols-[430px_minmax(0,1fr)]">
        <form onSubmit={save} className="premium-surface space-y-4 rounded-3xl p-5">
          <h2 className="text-sm font-medium">{selected ? p.updateProvider : p.createProvider}</h2>
          {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          {ok && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">{ok}</div>}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {p.preset}
            <select className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-sm backdrop-blur-md" value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">{p.choosePreset}</option>
              {presetsForType(form.type).map((preset) => <option key={preset.id} value={preset.id}>{preset.label} · {preset.capability}</option>)}
            </select>
          </label>
          <Field label={p.name} value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {p.type}
            <select className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-sm backdrop-blur-md" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}>
              {TYPES.map((type) => <option key={type} value={type}>{p[type]}</option>)}
            </select>
          </label>
          <Field label={p.provider} value={form.provider} onChange={(v) => setForm((s) => ({ ...s, provider: v }))} />
          <Field label={p.baseURL} value={form.baseUrl} onChange={(v) => setForm((s) => ({ ...s, baseUrl: v }))} />
          <Field label={p.model} value={form.model} onChange={(v) => setForm((s) => ({ ...s, model: v }))} />
          <Field label={p.apiKey} value={form.apiKey} type="password" onChange={(v) => setForm((s) => ({ ...s, apiKey: v }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))} />{p.enabled}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((s) => ({ ...s, isDefault: e.target.checked, enabled: e.target.checked ? true : s.enabled }))} />{p.defaultProvider}</label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {p.configJSON}
            <textarea className="min-h-24 rounded-2xl border border-white/12 bg-background/55 px-3 py-2 font-mono text-xs text-foreground shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none" value={form.configJSON} onChange={(e) => setForm((s) => ({ ...s, configJSON: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button className="premium-button h-9 rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-4 text-sm font-medium text-white" type="submit">{selected ? p.updateProvider : p.createProvider}</button>
            <button className="h-9 rounded-full border border-white/12 bg-card/55 px-4 text-sm shadow-sm backdrop-blur-md" type="button" onClick={reset}>{t.common.cancel}</button>
          </div>
        </form>
        <div className="space-y-6">
          <section className="premium-surface rounded-3xl p-5">
            <h2 className="mb-2 text-sm font-medium">{p.directorStatus}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{directorStatus?.usage_notice ?? p.directorUsage}</p>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {(directorStatus?.providers ?? []).map((item) => (
                <div key={item.type} className="rounded-2xl border border-white/12 bg-background/55 p-3 shadow-sm backdrop-blur-md">
                  <div className="font-medium">{item.type}</div>
                  <div className={item.configured ? "text-emerald-600" : "text-muted-foreground"}>{item.configured ? p.configured : p.notConfigured}</div>
                  {item.model && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{item.model}</div>}
                </div>
              ))}
              <div className="rounded-2xl border border-white/12 bg-background/55 p-3 shadow-sm backdrop-blur-md">
                <div className="font-medium">{p.activeVIPs}</div>
                <div>{directorStatus?.active_vips ?? 0}</div>
              </div>
            </div>
            <DirectorRuntimePanel runtime={directorStatus?.runtime} copy={p} />
            <CapabilityMatrix providers={providers} directorStatus={directorStatus} copy={p} />
            <DirectorJobsPanel jobs={directorStatus?.jobs} copy={p} />
            <DirectorMeteringPanel metering={directorStatus?.metering} copy={p} />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
              <Field label={p.orgID} value={vipOrgID} onChange={setVipOrgID} />
              <button type="button" onClick={() => void loadEntitlement()} className="self-end rounded-full border border-white/12 bg-card/55 px-3 py-2 text-sm shadow-sm backdrop-blur-md">{p.loadVIP}</button>
            </div>
            {vipForm.org_id && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vipForm.enabled} onChange={(e) => setVipForm((s) => ({ ...s, enabled: e.target.checked }))} />{p.vipEnabled}</label>
                <Field label={p.tier} value={vipForm.tier} onChange={(v) => setVipForm((s) => ({ ...s, tier: v }))} />
                <Field label={p.expiresAt} value={vipForm.expires_at ?? ""} onChange={(v) => setVipForm((s) => ({ ...s, expires_at: v }))} />
                <Field label={p.note} value={vipForm.note ?? ""} onChange={(v) => setVipForm((s) => ({ ...s, note: v }))} />
                <button type="button" onClick={saveEntitlement} className="premium-button rounded-full border border-white/20 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.42),transparent_30%),linear-gradient(110deg,#2563eb_0%,#7c3aed_42%,#db2777_100%)] px-3 py-2 text-sm font-medium text-white">{p.saveVIP}</button>
              </div>
            )}
          </section>
          <section className="premium-surface rounded-3xl p-5">
            <h2 className="mb-4 text-sm font-medium">{p.title}</h2>
            {loading ? <div className="text-sm text-muted-foreground">{t.common.loading}...</div> : providers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 bg-background/35 p-6 text-sm text-muted-foreground">
                <div className="text-base font-medium text-foreground">{p.noProvidersTitle}</div>
                <p className="mt-2 max-w-2xl leading-relaxed">{p.noProvidersBody}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">{p.name}</th><th>{p.type}</th><th>{p.provider}</th><th>{p.apiKeyHint}</th><th>{p.enabled}</th><th>{p.defaultProvider}</th><th className="text-right">Actions</th></tr></thead>
                  <tbody>{providers.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{row.name}</td><td>{row.type}</td><td>{row.provider}</td><td className="font-mono text-xs">{row.key_hint || "-"}</td><td>{row.enabled ? p.enabled : p.disabled}</td><td>{row.is_default ? t.common.enabled : "-"}</td>
                      <td className="space-x-3 text-right text-xs"><button onClick={() => edit(row)}>{t.common.edit}</button><button onClick={() => test(row)}>{p.test}</button><button disabled={!providerHasRunnableConfig(row)} className="disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setDefault(row)}>{p.setDefault}</button><button className="text-destructive" onClick={() => remove(row)}>{p.delete}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="premium-surface rounded-3xl p-5">
            <h2 className="mb-4 text-sm font-medium">{p.logs}</h2>
            {logs.length === 0 ? <div className="text-sm text-muted-foreground">{p.noLogs}</div> : (
              <div className="space-y-2">{logs.slice(0, 20).map((log) => <div key={log.id} className="rounded-md border border-border/70 p-3 text-xs"><div className="font-mono text-muted-foreground">{new Date(log.created_at).toLocaleString()} · {log.type} · {log.response_summary}</div><div className="mt-1">{log.request_summary}</div>{log.error && <div className="mt-1 text-destructive">{log.error}</div>}</div>)}</div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  )
}

function DirectorRuntimePanel({
  runtime,
  copy,
}: {
  runtime?: DirectorRuntimeConfig
  copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]
}) {
  const policy = runtime?.policy
  const ready = Boolean(runtime?.ready_for_sidecar)
  return (
    <div className="mb-5 rounded-xl border border-border bg-background/55 p-3" data-admin-director-runtime>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{copy.runtimeTitle}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{copy.runtimeHint}</p>
        </div>
        <span className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${ready ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-amber-500/30 bg-amber-500/10 text-amber-600"}`}>
          {ready ? copy.runtimeReady : copy.runtimeNeedsConfig}
        </span>
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
        <RuntimeFlag label={copy.runtimeSidecar} active={Boolean(runtime?.sidecar_configured)} copy={copy} />
        <RuntimeFlag label={copy.runtimeSidecarAuth} active={Boolean(runtime?.sidecar_token_configured)} copy={copy} />
        <RuntimeFlag label={copy.runtimeCallback} active={Boolean(runtime?.callback_configured)} copy={copy} />
        <RuntimeFlag label={copy.runtimeCallbackAuth} active={Boolean(runtime?.callback_token_configured)} copy={copy} />
        <RuntimeFlag label={copy.runtimeFallback} active={Boolean(runtime?.fallback_enabled)} copy={copy} enabledTone />
        <RuntimeFlag label={copy.runtimeFailClosed} active={Boolean(runtime?.fail_closed)} copy={copy} enabledTone />
      </div>
      {!ready && runtime?.missing_requirements && runtime.missing_requirements.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
          <div className="mb-2 font-medium text-amber-700 dark:text-amber-200">{copy.runtimeMissing}</div>
          <div className="flex flex-wrap gap-1.5">
            {runtime.missing_requirements.map((item) => (
              <span key={item} className="rounded-md border border-amber-500/20 bg-background/70 px-2 py-1 font-mono text-[11px] text-amber-700 dark:text-amber-200">{item}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
        <CapabilityLine label={copy.runtimeProduct} value={policy?.product_brand ?? "NextAPI Director"} />
        <CapabilityLine label={copy.runtimeEngine} value={policy?.public_engine ?? "advanced"} mono />
        <CapabilityLine label={copy.runtimeStorage} value={policy?.storage_mode ?? "nextapi_assets"} mono />
        <CapabilityLine label={copy.runtimeTaskStatus} value={policy?.task_status_mode ?? "nextapi_workflow_jobs"} mono />
        <CapabilityLine label={copy.runtimeBilling} value={policy?.billing_mode ?? "nextapi_billing"} mono />
        <CapabilityLine label={copy.runtimePolicy} value={policy?.workflow_output_schema ?? "nextapi.director.storyboard.v1"} mono />
        <CapabilityLine label={copy.runtimeNoExternalKeys} value={policy?.provider_keys_exposed ? copy.disabled : copy.enabled} />
        <CapabilityLine label={copy.runtimeUpstreamHidden} value={policy?.upstream_exposed ? copy.disabled : copy.enabled} />
      </div>
    </div>
  )
}

function RuntimeFlag({
  label,
  active,
  enabledTone = false,
  copy,
}: {
  label: string
  active: boolean
  enabledTone?: boolean
  copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]
}) {
  const tone = active
    ? enabledTone ? "border-sky-500/30 bg-sky-500/10 text-sky-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
    : "border-border bg-card/45 text-muted-foreground"
  return (
    <div className={`rounded-lg border p-2.5 ${tone}`}>
      <div className="font-medium text-foreground">{label}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em]">
        {active ? (enabledTone ? copy.enabled : copy.configured) : (enabledTone ? copy.disabled : copy.notConfigured)}
      </div>
    </div>
  )
}

function DirectorMeteringPanel({
  metering,
  copy,
}: {
  metering?: DirectorMeteringSummary
  copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]
}) {
  const unavailable = !metering || !metering.available
  return (
    <div className="mb-5 rounded-3xl border border-white/12 bg-background/35 p-4 shadow-inner backdrop-blur-md">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{copy.directorMeteringTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {unavailable ? copy.directorMeteringUnavailable : copy.directorMeteringHint}
          </p>
        </div>
      </div>
      <div className="mb-4 grid gap-2 text-xs md:grid-cols-3">
        <MetricCard label={copy.calls24h} value={String(metering?.calls_24h ?? 0)} />
        <MetricCard label={copy.units24h} value={formatCompactNumber(metering?.units_24h ?? 0)} />
        <MetricCard label={copy.rated24h} value={formatMoney(metering?.rated_cents_24h ?? 0)} />
      </div>
      {metering?.recent?.length ? (
        <div className="space-y-2">
          {metering.recent.slice(0, 6).map((event) => (
            <div key={event.id} className="flex flex-col gap-2 rounded-2xl border border-white/12 bg-card/45 p-3 text-xs shadow-sm backdrop-blur-md md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium">{event.meter_type} · {event.status}</div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()} · org {event.org_id.slice(0, 8)}
                  {event.director_job_id ? ` · director ${event.director_job_id.slice(0, 8)}` : ""}
                  {event.step_id ? ` · step ${event.step_id.slice(0, 8)}` : ""}
                </div>
              </div>
              <div className="flex gap-2 text-muted-foreground">
                <span>{copy.units}: {formatCompactNumber(event.units)}</span>
                <span>{copy.cost}: {formatMoney(event.actual_cents)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/12 bg-card/35 p-4 text-xs text-muted-foreground">
          {copy.noDirectorMetering}
        </div>
      )}
    </div>
  )
}

function DirectorJobsPanel({
  jobs,
  copy,
}: {
  jobs?: DirectorJobsSummary
  copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]
}) {
  const unavailable = !jobs || !jobs.available
  const fallbackRate = jobs && jobs.total > 0 ? Math.round((jobs.fallback_runs / jobs.total) * 100) : 0
  return (
    <div className="mb-5 rounded-3xl border border-white/12 bg-background/35 p-4 shadow-inner backdrop-blur-md">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{copy.directorJobsTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {unavailable ? copy.directorJobsUnavailable : copy.directorJobsHint}
          </p>
        </div>
      </div>
      <div className="mb-4 grid gap-2 text-xs md:grid-cols-5">
        <MetricCard label={copy.directorJobsTotal} value={String(jobs?.total ?? 0)} />
        <MetricCard label={copy.directorJobsRunning} value={String(jobs?.running ?? 0)} />
        <MetricCard label={copy.directorJobsFailed} value={String(jobs?.failed ?? 0)} />
        <MetricCard label={copy.directorJobsAdvanced} value={String(jobs?.advanced_runs ?? 0)} />
        <MetricCard label={copy.directorJobsFallbackRate} value={`${fallbackRate}%`} />
      </div>
      {jobs?.recent?.length ? (
        <div className="space-y-2">
          {jobs.recent.slice(0, 5).map((job) => (
            <div key={job.id} className="rounded-2xl border border-white/12 bg-card/45 p-3 text-xs shadow-sm backdrop-blur-md">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{job.title || copy.untitledDirectorJob}</span>
                    <StatusPill status={job.status} />
                    {job.fallback_used && <StatusPill status="fallback" />}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {job.id.slice(0, 8)} · {job.engine_used || copy.noDefault} · {new Date(job.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right text-muted-foreground">
                  <div><div>{copy.directorJobSteps}</div><div className="font-mono text-foreground">{job.recent_steps.length}</div></div>
                  <div><div>{copy.directorJobCalls}</div><div className="font-mono text-foreground">{job.metering_calls}</div></div>
                  <div><div>{copy.directorJobCost}</div><div className="font-mono text-foreground">{formatMoney(job.metering_cents)}</div></div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.recent_steps.slice(0, 6).map((step) => (
                  <span key={step.id} className="rounded-full border border-white/12 bg-background/55 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                    {step.step_key}:{step.status}{step.error_code ? `/${step.error_code}` : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/12 bg-card/35 p-4 text-xs text-muted-foreground">
          {copy.noDirectorJobs}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "failed" ? "border-rose-400/30 bg-rose-500/10 text-rose-500" :
    status === "running" || status === "queued" || status === "planning" ? "border-sky-400/30 bg-sky-500/10 text-sky-600" :
    status === "fallback" ? "border-amber-400/30 bg-amber-500/10 text-amber-600" :
    "border-emerald-400/30 bg-emerald-500/10 text-emerald-600"
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>{status}</span>
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-card/45 p-3 shadow-sm backdrop-blur-md">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm text-foreground">{value}</div>
    </div>
  )
}

function CapabilityMatrix({
  providers,
  directorStatus,
  copy,
}: {
  providers: AIProvider[]
  directorStatus: AIDirectorAdminStatus | null
  copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]
}) {
  const hintByCapability: Record<CapabilityKind, string> = {
    text: copy.missingTextHint,
    image: copy.missingImageHint,
    video: copy.missingVideoHint,
    avatar: copy.missingAvatarHint,
  }

  return (
    <div className="mb-5 rounded-3xl border border-white/12 bg-background/35 p-4 shadow-inner backdrop-blur-md">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{copy.modelCoverage}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy.modelCoverageHint}</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((capability) => {
          const configuredProviders = providers.filter((provider) => providerSupportsCapability(provider, capability))
          const runnableProviders = configuredProviders.filter(providerHasRunnableConfig)
          const enabledProviders = runnableProviders.filter((provider) => provider.enabled)
          const presets = AI_PROVIDER_PRESETS.filter((preset) => presetSupportsCapability(preset, capability))
          const status = capabilityStatus(capability, enabledProviders, runnableProviders, directorStatus)
          const defaultModel = capabilityDefaultModel(capability, runnableProviders, directorStatus)
          const toneClass = status === "live"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
            : status === "configured"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
              : "border-white/12 bg-card/45 text-muted-foreground"

          return (
            <article key={capability} className="rounded-2xl border border-white/12 bg-card/45 p-3 text-xs shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{capabilityLabel(capability, copy)}</div>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${toneClass}`}>
                  {status === "live" ? copy.live : status === "configured" ? copy.configuredOnly : copy.notLive}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-muted-foreground">
                <CapabilityLine label={copy.defaultModel} value={defaultModel || copy.noDefault} mono />
                <CapabilityLine label={copy.enabledProviders} value={String(enabledProviders.length)} />
                <CapabilityLine label={copy.presetCount} value={String(presets.length)} />
              </div>
              <p className="mt-3 min-h-10 text-[11px] leading-relaxed text-muted-foreground">
                {status === "live" ? copy.readyHint : hintByCapability[capability]}
              </p>
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{copy.presets}</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.slice(0, 3).map((preset) => (
                    <span key={preset.id} className="rounded-full border border-white/12 bg-background/45 px-2 py-0.5 text-[10px] text-foreground">
                      {preset.model}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function CapabilityLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className={mono ? "max-w-32 truncate font-mono text-[10px] text-foreground" : "font-medium text-foreground"}>
        {value}
      </span>
    </div>
  )
}

function capabilityLabel(capability: CapabilityKind, copy: ReturnType<typeof useTranslations>["admin"]["aiProvidersPage"]) {
  if (capability === "avatar") return copy.avatar
  return copy[capability]
}

function capabilityStatus(
  capability: CapabilityKind,
  enabledProviders: AIProvider[],
  configuredProviders: AIProvider[],
  directorStatus: AIDirectorAdminStatus | null,
): "live" | "configured" | "missing" {
  const directorProvider = capability === "avatar" ? null : directorStatus?.providers.find((item) => item.type === capability)
  if (capability !== "avatar") {
    if (directorProvider?.configured) return "live"
    if (enabledProviders.length > 0 || configuredProviders.length > 0 || directorProvider?.model) return "configured"
    return "missing"
  }
  if (enabledProviders.some((provider) => provider.is_default)) return "live"
  if (enabledProviders.length > 0 || configuredProviders.length > 0) return "configured"
  return "missing"
}

function capabilityDefaultModel(
  capability: CapabilityKind,
  configuredProviders: AIProvider[],
  directorStatus: AIDirectorAdminStatus | null,
) {
  if (capability !== "avatar") {
    const directorProvider = directorStatus?.providers.find((item) => item.type === capability)
    if (directorProvider?.model) return directorProvider.model
  }
  return configuredProviders.find((provider) => provider.is_default)?.model ?? configuredProviders[0]?.model ?? ""
}

function providerSupportsCapability(provider: AIProvider, capability: CapabilityKind) {
  if (capability === "avatar") return isAvatarModel(provider.model, provider.name, provider.config_json)
  if (capability === "video") return provider.type === "video" && !isAvatarModel(provider.model, provider.name, provider.config_json)
  return provider.type === capability
}

function providerHasRunnableConfig(provider: AIProvider) {
  if (!provider.model.trim()) return false
  if (providerRequiresManagedKey(provider.type) && !provider.key_hint) return false
  return true
}

function providerRequiresManagedKey(type: string) {
  return type === "text" || type === "image"
}

function presetSupportsCapability(preset: AIProviderPreset, capability: CapabilityKind) {
  if (capability === "avatar") return isAvatarModel(preset.model, preset.label, { capability: preset.capability })
  if (capability === "video") return preset.type === "video" && !isAvatarModel(preset.model, preset.label, { capability: preset.capability })
  return preset.type === capability
}

function isAvatarModel(model: string, name: string, config?: Record<string, unknown>) {
  const capability = typeof config?.capability === "string" ? config.capability : ""
  const haystack = `${model} ${name} ${capability}`.toLowerCase()
  return haystack.includes("avatar") || haystack.includes("omnihuman") || haystack.includes("digital human") || haystack.includes("数字人")
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}<input type={type} className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}
