"use client";

import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
import {
  Input,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@nextapi/ui";
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type Adjustment = {
  id: string;
  org_id: string;
  delta: number;
  note: string;
  actor: string;
  created_at: string;
};

export default function CreditsPage() {
  const [orgId, setOrgId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [recent, setRecent] = useState<Adjustment[]>([]);

  const load = () => {
    apiFetch<{ adjustments: Adjustment[] }>("/v1/internal/admin/credits/adjustments")
      .then((r) => setRecent(r.adjustments))
      .catch(() => undefined);
  };

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const n = Number(delta);
    if (!orgId || !Number.isFinite(n) || n === 0) {
      setError("Provide an org id and a non-zero delta.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/v1/internal/admin/credits/adjust", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, delta: n, note }),
      });
      setOk(`Applied ${n >= 0 ? "+" : ""}${n} credits to ${orgId}.`);
      setOrgId("");
      setDelta("");
      setNote("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manually adjust an org&apos;s credit balance. Every change is audited.
        </p>
      </div>

      <TodoBanner endpoint="POST /v1/internal/admin/credits/adjust" />

      <Card>
        <CardHeader>
          <CardTitle>Adjust credits</CardTitle>
          <CardDescription>
            Use negative values to deduct. Include a human-readable note.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="mb-1 block text-xs text-zinc-400">Org ID</label>
            <Input
              value={orgId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgId(e.target.value)}
              placeholder="org_123"
            />
          </div>
          <div className="md:col-span-1">
            <label className="mb-1 block text-xs text-zinc-400">Delta (±)</label>
            <Input
              type="number"
              value={delta}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDelta(e.target.value)}
              placeholder="-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="mb-1 block text-xs text-zinc-400">Note</label>
            <Input
              value={note}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
              placeholder="Refund for incident #42"
            />
          </div>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? "Applying…" : "Apply adjustment"}
            </Button>
            {ok && <span className="text-sm text-emerald-400">{ok}</span>}
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
          Recent adjustments
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Org</TH>
              <TH className="text-right">Delta</TH>
              <TH>Note</TH>
              <TH>Actor</TH>
            </TR>
          </THead>
          <TBody>
            {recent.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-zinc-500">
                  No adjustments yet.
                </TD>
              </TR>
            ) : (
              recent.map((a) => (
                <TR key={a.id}>
                  <TD className="text-zinc-400">
                    {new Date(a.created_at).toLocaleString()}
                  </TD>
                  <TD>{a.org_id}</TD>
                  <TD
                    className={
                      "text-right tabular-nums " +
                      (a.delta >= 0 ? "text-emerald-400" : "text-red-400")
                    }
                  >
                    {a.delta >= 0 ? "+" : ""}
                    {a.delta.toLocaleString()}
                  </TD>
                  <TD className="text-zinc-400">{a.note}</TD>
                  <TD className="text-zinc-400">{a.actor}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
