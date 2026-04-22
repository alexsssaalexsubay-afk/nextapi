"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardDescription,
  StatusBadge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@nextapi/ui";

// Placeholder: backend exposes GET /v1/jobs/:id (single) in D3.
// Listing endpoint arrives in a later D; for now we render empty.
type Job = {
  id: string;
  status: string;
  created_at: string;
  video_url: string | null;
  cost_credits: number | null;
};

export default function JobsPage() {
  const [jobs] = useState<Job[]>([]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Asynchronous video generations dispatched through the gateway.
      </p>

      <Card className="mt-6">
        <CardDescription>
          <code className="font-mono text-xs text-zinc-300">
            POST /v1/video/generations
          </code>{" "}
          returns a job id. Poll{" "}
          <code className="font-mono text-xs text-zinc-300">
            GET /v1/jobs/:id
          </code>{" "}
          or register a webhook.
        </CardDescription>
      </Card>

      <div className="mt-6">
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Cost</TH>
              <TH>Video</TH>
            </TR>
          </THead>
          <TBody>
            {jobs.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-10 text-center text-zinc-500">
                  No jobs yet. Fire your first{" "}
                  <code className="font-mono">POST /v1/video/generations</code>.
                </TD>
              </TR>
            ) : (
              jobs.map((j) => (
                <TR key={j.id}>
                  <TD className="font-mono text-xs">{j.id.slice(0, 8)}…</TD>
                  <TD>
                    <StatusBadge status={j.status} />
                  </TD>
                  <TD>{new Date(j.created_at).toLocaleString()}</TD>
                  <TD className="font-mono tabular-nums">
                    {j.cost_credits ?? "—"}
                  </TD>
                  <TD>
                    {j.video_url ? (
                      <a
                        className="text-violet-400 hover:underline"
                        href={j.video_url}
                        target="_blank"
                      >
                        open
                      </a>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </>
  );
}
