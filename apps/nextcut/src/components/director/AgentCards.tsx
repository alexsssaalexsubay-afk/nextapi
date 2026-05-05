import { memo } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore } from "@/stores/director-store";

interface AgentPersona {
  id: string;
  name: string;
  nameZh: string;
  role: string;
  avatar: string;
  color: string;
  speciality: string;
  thinkingPhrases: string[];
}

const AGENTS: AgentPersona[] = [
  {
    id: "screenwriter",
    name: "Alex",
    nameZh: "编剧",
    role: "Screenwriter",
    avatar: "✍️",
    color: "#6366f1",
    speciality: "Story structure, character arcs, dialogue",
    thinkingPhrases: ["Crafting the story arc...", "Writing scene dialogue...", "Developing character motivations..."],
  },
  {
    id: "character_extractor",
    name: "Maya",
    nameZh: "角色",
    role: "Character Designer",
    avatar: "👤",
    color: "#ec4899",
    speciality: "Character identity, appearance consistency, casting",
    thinkingPhrases: ["Analyzing character descriptions...", "Locking identity features...", "Building appearance profiles..."],
  },
  {
    id: "storyboard_artist",
    name: "Jin",
    nameZh: "分镜",
    role: "Storyboard Artist",
    avatar: "🎨",
    color: "#f59e0b",
    speciality: "Visual composition, shot sequencing, scene breakdown",
    thinkingPhrases: ["Sketching the storyboard...", "Decomposing into shots...", "Planning visual flow..."],
  },
  {
    id: "cinematographer",
    name: "Leo",
    nameZh: "摄影",
    role: "Cinematographer",
    avatar: "🎥",
    color: "#10b981",
    speciality: "Camera movement, lighting, lens selection, composition",
    thinkingPhrases: ["Choosing camera angles...", "Planning dolly movement...", "Setting lighting mood..."],
  },
  {
    id: "audio_director",
    name: "Aria",
    nameZh: "音效",
    role: "Audio Director",
    avatar: "🎵",
    color: "#3b82f6",
    speciality: "Music, SFX, dialogue, ambient sound, lip-sync",
    thinkingPhrases: ["Composing the soundscape...", "Syncing dialogue timing...", "Selecting ambient layers..."],
  },
  {
    id: "prompt_optimizer",
    name: "Nova",
    nameZh: "提示词",
    role: "Prompt Engineer",
    avatar: "⚡",
    color: "#f97316",
    speciality: "Seedance prompt optimization, SVO structure, constraint writing",
    thinkingPhrases: ["Optimizing for Seedance 2.0...", "Restructuring to SVO...", "Adding constraint guardrails..."],
  },
  {
    id: "consistency_checker",
    name: "Kai",
    nameZh: "质检",
    role: "Quality Inspector",
    avatar: "🔍",
    color: "#8b5cf6",
    speciality: "Character drift detection, style consistency, prompt compliance",
    thinkingPhrases: ["Scanning for drift...", "Verifying character identity...", "Checking cross-shot consistency..."],
  },
  {
    id: "editing_agent",
    name: "Sam",
    nameZh: "剪辑",
    role: "Film Editor",
    avatar: "✂️",
    color: "#14b8a6",
    speciality: "Pacing, transitions, rhythm, color grading",
    thinkingPhrases: ["Planning edit rhythm...", "Designing transitions...", "Setting color grade..."],
  },
];

export const AgentCards = memo(function AgentCards() {
  const { agentProgress, isRunning } = useDirectorStore();

  const progressMap = new Map(agentProgress.map((p) => [p.agent, p]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-nc-text">AI Director Team</h3>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-nc-accent">
            <span className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-nc-accent" />
            Working
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {AGENTS.map((agent) => {
          const progress = progressMap.get(agent.id);
          const isActive = progress?.status === "running" || progress?.status === "progress";
          const isDone = progress?.status === "complete";
          const pct = progress ? Math.round(progress.progress * 100) : 0;

          return (
            <div
              key={agent.id}
              className={cn(
                "relative overflow-hidden rounded-lg border border-nc-border bg-nc-surface p-3 shadow-sm transition-all duration-200 hover:shadow-md",
                isActive ? "border-nc-accent/40 bg-nc-accent-muted shadow-md ring-1 ring-nc-accent/15" :
                isDone ? "border-nc-success/30 bg-nc-surface shadow-sm" :
                ""
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg shadow-inner"
                  style={{ backgroundColor: agent.color + "15" }}
                >
                  {agent.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-nc-text">{agent.name}</span>
                    <span className="text-xs text-nc-text-secondary">{agent.nameZh}</span>
                    {isDone && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#10b981" strokeWidth="1.5" className="ml-auto shrink-0">
                        <path d="M1.5 4l2 2L6.5 2" />
                      </svg>
                    )}
                  </div>
                  <div className="text-xs leading-tight text-nc-text-secondary">{agent.role}</div>
                </div>
              </div>

              {/* Thinking bubble when active */}
              {isActive && (
                <div className="mt-1.5 rounded-lg border border-nc-border/80 bg-nc-panel px-2.5 py-1.5 shadow-sm">
                  <div className="flex items-center gap-1 text-xs italic text-nc-accent">
                    <div className="flex gap-0.5">
                      <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-nc-accent" style={{ animationDelay: "0ms" }} />
                      <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-nc-accent" style={{ animationDelay: "200ms" }} />
                      <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-nc-accent" style={{ animationDelay: "400ms" }} />
                    </div>
                    {agent.thinkingPhrases[Math.floor(pct / 35) % agent.thinkingPhrases.length]}
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {progress && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-nc-panel">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      isDone ? "bg-nc-success" : "bg-nc-accent"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
