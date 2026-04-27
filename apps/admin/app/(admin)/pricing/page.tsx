"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { AdminShell } from "@/components/admin/admin-shell"
import { OTPDialog, type OTPDialogResult } from "@/components/admin/otp-dialog"
import { adminFetch, adminFetchWithOTP } from "@/lib/admin-api"
import { useTranslations } from "@/lib/i18n/context"

type Settings = {
  enabled: boolean
  default_markup_bps: number
  min_charge_cents: number
  rounding_increment_cents: number
  updated_at?: string
}

type Tier = {
  ID?: string
  id?: string
  Name?: string
  name?: string
  MinLifetimeTopupCents?: number
  min_lifetime_topup_cents?: number
  MarkupBPS?: number
  markup_bps?: number
  Enabled?: boolean
  enabled?: boolean
  Description?: string
  description?: string
}

type OrgPricing = {
  override?: {
    OverrideEnabled?: boolean
    override_enabled?: boolean
    MarkupBPS?: number | null
    markup_bps?: number | null
    ManualMembershipTierID?: string | null
    manual_membership_tier_id?: string | null
  }
  state?: {
    LifetimeTopupCents?: number
    lifetime_topup_cents?: number
    EffectiveMembershipTierID?: string | null
    effective_membership_tier_id?: string | null
  }
  effective_markup_bps?: number
  pricing_source?: string
}

type Margins = {
  customer_revenue_cents: number
  upstream_cost_cents: number
  margin_cents: number
  jobs: number
}

type ConfirmedOTP = Extract<OTPDialogResult, { confirmed: true }>

function tierID(tier: Tier) {
  return tier.ID ?? tier.id ?? ""
}
function tierName(tier: Tier) {
  return tier.Name ?? tier.name ?? ""
}
function tierThreshold(tier: Tier) {
  return tier.MinLifetimeTopupCents ?? tier.min_lifetime_topup_cents ?? 0
}
function tierMarkup(tier: Tier) {
  return tier.MarkupBPS ?? tier.markup_bps ?? 0
}
function tierEnabled(tier: Tier) {
  return tier.Enabled ?? tier.enabled ?? true
}
function pct(bps: number) {
  return `${(bps / 100).toFixed(2)}%`
}
function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function PricingPage() {
  const t = useTranslations()
  const p = t.admin.pricingPage
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [margins, setMargins] = useState<Margins | null>(null)
  const [orgID, setOrgID] = useState("")
  const [orgPricing, setOrgPricing] = useState<OrgPricing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    action: string
    target: string
    hint: string
    run: (result: ConfirmedOTP) => Promise<void>
  } | null>(null)

  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    defaultMarkupBPS: "3000",
    minChargeCents: "1",
    roundingIncrementCents: "1",
  })
  const [tierForm, setTierForm] = useState({
    name: "",
    minLifetimeTopupCents: "",
    markupBPS: "",
    description: "",
  })
  const [orgForm, setOrgForm] = useState({
    overrideEnabled: false,
    markupBPS: "",
    manualTierID: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [settingsRes, tiersRes, marginRes] = await Promise.all([
        adminFetch("/pricing/settings") as Promise<Settings>,
        adminFetch("/pricing/tiers") as Promise<{ data?: Tier[] }>,
        adminFetch("/pricing/margins?window=30d") as Promise<Margins>,
      ])
      setSettings(settingsRes)
      setTiers(tiersRes.data ?? [])
      setMargins(marginRes)
      setSettingsForm({
        enabled: settingsRes.enabled,
        defaultMarkupBPS: String(settingsRes.default_markup_bps ?? 0),
        minChargeCents: String(settingsRes.min_charge_cents ?? 1),
        roundingIncrementCents: String(settingsRes.rounding_increment_cents ?? 1),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : p.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [p.loadFailed])

  useEffect(() => {
    load()
  }, [load])

  const preview = useMemo(() => {
    const upstream = 1000
    const markup = Number(settingsForm.defaultMarkupBPS || 0)
    return Math.ceil(upstream * (10000 + markup) / 10000)
  }, [settingsForm.defaultMarkupBPS])

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

  function saveSettings(e: FormEvent) {
    e.preventDefault()
    const body = {
      enabled: settingsForm.enabled,
      default_markup_bps: Math.trunc(Number(settingsForm.defaultMarkupBPS)),
      min_charge_cents: Math.trunc(Number(settingsForm.minChargeCents)),
      rounding_increment_cents: Math.trunc(Number(settingsForm.roundingIncrementCents)),
    }
    withOTP("pricing.settings", "1", p.otpSettings, async (result) => {
      await adminFetchWithOTP("/pricing/settings", result.otpId, result.otpCode, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    })
  }

  function createTier(e: FormEvent) {
    e.preventDefault()
    const body = {
      name: tierForm.name,
      min_lifetime_topup_cents: Math.trunc(Number(tierForm.minLifetimeTopupCents)),
      markup_bps: Math.trunc(Number(tierForm.markupBPS)),
      enabled: true,
      description: tierForm.description,
    }
    withOTP("pricing.tier.create", "membership_tiers", p.otpTier, async (result) => {
      await adminFetchWithOTP("/pricing/tiers", result.otpId, result.otpCode, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setTierForm({ name: "", minLifetimeTopupCents: "", markupBPS: "", description: "" })
    })
  }

  function toggleTier(tier: Tier) {
    const id = tierID(tier)
    withOTP("pricing.tier.update", id, `${p.toggleTier}: ${tierName(tier)}`, async (result) => {
      await adminFetchWithOTP(`/pricing/tiers/${id}`, result.otpId, result.otpCode, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !tierEnabled(tier) }),
      })
    })
  }

  async function loadOrgPricing() {
    if (!orgID.trim()) return
    setError(null)
    try {
      const data = (await adminFetch(`/orgs/${orgID.trim()}/pricing`)) as OrgPricing
      setOrgPricing(data)
      const override = data.override
      setOrgForm({
        overrideEnabled: override?.OverrideEnabled ?? override?.override_enabled ?? false,
        markupBPS: String(override?.MarkupBPS ?? override?.markup_bps ?? ""),
        manualTierID: override?.ManualMembershipTierID ?? override?.manual_membership_tier_id ?? "",
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : p.loadFailed)
    }
  }

  function saveOrgPricing(e: FormEvent) {
    e.preventDefault()
    const id = orgID.trim()
    if (!id) return
    const manualTier = orgForm.manualTierID.trim()
    const body = {
      override_enabled: orgForm.overrideEnabled,
      markup_bps: orgForm.markupBPS.trim() === "" ? null : Math.trunc(Number(orgForm.markupBPS)),
      manual_membership_tier_id: manualTier,
      clear_manual_membership: manualTier === "",
    }
    withOTP("pricing.org.update", id, `${p.otpOrg} ${id}`, async (result) => {
      const data = await adminFetchWithOTP(`/orgs/${id}/pricing`, result.otpId, result.otpCode, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
      setOrgPricing(data as OrgPricing)
    })
  }

  return (
    <AdminShell activeHref="/pricing" title={p.title} description={p.description}>
      <OTPDialog
        open={pending != null}
        action={pending?.action ?? "pricing"}
        targetId={pending?.target ?? "pricing"}
        hint={pending?.hint ?? ""}
        onResult={handleOTP}
      />
      <div className="space-y-6 p-6">
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
        {ok && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600">{ok}</div>}
        {loading && <div className="text-sm text-muted-foreground">{t.common.loading}...</div>}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label={p.revenue} value={money(margins?.customer_revenue_cents ?? 0)} />
          <Metric label={p.upstreamCost} value={money(margins?.upstream_cost_cents ?? 0)} />
          <Metric label={p.margin} value={money(margins?.margin_cents ?? 0)} />
          <Metric label={p.jobs} value={String(margins?.jobs ?? 0)} />
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="mb-1 text-sm font-medium">{p.globalSettings}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{p.preview}: {money(1000)} {"->"} {money(preview)}</p>
          <form onSubmit={saveSettings} className="grid gap-3 md:grid-cols-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settingsForm.enabled} onChange={(e) => setSettingsForm((v) => ({ ...v, enabled: e.target.checked }))} />
              {p.enabled}
            </label>
            <Field label={p.defaultMarkupBPS} value={settingsForm.defaultMarkupBPS} onChange={(v) => setSettingsForm((s) => ({ ...s, defaultMarkupBPS: v }))} />
            <Field label={p.minChargeCents} value={settingsForm.minChargeCents} onChange={(v) => setSettingsForm((s) => ({ ...s, minChargeCents: v }))} />
            <Field label={p.roundingIncrementCents} value={settingsForm.roundingIncrementCents} onChange={(v) => setSettingsForm((s) => ({ ...s, roundingIncrementCents: v }))} />
            <button className="h-9 self-end rounded-md bg-foreground px-4 text-sm text-background" type="submit">{p.saveWithOTP}</button>
          </form>
          {settings?.updated_at && <p className="mt-3 text-xs text-muted-foreground">{p.updated} {new Date(settings.updated_at).toLocaleString()}</p>}
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="mb-4 text-sm font-medium">{p.membershipTiers}</h2>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">{p.tier}</th><th>{p.threshold}</th><th>{p.markup}</th><th>{p.status}</th><th className="text-right">{p.actions}</th></tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tierID(tier)} className="border-t border-border">
                    <td className="py-2">{tierName(tier)}</td>
                    <td className="font-mono text-xs">{money(tierThreshold(tier))}</td>
                    <td className="font-mono text-xs">{pct(tierMarkup(tier))}</td>
                    <td>{tierEnabled(tier) ? t.common.enabled : t.common.disabled}</td>
                    <td className="text-right"><button className="text-xs text-signal" onClick={() => toggleTier(tier)}>{tierEnabled(tier) ? p.disable : p.enable}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={createTier} className="grid gap-3 md:grid-cols-5">
            <Field label={p.name} value={tierForm.name} onChange={(v) => setTierForm((s) => ({ ...s, name: v }))} />
            <Field label={p.thresholdCents} value={tierForm.minLifetimeTopupCents} onChange={(v) => setTierForm((s) => ({ ...s, minLifetimeTopupCents: v }))} />
            <Field label={p.markupBPS} value={tierForm.markupBPS} onChange={(v) => setTierForm((s) => ({ ...s, markupBPS: v }))} />
            <Field label={p.descriptionLabel} value={tierForm.description} onChange={(v) => setTierForm((s) => ({ ...s, description: v }))} />
            <button className="h-9 self-end rounded-md border border-border px-4 text-sm" type="submit">{p.createTier}</button>
          </form>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="mb-4 text-sm font-medium">{p.orgOverride}</h2>
          <div className="mb-4 flex gap-2">
            <input className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm" placeholder={p.orgIDPlaceholder} value={orgID} onChange={(e) => setOrgID(e.target.value)} />
            <button className="h-9 rounded-md border border-border px-4 text-sm" type="button" onClick={loadOrgPricing}>{p.load}</button>
          </div>
          {orgPricing && (
            <form onSubmit={saveOrgPricing} className="grid gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={orgForm.overrideEnabled} onChange={(e) => setOrgForm((v) => ({ ...v, overrideEnabled: e.target.checked }))} />
                {p.overrideEnabled}
              </label>
              <Field label={p.orgMarkupBPS} value={orgForm.markupBPS} onChange={(v) => setOrgForm((s) => ({ ...s, markupBPS: v }))} />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {p.manualTier}
                <select className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={orgForm.manualTierID} onChange={(e) => setOrgForm((s) => ({ ...s, manualTierID: e.target.value }))}>
                  <option value="">{p.autoTier}</option>
                  {tiers.map((tier) => <option key={tierID(tier)} value={tierID(tier)}>{tierName(tier)}</option>)}
                </select>
              </label>
              <button className="h-9 self-end rounded-md bg-foreground px-4 text-sm text-background" type="submit">{p.saveWithOTP}</button>
              <p className="md:col-span-4 text-xs text-muted-foreground">
                {p.effective}: {pct(orgPricing.effective_markup_bps ?? 0)} ({orgPricing.pricing_source ?? "global"})
              </p>
            </form>
          )}
        </section>
      </div>
    </AdminShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/80 bg-card/40 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
