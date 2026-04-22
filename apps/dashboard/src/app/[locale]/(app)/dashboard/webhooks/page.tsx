"use client";

import React, { useEffect, useState } from "react";
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
  Badge,
} from "@nextapi/ui";
import { AlertTriangle, Copy, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Hook = {
  id: string;
  url: string;
  event_types: string[];
  created_at: string;
  disabled_at: string | null;
};

type Delivery = {
  id: string;
  event_type: string;
  status_code: number | null;
  attempt_count: number;
  next_retry_at: string | null;
  created_at: string;
};

const EVENT_TYPES = [
  "video.queued",
  "video.started",
  "video.succeeded",
  "video.failed",
  "video.cancelled",
  "budget.alert",
  "budget.auto_paused",
  "budget.monthly_limit",
];

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([
    "video.succeeded",
    "video.failed",
  ]);
  const [secret, setSecret] = useState<string | null>(null);
  const [drawerHook, setDrawerHook] = useState<Hook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  async function load() {
    const r = await apiFetch<{ data: Hook[] }>("/v1/webhooks");
    if (r.ok && r.data) setHooks(r.data.data ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const r = await apiFetch<{ secret: string }>("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url, event_types: events }),
    });
    if (r.ok && r.data) {
      setSecret(r.data.secret);
      setUrl("");
      void load();
    }
  }

  async function del(id: string) {
    await apiFetch(`/v1/webhooks/${id}`, { method: "DELETE" });
    void load();
  }

  async function rotate(id: string) {
    const r = await apiFetch<{ secret: string }>(
      `/v1/webhooks/${id}/rotate`,
      { method: "POST" },
    );
    if (r.ok && r.data) setSecret(r.data.secret);
  }

  async function openDrawer(h: Hook) {
    setDrawerHook(h);
    setDeliveries([]);
    const r = await apiFetch<{ data: Delivery[] }>(
      `/v1/webhooks/${h.id}/deliveries?limit=50`,
    );
    if (r.ok && r.data) setDeliveries(r.data.data ?? []);
  }

  async function replay(deliveryId: string) {
    await apiFetch(`/v1/webhooks/deliveries/${deliveryId}/replay`, {
      method: "POST",
    });
    if (drawerHook) void openDrawer(drawerHook);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
      <p className="mt-1 text-sm text-zinc-400">
        We POST signed events (HMAC-SHA256, header{" "}
        <code className="font-mono">X-NextAPI-Signature</code>) with exponential
        backoff retries.
      </p>

      <Card className="mt-6">
        <div className="flex gap-2">
          <Input
            placeholder="https://your-app.com/webhooks/nextapi"
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setUrl(e.target.value)
            }
          />
          <Button onClick={create} disabled={!url.trim()}>
            Add endpoint
          </Button>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs text-zinc-400">Events</p>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPES.map((e) => (
              <label
                key={e}
                className="flex items-center gap-2 text-sm text-zinc-200"
              >
                <input
                  type="checkbox"
                  className="accent-violet-500"
                  checked={events.includes(e)}
                  onChange={(ev) =>
                    setEvents(
                      ev.target.checked
                        ? [...events, e]
                        : events.filter((x) => x !== e),
                    )
                  }
                />
                {e}
              </label>
            ))}
          </div>
        </div>
        {secret && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-700 bg-amber-950/30 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm text-amber-200">
                Copy the signing secret now — it won&rsquo;t be shown again.
              </p>
              <code className="mt-2 block break-all rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-100">
                {secret}
              </code>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => navigator.clipboard.writeText(secret)}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <Table>
          <THead>
            <TR>
              <TH>URL</TH>
              <TH>Events</TH>
              <TH>Created</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {hooks.length === 0 ? (
              <TR>
                <TD colSpan={4} className="py-8 text-center text-zinc-500">
                  No webhooks configured.
                </TD>
              </TR>
            ) : (
              hooks.map((h) => (
                <TR key={h.id}>
                  <TD className="font-mono text-xs">{h.url}</TD>
                  <TD className="flex flex-wrap gap-1">
                    {h.event_types.map((e) => (
                      <Badge key={e} variant="info">
                        {e}
                      </Badge>
                    ))}
                  </TD>
                  <TD>{new Date(h.created_at).toLocaleDateString()}</TD>
                  <TD className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDrawer(h)}
                    >
                      View deliveries
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => rotate(h.id)}
                    >
                      Rotate secret
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400"
                      onClick={() => del(h.id)}
                    >
                      Delete
                    </Button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {drawerHook && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Deliveries</h2>
                <p className="text-xs text-zinc-400 font-mono">
                  {drawerHook.url}
                </p>
              </div>
              <button
                onClick={() => setDrawerHook(null)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Event</TH>
                  <TH>Status</TH>
                  <TH>Attempts</TH>
                  <TH>Next retry</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {deliveries.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-8 text-center text-zinc-500">
                      No deliveries yet.
                    </TD>
                  </TR>
                ) : (
                  deliveries.map((d) => (
                    <TR key={d.id}>
                      <TD className="font-mono text-xs">{d.event_type}</TD>
                      <TD>
                        <Badge
                          variant={
                            d.status_code && d.status_code < 300
                              ? "success"
                              : "destructive"
                          }
                        >
                          {d.status_code ?? "pending"}
                        </Badge>
                      </TD>
                      <TD>{d.attempt_count}</TD>
                      <TD className="text-xs">
                        {d.next_retry_at
                          ? new Date(d.next_retry_at).toLocaleString()
                          : "—"}
                      </TD>
                      <TD>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => replay(d.id)}
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
        </div>
      )}
    </>
  );
}
