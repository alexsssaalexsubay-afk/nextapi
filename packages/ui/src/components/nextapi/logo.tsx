import Image from "next/image"
import { cn } from "@/lib/utils"

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex size-6 items-center justify-center overflow-hidden rounded-[5px]">
        <Image
          src="/nextapi-logo.png"
          alt="NextAPI"
          width={64}
          height={64}
          className="size-6 object-cover"
          priority
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
