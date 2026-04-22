"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
} from "@nextapi/ui";
import { AlertTriangle } from "lucide-react";
import { apiFetch, centsToUsd, usdToCents } from "@/lib/api";

type SpendControls = {
  hard_cap_cents: number | null;
  soft_alert_cents: number | null;
  auto_pause_below_cents: number | null;
  monthly_limit_cents: number | null;
  period_resets_on: number;
  burn_rate_cents_per_day: number | null;
  paused_at: string | null;
  pause_reason: string | null;
};

type Credits = {
  balance_cents: number;
  current_period_spend_cents: number;
  period_resets_on: number;
  lifetime_spend_cents: number;
};

type SpendAlert = {
  id: number;
  kind: string;
  amount_cents: number;
  fired_at: string;
  period_start: string;
};

export default function BudgetPage() {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [controls, setControls] = useState<SpendControls | null>(null);
  const [alerts, setAlerts] = useState<SpendAlert[]>([]);
  const [hardCap, setHardCap] = useState("");
  const [softAlert, setSoftAlert] = useState("");
  const [autoPause, setAutoPause] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [resetDay, setResetDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [c, s, a] = await Promise.all([
      apiFetch<Credits>("/v1/credits"),
      apiFetch<SpendControls>("/v1/spend_controls"),
      apiFetch<{ data: SpendAlert[] }>("/v1/spend_alerts?limit=20"),
    ]);
    if (c.ok && c.data) setCredits(c.data);
    if (s.ok && s.data) {
      setControls(s.data);
      setHardCap(centsToUsd(s.data.hard_cap_cents));
      setSoftAlert(centsToUsd(s.data.soft_alert_cents));
      setAutoPause(centsToUsd(s.data.auto_pause_below_cents));
      setMonthlyLimit(centsToUsd(s.data.monthly_limit_cents));
      setResetDay(s.data.period_resets_on || 1);
    }
    if (a.ok && a.data) setAlerts(a.data.data ?? []);
    setDegraded(!c.ok || !s.ok);
  }

  async function save() {
    setSaving(true);
    const body = {
      hard_cap_cents: usdToCents(hardCap),
      soft_alert_cents: usdToCents(softAlert),
      auto_pause_below_cents: usdToCents(autoPause),
      monthly_limit_cents: usdToCents(monthlyLimit),
      period_resets_on: resetDay,
    };
    await apiFetch("/v1/spend_controls", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setSaving(false);
    void load();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Budget & spend controls</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Configure caps, alerts, and auto-pause to stop runaway spend.
      </p>

      {degraded && (
        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
          Some data is temporarily unavailable. Showing empty state.
        </div>
      )}

      {controls?.paused_at && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-red-700 bg-red-950/30 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm text-red-200">
              Organization paused ({controls.pause_reason ?? "unknown"}) at{" "}
              {new Date(controls.paused_at).toLocaleString()}. New video jobs are refused.
            </p>
            <a
              className="mt-2 inline-block text-sm text-red-300 underline opacity-60"
              href="mailto:support@nextapi.top"
            >
              Contact support to unpause
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle>
              ${credits ? centsToUsd(credits.balance_cents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Current period spend</CardDescription>
            <CardTitle>
              ${credits ? centsToUsd(credits.current_period_spend_cents) : "—"}
            </CardTitle>
            <p className="mt-1 text-xs text-zinc-500">
              Period resets on day {credits?.period_resets_on ?? "—"} of month
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Current burn rate</CardDescription>
            <CardTitle>
              {controls?.burn_rate_cents_per_day != null
                ? `${controls.burn_rate_cents_per_day}¢/day`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Caps & alerts (USD)</CardTitle>
          <CardDescription>Leave blank to disable.</CardDescription>
        </CardHeader>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Hard cap (period)" value={hardCap} onChange={setHardCap} />
          <Field label="Soft alert threshold" value={softAlert} onChange={setSoftAlert} />
          <Field label="Auto-pause below balance" value={autoPause} onChange={setAutoPause} />
          <Field label="Monthly limit" value={monthlyLimit} onChange={setMonthlyLimit} />
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Period resets on (day of month)
            </label>
            <select
              value={resetDay}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setResetDay(Number(e.target.value))
              }
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save controls"}
          </Button>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Billing settings</CardTitle>
          <CardDescription>Invoice details for your organization.</CardDescription>
        </CardHeader>
        <BillingSettings />
      </Card>

      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          onClick={() => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            const end = now.toISOString();
            window.open(`/api/proxy/v1/usage.csv?start=${start}&end=${end}`, "_blank");
          }}
        >
          Download usage CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open("/api/proxy/v1/ledger.csv", "_blank")}
        >
          Download ledger CSV
        </Button>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent alerts</h2>
        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Amount</TH>
                <TH>Period</TH>
                <TH>Fired at</TH>
              </TR>
            </THead>
            <TBody>
              {alerts.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-zinc-500">
                    No alerts in this period.
                  </TD>
                </TR>
              ) : (
                alerts.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Badge variant="warning">{a.kind}</Badge>
                    </TD>
                    <TD>${centsToUsd(a.amount_cents)}</TD>
                    <TD>{new Date(a.period_start).toLocaleDateString()}</TD>
                    <TD>{new Date(a.fired_at).toLocaleString()}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-400">{label}</label>
      <Input
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}

type BillingInfo = {
  company_name: string | null;
  tax_id: string | null;
  billing_email: string | null;
  country_region: string | null;
};

function BillingSettings() {
  const [info, setInfo] = useState<BillingInfo>({
    company_name: null,
    tax_id: null,
    billing_email: null,
    country_region: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<BillingInfo>("/v1/billing/settings").then((r) => {
      if (r.ok && r.data) setInfo(r.data);
    });
  }, []);

  async function saveBilling() {
    setSaving(true);
    await apiFetch("/v1/billing/settings", {
      method: "PATCH",
      body: JSON.stringify(info),
    });
    setSaving(false);
  }

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Company name</label>
        <Input
          value={info.company_name ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInfo({ ...info, company_name: e.target.value })
          }
          placeholder="Legal entity name"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Tax ID</label>
        <Input
          value={info.tax_id ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInfo({ ...info, tax_id: e.target.value })
          }
          placeholder="VAT / EIN / USCC"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Billing email</label>
        <Input
          value={info.billing_email ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInfo({ ...info, billing_email: e.target.value })
          }
          placeholder="billing@company.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Country / Region</label>
        <Input
          value={info.country_region ?? ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInfo({ ...info, country_region: e.target.value })
          }
          placeholder="e.g. HK, US, CN"
        />
      </div>
      <div className="md:col-span-2">
        <Button onClick={saveBilling} disabled={saving}>
          {saving ? "Saving…" : "Save billing info"}
        </Button>
      </div>
    </div>
  );
}
