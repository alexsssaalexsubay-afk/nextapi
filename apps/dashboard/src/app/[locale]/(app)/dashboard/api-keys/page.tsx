"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Card,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  StatusBadge,
  Badge,
} from "@nextapi/ui";
import { Copy, AlertTriangle, X } from "lucide-react";
import { apiFetch, usdToCents } from "@/lib/api";

type Key = {
  id: string;
  prefix: string;
  name: string;
  env: "live" | "test";
  disabled: boolean;
  allowed_models: string[] | null;
  rate_limit_rpm: number | null;
  moderation_profile: string | null;
  scopes: string[] | null;
  monthly_spend_cap_cents: number | null;
  ip_allowlist: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const SCOPE_OPTIONS = [
  "videos:write",
  "videos:read",
  "jobs:read",
  "webhooks:manage",
  "keys:manage",
];
const MODERATION_OPTIONS = ["", "strict", "balanced", "relaxed", "custom"];

type CreateForm = {
  name: string;
  env: "live" | "test";
  scopes: string[];
  allowed_models: string;
  monthly_spend_cap_usd: string;
  rate_limit_rpm: string;
  moderation_profile: string;
  ip_allowlist: string;
};

const EMPTY_FORM: CreateForm = {
  name: "",
  env: "live",
  scopes: ["videos:write", "jobs:read"],
  allowed_models: "",
  monthly_spend_cap_usd: "",
  rate_limit_rpm: "",
  moderation_profile: "",
  ip_allowlist: "",
};

export default function ApiKeysPage() {
  const t = useTranslations("keys");
  const [keys, setKeys] = useState<Key[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const r = await apiFetch<{ data: Key[] }>("/v1/keys");
    if (r.ok && r.data) setKeys(r.data.data ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!form.name.trim()) return;
    setLoading(true);
    const body = {
      name: form.name,
      env: form.env,
      scopes: form.scopes,
      allowed_models: form.allowed_models
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      monthly_spend_cap_cents: usdToCents(form.monthly_spend_cap_usd),
      rate_limit_rpm: form.rate_limit_rpm ? Number(form.rate_limit_rpm) : null,
      moderation_profile: form.moderation_profile || null,
      ip_allowlist: form.ip_allowlist
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const r = await apiFetch<{ key: string }>("/v1/keys", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (r.ok && r.data) {
      setJustCreated(r.data.key);
      setForm(EMPTY_FORM);
      setOpen(false);
      void load();
    }
  }

  async function toggleDisabled(k: Key) {
    await apiFetch(`/v1/keys/${k.id}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: !k.disabled }),
    });
    void load();
  }

  async function revoke(id: string) {
    await apiFetch(`/v1/keys/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Button onClick={() => setOpen(true)}>{t("create")}</Button>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Use these bearer tokens to authenticate requests to api.nextapi.top.
      </p>

      {justCreated && (
        <Card className="mt-6">
          <div className="flex items-start gap-3 rounded-md border border-amber-700 bg-amber-950/30 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm text-amber-200">{t("showOnceWarning")}</p>
              <code className="mt-2 block break-all rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-100">
                {justCreated}
              </code>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => navigator.clipboard.writeText(justCreated)}
              >
                <Copy className="h-3 w-3" />
                {t("copy")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>{t("name")}</TH>
              <TH>Env</TH>
              <TH>{t("prefix")}</TH>
              <TH>Models</TH>
              <TH>RPM</TH>
              <TH>Moderation</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {keys.map((k) => (
              <TR key={k.id}>
                <TD className="font-medium">{k.name}</TD>
                <TD>
                  <Badge variant={k.env === "live" ? "success" : "warning"}>
                    {k.env}
                  </Badge>
                </TD>
                <TD className="font-mono text-zinc-400">{k.prefix}…</TD>
                <TD className="flex flex-wrap gap-1">
                  {(k.allowed_models ?? []).length === 0 ? (
                    <span className="text-xs text-zinc-500">all</span>
                  ) : (
                    (k.allowed_models ?? []).map((m) => (
                      <Badge key={m} variant="info">
                        {m}
                      </Badge>
                    ))
                  )}
                </TD>
                <TD>{k.rate_limit_rpm ?? "—"}</TD>
                <TD>{k.moderation_profile ?? "—"}</TD>
                <TD>
                  <StatusBadge
                    status={
                      k.revoked_at
                        ? "revoked"
                        : k.disabled
                          ? "failed"
                          : "succeeded"
                    }
                  />
                </TD>
                <TD className="flex gap-2">
                  {!k.revoked_at && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleDisabled(k)}
                      >
                        {k.disabled ? "Enable" : "Disable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revoke(k.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        {t("revoke")}
                      </Button>
                    </>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("create")}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <FormField label="Name">
                <Input
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("namePlaceholder")}
                />
              </FormField>
              <FormField label="Environment">
                <select
                  value={form.env}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm({ ...form, env: e.target.value as "live" | "test" })
                  }
                  className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  <option value="live">live</option>
                  <option value="test">test</option>
                </select>
              </FormField>
              <FormField label="Scopes">
                <div className="flex flex-wrap gap-3">
                  {SCOPE_OPTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-sm text-zinc-200"
                    >
                      <input
                        type="checkbox"
                        className="accent-violet-500"
                        checked={form.scopes.includes(s)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setForm({
                            ...form,
                            scopes: e.target.checked
                              ? [...form.scopes, s]
                              : form.scopes.filter((x) => x !== s),
                          })
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </FormField>
              <FormField label="Allowed models (comma-separated, blank = all)">
                <Input
                  value={form.allowed_models}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, allowed_models: e.target.value })
                  }
                  placeholder="seedance-v2-pro, seedance-v2-lite"
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Monthly cap (USD)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.monthly_spend_cap_usd}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, monthly_spend_cap_usd: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Rate limit (RPM)">
                  <Input
                    type="number"
                    value={form.rate_limit_rpm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, rate_limit_rpm: e.target.value })
                    }
                  />
                </FormField>
              </div>
              <FormField label="Moderation profile">
                <select
                  value={form.moderation_profile}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm({ ...form, moderation_profile: e.target.value })
                  }
                  className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
                >
                  {MODERATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m || "inherit org default"}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="IP allowlist (CSV)">
                <Input
                  value={form.ip_allowlist}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, ip_allowlist: e.target.value })
                  }
                  placeholder="1.2.3.4, 10.0.0.0/24"
                />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={create} disabled={loading || !form.name.trim()}>
                {loading ? "Creating…" : t("create")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  );
}
