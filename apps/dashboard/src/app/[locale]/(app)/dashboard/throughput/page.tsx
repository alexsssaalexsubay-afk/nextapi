"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, Badge } from "@nextapi/ui";
import { apiFetch } from "@/lib/api";

type Throughput = {
  reserved_concurrency: number;
  burst_concurrency: number;
  priority_lane: string;
  rpm_limit: number;
  current_in_flight: number;
};

export default function ThroughputPage() {
  const [data, setData] = useState<Throughput | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch<Throughput>("/v1/throughput");
      if (r.ok && r.data) setData(r.data);
      else setDegraded(true);
    })();
  }, []);

  const pct =
    data && data.burst_concurrency > 0
      ? Math.min(100, (data.current_in_flight / data.burst_concurrency) * 100)
      : 0;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Throughput</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Your guaranteed concurrent capacity. Contact sales to increase reserved throughput.
      </p>

      {degraded && (
        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
          Throughput data unavailable.
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Reserved concurrency</CardDescription>
            <CardTitle>{data?.reserved_concurrency ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Burst concurrency</CardDescription>
            <CardTitle>{data?.burst_concurrency ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Priority lane</CardDescription>
            <CardTitle>
              <Badge variant="info">{data?.priority_lane ?? "—"}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Requests per minute</CardDescription>
            <CardTitle>{data?.rpm_limit ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>In-flight utilization</CardTitle>
          <CardDescription>
            {data
              ? `${data.current_in_flight} of ${data.burst_concurrency} burst slots used`
              : "—"}
          </CardDescription>
        </CardHeader>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {pct.toFixed(0)}% of burst ceiling
        </p>
      </Card>
    </>
  );
}
