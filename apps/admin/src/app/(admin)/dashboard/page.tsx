"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@nextapi/ui";
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type Overview = {
  users_total: number;
  jobs_last_24h: number;
  credits_used_all_time: number;
};

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/v1/internal/admin/overview")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const stats: { label: string; value: string }[] = [
    { label: "Total users", value: data ? data.users_total.toLocaleString() : "—" },
    { label: "Jobs (24h)", value: data ? data.jobs_last_24h.toLocaleString() : "—" },
    { label: "Credits consumed", value: data ? data.credits_used_all_time.toLocaleString() : "—" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Platform-wide health at a glance. Admin actions here affect every tenant.
        </p>
      </div>

      {!data && !error && <TodoBanner endpoint="GET /v1/internal/admin/overview" />}
      {error && <TodoBanner endpoint="GET /v1/internal/admin/overview" note={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
