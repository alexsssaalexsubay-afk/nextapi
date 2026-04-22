"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardTitle } from "@nextapi/ui";
import { apiFetch } from "@/lib/api";

export default function DashboardHome() {
  const [balance, setBalance] = useState<number | null>(null);
  const [keysCount, setKeysCount] = useState<number | null>(null);
  const [jobs24h, setJobs24h] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ balance: number }>("/v1/credits").then(
      (r) => r.data && setBalance(r.data.balance),
    );
    apiFetch<{ data: { revoked_at: string | null }[] }>("/v1/keys").then(
      (r) => r.data && setKeysCount(r.data.data.filter((k) => !k.revoked_at).length),
    );
    apiFetch<{ data: { jobs: number }[] }>("/v1/billing/usage?days=1").then(
      (r) => {
        if (!r.data) return;
        setJobs24h(r.data.data.reduce((a, p) => a + p.jobs, 0));
      },
    );
  }, []);

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Your NextAPI gateway is ready. Create an API key or open the playground.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Balance</CardTitle>
          <CardDescription>Credits remaining on your org.</CardDescription>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{fmt(balance)}</p>
        </Card>
        <Card>
          <CardTitle>Active keys</CardTitle>
          <CardDescription>Keys currently in use.</CardDescription>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{fmt(keysCount)}</p>
        </Card>
        <Card>
          <CardTitle>Jobs (24h)</CardTitle>
          <CardDescription>Video generations in the last day.</CardDescription>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{fmt(jobs24h)}</p>
        </Card>
      </div>
    </>
  );
}
