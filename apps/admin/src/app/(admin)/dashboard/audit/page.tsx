"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
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

type AuditEntry = {
  id: string;
  actor_email: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState("100");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (limit) params.set("limit", limit);
    apiFetch<{ entries: AuditEntry[] }>(
      `/v1/internal/admin/audit?${params.toString()}`,
    )
      .then((r) => {
        setRows(r.entries ?? []);
        setError(null);
      })
      .catch((e: ApiError) => {
        setRows([]);
        setError(e.message);
      });
  }, [since, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Audit Log</h1>
        <p className="mt-1 text-sm text-zinc-400">Read-only audit trail of admin actions.</p>
      </div>

      {(rows.length === 0 || error) && (
        <TodoBanner endpoint="GET /v1/internal/admin/audit" note={error ?? "Empty state"} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Since</label>
          <Input type="datetime-local" value={since} onChange={(e: ChangeEvent<HTMLInputElement>) => setSince(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Limit</label>
          <Input type="number" value={limit} onChange={(e: ChangeEvent<HTMLInputElement>) => setLimit(e.target.value)} />
        </div>
        <Button size="sm" onClick={load}>Apply</Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Actor</TH>
            <TH>Action</TH>
            <TH>Target</TH>
            <TH>Metadata</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-zinc-500">
                No audit entries.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.actor_email}</TD>
                <TD className="text-zinc-300">{r.action}</TD>
                <TD className="font-mono text-xs text-zinc-400">{r.target}</TD>
                <TD>
                  <pre className="max-w-sm overflow-x-auto rounded bg-zinc-900/60 p-2 text-xs text-zinc-300">
                    {JSON.stringify(r.metadata, null, 2)}
                  </pre>
                </TD>
                <TD className="text-zinc-500">{new Date(r.created_at).toLocaleString()}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
