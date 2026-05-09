import {
  BookOpenText,
  Camera,
  Clapperboard,
  Music2,
  Scissors,
  ShieldCheck,
  UserRoundCheck,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";

const iconByAgentId = {
  screenwriter: BookOpenText,
  character_extractor: UserRoundCheck,
  storyboard_artist: Clapperboard,
  cinematographer: Camera,
  audio_director: Music2,
  prompt_optimizer: WandSparkles,
  consistency_checker: ShieldCheck,
  editing_agent: Scissors,
};

export function AgentGlyph({
  agentId,
  accent,
  active = false,
  className,
}: {
  agentId: string;
  accent: string;
  active?: boolean;
  className?: string;
}) {
  const Icon = iconByAgentId[agentId as keyof typeof iconByAgentId] || WandSparkles;

  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/70 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]",
        active && "ring-2 ring-white/80",
        className
      )}
      style={{ background: `linear-gradient(135deg, ${accent}, #6C4DFF)` }}
    >
      <Icon className="h-5 w-5" strokeWidth={2.2} />
    </span>
  );
}
