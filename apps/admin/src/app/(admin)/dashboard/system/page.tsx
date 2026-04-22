"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@nextapi/ui";
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type ProviderHealth = {
  name: string;
  status: "up" | "degraded" | "down";
  latency_ms: number;
  checked_at: string;
};

type QueueDepth = {
  queue: string;
  depth: number;
  oldest_age_seconds: number;
};

type RecentError = {
  id: string;
  message: string;
  count: number;
  last_seen: string;
};

export default function SystemPage() {
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [queues, setQueues] = useState<QueueDepth[]>([]);
  const [errors, setErrors] = useState<RecentError[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ providers: ProviderHealth[] }>("/v1/internal/admin/health/providers")
      .then((r) => setProviders(r.providers))
      .catch((e: Error) => setErr(e.message));
    apiFetch<{ queues: QueueDepth[] }>("/v1/internal/admin/health/queue")
      .then((r) => setQueues(r.queues))
      .catch(() => undefined);
    apiFetch<{ errors: RecentError[] }>("/v1/internal/admin/health/errors")
      .then((r) => setErrors(r.errors))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Live view of upstream providers, queue backlogs, and recent errors.
        </p>
      </div>

      {(providers.length === 0 || err) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/health/*"
          note={err ?? "Renders empty until data is returned."}
        />
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
          Providers
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.length === 0 ? (
            <Card>
              <CardHeader>
                <CardDescription>No providers reporting.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            providers.map((p) => (
              <Card key={p.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{p.name}</CardTitle>
                    <Badge
                      variant={
                        p.status === "up"
                          ? "success"
                          : p.status === "degraded"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {p.latency_ms} ms · checked{" "}
                    {new Date(p.checked_at).toLocaleTimeString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
          Queue depth
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>Queue</TH>
              <TH className="text-right">Depth</TH>
              <TH className="text-right">Oldest (s)</TH>
            </TR>
          </THead>
          <TBody>
            {queues.length === 0 ? (
              <TR>
                <TD colSpan={3} className="py-8 text-center text-zinc-500">
                  No queues reporting.
                </TD>
              </TR>
            ) : (
              queues.map((q) => (
                <TR key={q.queue}>
                  <TD className="font-medium">{q.queue}</TD>
                  <TD className="text-right tabular-nums">
                    {q.depth.toLocaleString()}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {q.oldest_age_seconds.toLocaleString()}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
          Recent errors
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>Message</TH>
              <TH className="text-right">Count</TH>
              <TH>Last seen</TH>
            </TR>
          </THead>
          <TBody>
            {errors.length === 0 ? (
              <TR>
                <TD colSpan={3} className="py-8 text-center text-zinc-500">
                  No recent errors.
                </TD>
              </TR>
            ) : (
              errors.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs text-red-300">{e.message}</TD>
                  <TD className="text-right tabular-nums">{e.count}</TD>
                  <TD className="text-zinc-400">
                    {new Date(e.last_seen).toLocaleString()}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
