"use client"

import { useCallback } from "react"
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PreparedShot } from "@/lib/batch-manifest"
import { VALID_ASPECT_RATIOS } from "@/lib/batch-manifest"

type Props = {
  shots: PreparedShot[]
  onChange: (shots: PreparedShot[]) => void
  disabled?: boolean
}

const DURATIONS = [3, 5, 10]

export function ShotEditor({ shots, onChange, disabled }: Props) {
  const update = useCallback(
    (index: number, patch: Partial<PreparedShot>) => {
      const next = shots.map((s, i) => (i === index ? { ...s, ...patch } : s))
      onChange(next)
    },
    [shots, onChange],
  )

  const remove = useCallback(
    (index: number) => {
      onChange(shots.filter((_, i) => i !== index))
    },
    [shots, onChange],
  )

  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const next = [...shots]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      onChange(next)
    },
    [shots, onChange],
  )

  const moveDown = useCallback(
    (index: number) => {
      if (index >= shots.length - 1) return
      const next = [...shots]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      onChange(next)
    },
    [shots, onChange],
  )

  const addShot = useCallback(() => {
    const newShot: PreparedShot = {
      index: shots.length,
      shot_id: `shot-${shots.length + 1}`,
      prompt: "",
      duration_seconds: 5,
      aspect_ratio: "16:9",
    }
    onChange([...shots, newShot])
  }, [shots, onChange])

  if (!shots.length) return null

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">Prompt</th>
              <th className="w-20 px-2 py-2">Mode</th>
              <th className="w-24 px-2 py-2">Duration</th>
              <th className="w-24 px-2 py-2">Ratio</th>
              <th className="w-24 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shots.map((shot, i) => (
              <tr key={shot.shot_id} className="border-b border-border/20 last:border-0">
                <td className="px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={shot.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    placeholder="Describe the shot..."
                    className="h-8 text-xs"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {shot.image_url ? (
                      <ImageIcon className="size-3.5" />
                    ) : (
                      <Type className="size-3.5" />
                    )}
                    <span>{shot.image_url ? "I2V" : "T2V"}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    value={String(shot.duration_seconds)}
                    onValueChange={(v) => update(i, { duration_seconds: Number(v) })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    value={shot.aspect_ratio}
                    onValueChange={(v) => update(i, { aspect_ratio: v })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...VALID_ASPECT_RATIOS].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => moveUp(i)}
                      disabled={disabled || i === 0}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => moveDown(i)}
                      disabled={disabled || i >= shots.length - 1}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => remove(i)}
                      disabled={disabled}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={addShot} disabled={disabled}>
        <Plus className="mr-1.5 size-3.5" />
        Add Shot
      </Button>
    </div>
  )
}
