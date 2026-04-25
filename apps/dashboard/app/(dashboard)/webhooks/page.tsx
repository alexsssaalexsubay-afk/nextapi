"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Webhook = {
  id: string
  url: string
  event_types: string[]
  secret_prefix?: string
  created_at: string
}

type Delivery = {
  id: number
  event_type: string
  status_code: number
  latency_ms: number
  created_at: string
  success: boolean
}

export default function WebhooksPage() {
  const t = useTranslations()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [formUrl, setFormUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [delLoading, setDelLoading] = useState(false)

  const loadWebhooks = useCallback(() => {
    setLoading(true)
    apiFetch("/v1/webhooks")
      .then((res) => {
        if (Array.isArray(res?.data)) setWebhooks(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadWebhooks() }, [loadWebhooks])

  const loadDeliveries = useCallback((whId: string) => {
    setDelLoading(true)
    apiFetch(`/v1/webhooks/${whId}/deliveries`)
      .then((res) => {
        if (Array.isArray(res?.data)) setDeliveries(res.data)
      })
      .catch(() => {})
      .finally(() => setDelLoading(false))
  }, [])

  useEffect(() => {
    if (selected) loadDeliveries(selected)
    else setDeliveries([])
  }, [selected, loadDeliveries])

  async function handleCreate() {
    if (!formUrl.trim()) return
    setCreating(true)
    try {
      await apiFetch("/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl.trim(), event_types: [] }),
      })
      toast.success(t.webhooks.toasts.createSuccess)
      setShowCreate(false)
      setFormUrl("")
      loadWebhooks()
    } catch {
      toast.error(t.webhooks.toasts.createFailed)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/v1/webhooks/${id}`, { method: "DELETE" })
      toast.success(t.webhooks.toasts.deleteSuccess)
      if (selected === id) setSelected(null)
      loadWebhooks()
    } catch {
      toast.error(t.webhooks.toasts.deleteFailed)
    }
  }

  return (
    <DashboardShell
      activeHref="/webhooks"
      title={t.webhooks.title}
      description={t.webhooks.subtitle}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-8 gap-1.5 border-border/80 bg-card/40 text-[12.5px]"
            onClick={loadWebhooks}
            disabled={loading}
          >
            <RefreshCcw className="size-3.5" />
            {t.common.refresh ?? "Refresh"}
          </Button>
          <Button
            className="h-8 gap-1.5 text-[12.5px]"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="size-3.5" />
            {t.webhooks.addEndpoint}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {loading && webhooks.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
            <p className="text-[14px]">{t.webhooks.subtitle}</p>
            <Button variant="outline" className="mt-2 h-8 text-[12.5px]" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 size-3.5" /> {t.webhooks.addEndpoint}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            {/* Webhook list */}
            <section className="rounded-xl border border-border/80 bg-card/40">
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="text-[13px] font-medium tracking-tight">{t.webhooks.endpoint ?? "Endpoints"}</h2>
              </div>
              <ul className="divide-y divide-border/60">
                {webhooks.map((wh) => (
                  <li
                    key={wh.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-accent/40",
                      selected === wh.id && "bg-accent/60",
                    )}
                    onClick={() => setSelected(wh.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[12px] text-foreground">{wh.url}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {wh.event_types?.length ? wh.event_types.join(", ") : "all events"}
                      </p>
                    </div>
                    <button
                      className="ml-2 rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(wh.id) }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Deliveries */}
            <section className="rounded-xl border border-border/80 bg-card/40">
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="text-[13px] font-medium tracking-tight">
                  {t.webhooks.recentDeliveries ?? "Recent deliveries"}
                </h2>
              </div>
              {!selected ? (
                <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                  Select a webhook to view deliveries
                </div>
              ) : delLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
                </div>
              ) : deliveries.length === 0 ? (
                <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                  No deliveries yet
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="bg-card/50 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-mono font-normal">Event</th>
                      <th className="px-4 py-2.5 font-mono font-normal">Status</th>
                      <th className="px-4 py-2.5 font-mono font-normal">Latency</th>
                      <th className="px-4 py-2.5 font-mono font-normal">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono text-[12.5px]">
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2.5 text-foreground">{d.event_type}</td>
                        <td className={cn("px-4 py-2.5", d.success ? "text-status-success" : "text-destructive")}>
                          {d.status_code}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{d.latency_ms}ms</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(d.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.webhooks.addEndpoint}</DialogTitle>
            <DialogDescription>
              {t.webhooks.subtitle ?? "Add a webhook endpoint to receive event notifications."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-[12px]">URL</Label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="mt-1 font-mono text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !formUrl.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
