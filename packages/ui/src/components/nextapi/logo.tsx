import { cn } from "@/lib/utils"

// Plain <img> so the mark works on OpenNext/Cloudflare Workers where next/image
// can miss /public assets depending on build output; file lives in app public/.
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex size-6 items-center justify-center overflow-hidden rounded-[5px]">
        <img
          src="/nextapi-logo.png"
          alt="NextAPI"
          width={24}
          height={24}
          className="size-6 object-cover"
        />
      </div>
      {withWordmark && (
        <span className="font-mono text-[13px] font-medium tracking-tight text-foreground">
          NextAPI
        </span>
      )}
    </div>
  )
}
