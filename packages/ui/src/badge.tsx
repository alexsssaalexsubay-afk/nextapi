import { HTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "neutral" | "success" | "warning" | "destructive" | "info";

const variants: Record<Variant, string> = {
  neutral: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
  success: "border-emerald-700 bg-emerald-950/40 text-emerald-300",
  warning: "border-amber-700 bg-amber-950/40 text-amber-300",
  destructive: "border-red-700 bg-red-950/40 text-red-300",
  info: "border-sky-700 bg-sky-950/40 text-sky-300",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export function StatusBadge({ status }: { status: JobStatus | string }) {
  const map: Record<string, { v: Variant; label: string }> = {
    queued: { v: "neutral", label: "queued" },
    running: { v: "info", label: "running" },
    succeeded: { v: "success", label: "succeeded" },
    failed: { v: "destructive", label: "failed" },
    revoked: { v: "neutral", label: "revoked" },
  };
  const cfg = map[status] ?? { v: "neutral", label: status };
  return <Badge variant={cfg.v}>{cfg.label}</Badge>;
}
