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

type Verdict = "allow" | "block" | "review" | string;

type ModerationEvent = {
  id: number;
  org_id: string;
  video_id?: string;
  api_key_id?: string;
  profile_used: string;
  verdict: Verdict;
  reason?: string;
  internal_note?: string;
  reviewer?: string;
  created_at: string;
};

function verdictVariant(
  v: Verdict,
): "success" | "destructive" | "warning" | "neutral" {
  if (v === "allow") return "success";
  if (v === "block") return "destructive";
  if (v === "review") return "warning";
  return "neutral";
}

export default function ModerationPage() {
  const [events, setEvents] = useState<ModerationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("");
  const [active, setActive] = useState<ModerationEvent | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    const qs = params.toString();
    apiFetch<{ data: ModerationEvent[]; has_more: boolean }>(
      `/v1/internal/admin/moderation/events${qs ? `?${qs}` : ""}`,
    )
      .then((r) => {
        setEvents(r.data ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setEvents([]);
        setError(e.message);
      });
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Review moderation verdicts and add internal notes.
        </p>
      </div>

      {(events.length === 0 || error) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/moderation/events"
          note={error ?? "Empty state"}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Org ID</label>
          <Input
            value={orgId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgId(e.target.value)}
            placeholder="org_…"
          />
        </div>
        <Button onClick={load} size="sm">
          Apply
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>ID</TH>
            <TH>Org</TH>
            <TH>Profile</TH>
            <TH>Verdict</TH>
            <TH>Reason</TH>
            <TH>Note</TH>
            <TH>Created</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {events.length === 0 ? (
            <TR>
              <TD colSpan={8} className="py-8 text-center text-zinc-500">
                No moderation events.
              </TD>
            </TR>
          ) : (
            events.map((e) => (
              <TR key={e.id}>
                <TD className="font-mono text-xs">{e.id}</TD>
                <TD className="text-zinc-400">{e.org_id}</TD>
                <TD className="text-zinc-400">{e.profile_used}</TD>
                <TD>
                  <Badge variant={verdictVariant(e.verdict)}>
                    {e.verdict}
                  </Badge>
                </TD>
                <TD
                  className="max-w-xs truncate text-zinc-400"
                  title={e.reason ?? ""}
                >
                  {e.reason ?? "—"}
                </TD>
                <TD className="max-w-xs truncate text-zinc-500">
                  {e.internal_note ?? "—"}
                </TD>
                <TD className="text-zinc-500">
                  {new Date(e.created_at).toLocaleString()}
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActive(e)}
                  >
                    Add Note
                  </Button>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {active && (
        <NoteDrawer
          event={active}
          onClose={() => setActive(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

function NoteDrawer({
  event,
  onClose,
  onDone,
}: {
  event: ModerationEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState(event.internal_note ?? "");
  const [reviewer, setReviewer] = useState(event.reviewer ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(
        `/v1/internal/admin/moderation/events/${event.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ internal_note: note, reviewer }),
        },
      );
      onDone();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-md space-y-6 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Event #{event.id}
            </p>
            <Badge className="mt-2" variant={verdictVariant(event.verdict)}>
              {event.verdict}
            </Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {err && <div className="text-sm text-red-400">{err}</div>}

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-200">
            Internal note
          </h3>
          <Input
            placeholder="Reviewer email"
            value={reviewer}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setReviewer(e.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-100"
            placeholder="Note…"
            value={note}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            onClick={save}
            disabled={busy || !note || !reviewer}
          >
            Save note
          </Button>
        </section>
      </div>
    </div>
  );
}
