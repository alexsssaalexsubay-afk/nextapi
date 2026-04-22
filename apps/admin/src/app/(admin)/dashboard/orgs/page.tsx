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
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type Org = {
  id: string;
  name: string;
  paused_at: string | null;
  pause_reason: string | null;
  created_at: string;
};

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Org | null>(null);
  const [modEdit, setModEdit] = useState<Org | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: Org[] }>("/v1/internal/admin/orgs");
      setOrgs(r.data ?? []);
      setError(null);
    } catch (e) {
      setOrgs([]);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pause(id: string) {
    const reason = window.prompt("Pause reason?") ?? "";
    try {
      await apiFetch(`/v1/internal/admin/orgs/${id}/pause`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function unpause(id: string) {
    try {
      await apiFetch(`/v1/internal/admin/orgs/${id}/unpause`, { method: "POST" });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage per-org throughput, moderation profile, and pause state.
        </p>
      </div>

      {(orgs.length === 0 || error) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/orgs"
          note={error ?? "Falls back to /users aggregation when absent."}
        />
      )}

      <Table>
        <THead>
          <TR>
            <TH>Org ID</TH>
            <TH>Name</TH>
            <TH>Status</TH>
            <TH>Reason</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {orgs.length === 0 ? (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-zinc-500">
                No orgs to display.
              </TD>
            </TR>
          ) : (
            orgs.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono text-xs">{o.id}</TD>
                <TD>{o.name}</TD>
                <TD>
                  {o.paused_at ? (
                    <Badge variant="destructive">paused</Badge>
                  ) : (
                    <Badge variant="success">active</Badge>
                  )}
                </TD>
                <TD className="text-zinc-400">{o.pause_reason ?? "—"}</TD>
                <TD className="flex justify-end gap-2">
                  {o.paused_at ? (
                    <Button size="sm" variant="secondary" onClick={() => unpause(o.id)}>
                      Unpause
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => pause(o.id)}>
                      Pause
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEdit(o)}>
                    Throughput
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setModEdit(o)}>
                    Moderation
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {edit && (
        <ThroughputDrawer
          org={edit}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {modEdit && (
        <ModerationDrawer
          org={modEdit}
          onClose={() => setModEdit(null)}
          onDone={() => {
            setModEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ThroughputDrawer({
  org,
  onClose,
  onDone,
}: {
  org: Org;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reserved, setReserved] = useState("2");
  const [burst, setBurst] = useState("8");
  const [lane, setLane] = useState("standard");
  const [rpm, setRpm] = useState("60");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/v1/internal/admin/orgs/${org.id}/throughput`, {
        method: "PUT",
        body: JSON.stringify({
          reserved_concurrency: Number(reserved),
          burst_concurrency: Number(burst),
          priority_lane: lane,
          rpm_limit: Number(rpm),
        }),
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-md space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-mono text-sm text-zinc-100">{org.id} · throughput</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Reserved concurrency</span>
          <Input type="number" value={reserved} onChange={(e: ChangeEvent<HTMLInputElement>) => setReserved(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Burst concurrency</span>
          <Input type="number" value={burst} onChange={(e: ChangeEvent<HTMLInputElement>) => setBurst(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Priority lane</span>
          <select
            value={lane}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setLane(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            <option value="standard">standard</option>
            <option value="priority">priority</option>
            <option value="dedicated">dedicated</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">RPM limit</span>
          <Input type="number" value={rpm} onChange={(e: ChangeEvent<HTMLInputElement>) => setRpm(e.target.value)} />
        </label>
        <Button onClick={save} disabled={busy}>Save</Button>
      </div>
    </div>
  );
}

function ModerationDrawer({
  org,
  onClose,
  onDone,
}: {
  org: Org;
  onClose: () => void;
  onDone: () => void;
}) {
  const [profile, setProfile] = useState("balanced");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/v1/internal/admin/orgs/${org.id}/moderation`, {
        method: "PUT",
        body: JSON.stringify({ profile }),
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-md space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-mono text-sm text-zinc-100">{org.id} · moderation</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-500">Profile</span>
          <select
            value={profile}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setProfile(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            <option value="strict">strict</option>
            <option value="balanced">balanced</option>
            <option value="relaxed">relaxed</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <Button onClick={save} disabled={busy}>Save</Button>
      </div>
    </div>
  );
}
