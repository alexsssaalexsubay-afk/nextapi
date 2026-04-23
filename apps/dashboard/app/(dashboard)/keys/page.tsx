"use client"

import { useEffect, useState, useCallback } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"

interface ApiKey {
  id: string
  prefix: string
  name: string
  provisioned_concurrency: number
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export default function KeysPage() {
  const t = useTranslations()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<{ secret: string; name: string } | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  const [formName, setFormName] = useState("")
  const [formEnv, setFormEnv] = useState("live")
  const [creating, setCreating] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await apiFetch("/v1/me/keys")
      const all: ApiKey[] = res.data || []
      // Hide internally-managed dashboard session keys; users didn't create them.
      setKeys(all.filter((k) => k.name !== "dashboard-session"))
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function handleCreate() {
    if (!formName.trim()) return
    setCreating(true)
    try {
      const res = await apiFetch("/v1/me/keys", {
        method: "POST",
        body: JSON.stringify({ name: formName, env: formEnv }),
      })
      setNewKeyResult({ secret: res.secret, name: res.name })
      setShowCreate(false)
      setFormName("")
      fetchKeys()
      toast.success(t.keys.create + " ✓")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiFetch(`/v1/me/keys/${id}`, { method: "DELETE" })
      fetchKeys()
      toast.success("Key revoked")
    } catch {
      toast.error("Failed to revoke key")
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  return (
    <DashboardShell
      activeHref="/keys"
      title={t.keys.title}
      description={t.keys.subtitle}
      actions={
        <Button
          onClick={() => setShowCreate(true)}
          className="h-8 gap-1.5 bg-foreground px-3 text-[12.5px] font-medium text-background hover:bg-foreground/90"
        >
          <Plus className="size-3.5" />
          {t.keys.create}
        </Button>
      }
    >
      <div className="flex flex-col gap-6 p-6">
        {/* New key result banner */}
        {newKeyResult && (
          <div className="rounded-xl border border-signal/30 bg-signal/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-medium text-foreground">
                  {t.keys.create} — {newKeyResult.name}
                </h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Copy this key now. It will not be shown again. Use it from your own server / CLI;
                  the dashboard signs in to the API on its own.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="rounded-md border border-border/80 bg-background/60 px-3 py-1.5 font-mono text-[12px] text-foreground">
                    {newKeyResult.secret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newKeyResult.secret)}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border/80 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                {/* cURL preview */}
                <div className="mt-4 rounded-md border border-border/80 bg-background/60">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {t.keys.curlPreview.title}
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `curl -X POST https://api.nextapi.top/v1/videos \\\n  -H "Authorization: Bearer ${newKeyResult.secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"seedance-v2-pro","prompt":"a cat playing piano","duration":5}'`,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <Copy className="size-3" />
                      {t.keys.curlPreview.copy}
                    </button>
                  </div>
                  <pre className="overflow-x-auto px-3 py-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                    {`curl -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer ${newKeyResult.secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"seedance-v2-pro","prompt":"a cat playing piano","duration":5}'`}
                  </pre>
                </div>
                <p className="mt-2 text-[11.5px] text-muted-foreground">{t.keys.curlPreview.description}</p>
              </div>
              <button
                onClick={() => setNewKeyResult(null)}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <table className="w-full text-[13px]">
            <thead className="bg-card/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-mono font-normal">{t.keys.columns.name}</th>
                <th className="px-4 py-2.5 font-mono font-normal">{t.keys.columns.key}</th>
                <th className="px-4 py-2.5 font-mono font-normal">{t.keys.columns.lastUsed}</th>
                <th className="px-4 py-2.5 font-mono font-normal">{t.keys.columns.created}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No API keys yet. Create your first key to get started.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? "opacity-50" : ""}>
                    <td className="px-4 py-3 font-medium text-foreground">{k.name || "Untitled"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-foreground/90">
                          {revealedKey === k.id ? k.prefix : k.prefix.slice(0, 12) + "…"}
                        </span>
                        <button
                          onClick={() => setRevealedKey(revealedKey === k.id ? null : k.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {revealedKey === k.id ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(k.prefix)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleDateString()
                        : t.keys.hints.neverUsed}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {!k.revoked_at && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          aria-label={t.keys.actions.revoke}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-status-failed"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border/80 bg-card/40 p-5">
          <h2 className="text-[14px] font-medium tracking-tight">{t.keys.actions.rotate}</h2>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-muted-foreground">
            {t.keys.hints.livePrefix} · {t.keys.hints.testPrefix}
          </p>
        </div>
      </div>

      {/* Create key dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.keys.create}</DialogTitle>
            <DialogDescription>
              Create a new API key for your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">{t.keys.columns.name}</Label>
              <Input
                id="key-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. prod-server"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t.keys.columns.environment}</Label>
              <Select value={formEnv} onValueChange={setFormEnv}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">{t.keys.live}</SelectItem>
                  <SelectItem value="test">{t.keys.test}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !formName.trim()}>
              {creating ? "Creating..." : t.keys.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
