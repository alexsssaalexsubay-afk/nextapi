"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  Badge,
  Button,
  Input,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@nextapi/ui";
import { apiFetch, ApiError } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type Delivery = {
  id: string;
  org_id: string;
  event_type: string;
  status_code: number;
  attempt: number;
  error: string | null;
  delivered: boolean;
  created_at: string;
};

export default function WebhooksPage() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState("");
  const [eventType, setEventType] = useState("");
  const [orgId, setOrgId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (delivered) params.set("delivered", delivered);
    if (eventType) params.set("event_type", eventType);
    if (orgId) params.set("org_id", orgId);
    const qs = params.toString();
    apiFetch<{ deliveries: Delivery[] }>(
      `/v1/internal/admin/webhooks/deliveries${qs ? `?${qs}` : ""}`,
    )
      .then((r) => {
        setRows(r.deliveries ?? []);
        setError(null);
      })
      .catch((e: ApiError) => {
        setRows([]);
        setError(e.message);
      });
  }, [delivered, eventType, orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function replay(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/v1/internal/admin/webhooks/deliveries/${id}/replay`, {
        method: "POST",
      });
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Recent webhook delivery attempts across all orgs.
        </p>
      </div>

      {(rows.length === 0 || error) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/webhooks/deliveries"
          note={error ?? "Empty state"}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Delivered</label>
          <select
            value={delivered}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setDelivered(e.target.value)}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            <option value="">any</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Event type</label>
          <Input value={eventType} onChange={(e: ChangeEvent<HTMLInputElement>) => setEventType(e.target.value)} placeholder="job.succeeded" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Org ID</label>
          <Input value={orgId} onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgId(e.target.value)} placeholder="org_…" />
        </div>
        <Button size="sm" onClick={load}>Apply</Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>ID</TH>
            <TH>Org</TH>
            <TH>Event</TH>
            <TH className="text-right">Status</TH>
            <TH className="text-right">Attempt</TH>
            <TH>Error</TH>
            <TH>Created</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-zinc-500">
                No deliveries.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.id}</TD>
                <TD className="text-zinc-400">{r.org_id}</TD>
                <TD>{r.event_type}</TD>
                <TD className="text-right">
                  <Badge variant={r.status_code >= 200 && r.status_code < 300 ? "success" : "destructive"}>
                    {r.status_code || "—"}
                  </Badge>
                </TD>
                <TD className="text-right tabular-nums">{r.attempt}</TD>
                <TD className="max-w-xs truncate text-zinc-400" title={r.error ?? ""}>
                  {r.error ?? "—"}
                </TD>
                <TD className="text-zinc-500">{new Date(r.created_at).toLocaleString()}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => replay(r.id)}
                  >
                    Replay
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
