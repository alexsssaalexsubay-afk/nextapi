"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { presetByID, presetsForType } from "@/lib/ai-provider-presets"
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

type AIDirectorAdminStatus = {
  providers: Array<{ type: string; configured: boolean; default_id?: string; model?: string }>
  active_vips: number
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
    enabled: true,
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
    setForm({ name: "", type: "text", provider: "deepseek", baseUrl: "", apiKey: "", model: "deepseek-chat", enabled: true, isDefault: false, configJSON: "{}" })
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
      model: preset.model,
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
    let config: Record<string, unknown>
    try {
      config = JSON.parse(form.configJSON) as Record<string, unknown>
    } catch {
      setError("Invalid config JSON")
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
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((s) => ({ ...s, isDefault: e.target.checked }))} />{p.defaultProvider}</label>
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
            {loading ? <div className="text-sm text-muted-foreground">{t.common.loading}...</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">{p.name}</th><th>{p.type}</th><th>{p.provider}</th><th>{p.apiKeyHint}</th><th>{p.defaultProvider}</th><th className="text-right">Actions</th></tr></thead>
                  <tbody>{providers.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-2">{row.name}</td><td>{row.type}</td><td>{row.provider}</td><td className="font-mono text-xs">{row.key_hint || "-"}</td><td>{row.is_default ? t.common.enabled : "-"}</td>
                      <td className="space-x-3 text-right text-xs"><button onClick={() => edit(row)}>{t.common.edit}</button><button onClick={() => test(row)}>{p.test}</button><button onClick={() => setDefault(row)}>{p.setDefault}</button><button className="text-destructive" onClick={() => remove(row)}>{p.delete}</button></td>
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

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}<input type={type} className="h-9 rounded-2xl border border-white/12 bg-background/55 px-3 text-sm text-foreground shadow-inner backdrop-blur-md focus:border-signal/45 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}
