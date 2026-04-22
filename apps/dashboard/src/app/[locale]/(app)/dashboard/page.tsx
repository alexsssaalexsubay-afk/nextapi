"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardTitle } from "@nextapi/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function DashboardHome() {
  const [balance, setBalance] = useState<number | null>(null);
  const [keysCount, setKeysCount] = useState<number | null>(null);
  const [jobs24h, setJobs24h] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/billing/balance`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setBalance(j.balance))
      .catch(() => {});
    fetch(`${API}/v1/keys`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setKeysCount((j.data ?? []).filter((k: { revoked_at: string | null }) => !k.revoked_at).length))
      .catch(() => {});
    fetch(`${API}/v1/billing/usage?days=1`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const total = (j.data ?? []).reduce(
          (a: number, p: { jobs: number }) => a + p.jobs,
          0,
        );
        setJobs24h(total);
      })
      .catch(() => {});
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
