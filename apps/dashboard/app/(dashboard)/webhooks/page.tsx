"use client"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCcw } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"
import { cn } from "@/lib/utils"

const deliveries = [
  { ts: "17:03:12.061", ev: "job.succeeded", id: "evt_9fxk...a4", status: 200, latency: "112ms" },
  { ts: "17:03:11.498", ev: "job.running", id: "evt_9fxj...a2", status: 200, latency: "98ms" },
  { ts: "17:02:46.902", ev: "job.failed", id: "evt_9fwa...38", status: 200, latency: "141ms" },
  { ts: "16:58:42.117", ev: "job.succeeded", id: "evt_9fvp...11", status: 200, latency: "103ms" },
  {
    ts: "16:57:05.004",
    ev: "job.succeeded",
    id: "evt_9fvj...09",
    status: 500,
    latency: "8.1s",
    fail: true,
  },
  {
    ts: "16:57:05.004",
    ev: "job.succeeded",
    id: "evt_9fvj...09",
    status: "retry 1/5",
    latency: "—",
    retry: true,
  },
]

export default function WebhooksPage() {
  const t = useTranslations()

  return (
    <DashboardShell
      activeHref="/webhooks"
      title={t.webhooks.title}
      description={t.webhooks.subtitle}
      actions={
        <Button className="h-8 gap-1.5 bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90">
          <Plus className="size-3.5" />
          {t.webhooks.addEndpoint}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {/* Preview banner — backend wiring lands in the next release. */}
        <div className="flex items-center justify-between rounded-md border border-dashed border-border/80 bg-card/30 px-3 py-2 text-[12px] text-muted-foreground">
          <span>
            <span className="font-mono uppercase tracking-[0.14em]">{t.common.preview ?? "PREVIEW"}</span>
            <span className="ml-2">{t.webhooks.previewNote ?? "Sample data — endpoint create + delivery log API ships in the next release."}</span>
          </span>
        </div>

        {/* Endpoint */}
        <section className="rounded-xl border border-border/80 bg-card/40">
          <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] text-foreground">
                  https://acme.com/hooks/nextapi
                </span>
                <span className="rounded-sm bg-status-success-dim/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-status-success">
                  {t.admin.pulse.healthy}
                </span>
              </div>
              <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                whsec_3d4a2e8f…b2 · v1 · {t.webhooks.signatureAlgorithm}
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t.admin.pulse.successRate}
                </div>
                <div className="mt-0.5 font-mono text-[15px] text-foreground">99.6%</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  p95
                </div>
                <div className="mt-0.5 font-mono text-[15px] text-foreground">142ms</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60 text-[12.5px]">
            <div className="p-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.webhooks.events}
              </div>
              <div className="mt-2 flex flex-col gap-1 font-mono text-foreground/90">
                <div>job.queued</div>
                <div>job.running</div>
                <div>job.succeeded</div>
                <div>job.failed</div>
              </div>
            </div>
            <div className="p-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.webhooks.columns.attempts}
              </div>
              <div className="mt-2 flex flex-col gap-1 text-foreground/90">
                <div>5</div>
                <div className="text-muted-foreground">exp. backoff · 24h</div>
              </div>
            </div>
            <div className="p-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.webhooks.columns.timestamp}
              </div>
              <div className="mt-2 text-foreground/90">12s · 200 · 112ms</div>
            </div>
          </div>
        </section>

        {/* Recent deliveries */}
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <h2 className="text-[13px] font-medium tracking-tight">
              {t.webhooks.recentDeliveries}
            </h2>
            <div className="flex items-center gap-2">
              <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 text-[11.5px] text-muted-foreground hover:text-foreground">
                <RefreshCcw className="size-3" />
                {t.webhooks.actions.replay}
              </button>
            </div>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-card/50 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-mono font-normal">
                  {t.webhooks.columns.timestamp}
                </th>
                <th className="px-5 py-2.5 font-mono font-normal">{t.webhooks.columns.event}</th>
                <th className="px-5 py-2.5 font-mono font-normal">ID</th>
                <th className="px-5 py-2.5 font-mono font-normal">{t.webhooks.columns.status}</th>
                <th className="px-5 py-2.5 font-mono font-normal">
                  {t.webhooks.columns.duration}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-mono text-[12.5px]">
              {deliveries.map((d, i) => (
                <tr
                  key={i}
                  className={cn(
                    "hover:bg-card/60",
                    d.fail && "bg-status-failed-dim/15",
                    d.retry && "bg-status-running-dim/10",
                  )}
                >
                  <td className="px-5 py-2.5 text-muted-foreground">{d.ts}</td>
                  <td className="px-5 py-2.5 text-foreground/90">{d.ev}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{d.id}</td>
                  <td className="px-5 py-2.5">
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5",
                        d.fail && "bg-status-failed-dim/50 text-status-failed",
                        d.retry && "bg-status-running-dim/40 text-status-running",
                        !d.fail && !d.retry && "bg-status-success-dim/40 text-status-success",
                      )}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">{d.latency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  )
}
