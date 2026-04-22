"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@nextapi/ui";
import { apiFetch } from "@/lib/api";

type Point = { day: string; jobs: number; credits_used: number };

export default function UsagePage() {
  const [pts, setPts] = useState<Point[]>([]);

  useEffect(() => {
    apiFetch<{ data: Point[] }>("/v1/billing/usage?days=30").then(
      (r) => r.data && setPts(r.data.data ?? []),
    );
  }, []);

  const max = Math.max(1, ...pts.map((p) => p.credits_used));
  const totalJobs = pts.reduce((a, p) => a + p.jobs, 0);
  const totalCredits = pts.reduce((a, p) => a + p.credits_used, 0);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
      <p className="mt-1 text-sm text-zinc-400">Last 30 days.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardDescription>Jobs</CardDescription>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {totalJobs.toLocaleString()}
          </p>
        </Card>
        <Card>
          <CardDescription>Credits used</CardDescription>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {totalCredits.toLocaleString()}
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Credits / day</CardTitle>
        <div className="mt-4 flex h-40 items-end gap-1">
          {pts.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              No data yet.
            </div>
          ) : (
            pts.map((p) => {
              const h = Math.max(2, (p.credits_used / max) * 100);
              return (
                <div
                  key={p.day}
                  className="group relative flex-1 rounded-sm bg-violet-600/60 hover:bg-violet-500"
                  style={{ height: `${h}%` }}
                  title={`${new Date(p.day).toLocaleDateString()} · ${p.credits_used} credits · ${p.jobs} jobs`}
                />
              );
            })
          )}
        </div>
      </Card>
    </>
  );
}
