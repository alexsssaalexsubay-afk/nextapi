import { memo, useMemo } from "react";
import { cn } from "@/lib/cn";

interface PromptScore {
  overall: number;
  label: string;
  color: string;
  issues: string[];
  tips: string[];
}

function scorePrompt(prompt: string): PromptScore {
  if (!prompt.trim()) {
    return { overall: 0, label: "Empty", color: "text-nc-text-secondary", issues: [], tips: ["Start typing your prompt"] };
  }

  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 50;

  // Word count scoring (optimal: 30-80)
  if (wordCount < 10) {
    score -= 20;
    issues.push("Too short — Seedance works best with 30-80 words");
    tips.push("Add physical descriptions, camera movement, and lighting details");
  } else if (wordCount < 30) {
    score -= 5;
    tips.push("Consider adding more specific visual details");
  } else if (wordCount > 80) {
    score -= 10;
    issues.push("提示词偏长，Seedance 可能忽略 80 个词之后的部分");
    tips.push("聚焦一个最重要的动作");
  } else {
    score += 15;
  }

  // SVO structure check
  const hasSubject = /^[A-Z]/.test(prompt) || /[\u4e00-\u9fff]/.test(prompt);
  if (hasSubject) score += 5;

  // Physical description check
  const physicalWords = ["hair", "skin", "wearing", "dressed", "tall", "short", "eyes", "face", "beard", "glasses", "light", "dark", "young", "old", "slim", "muscular"];
  const hasPhysical = physicalWords.some((w) => prompt.toLowerCase().includes(w));
  if (hasPhysical) {
    score += 10;
  } else {
    tips.push("Add physical descriptions (hair, clothing, build) for better character consistency");
  }

  // Camera language check
  const cameraWords = ["close-up", "wide shot", "medium shot", "tracking", "pan", "dolly", "crane", "handheld", "bird's eye", "low angle", "angle", "zoom"];
  const hasCamera = cameraWords.some((w) => prompt.toLowerCase().includes(w));
  if (hasCamera) {
    score += 10;
  } else {
    tips.push("Add camera direction (e.g. 'slow tracking shot', 'close-up')");
  }

  // Lighting/mood check
  const moodWords = ["lighting", "sunlight", "shadow", "golden hour", "neon", "dramatic", "soft", "ambient", "warm", "cold", "dark", "bright", "moody", "fog"];
  const hasMood = moodWords.some((w) => prompt.toLowerCase().includes(w));
  if (hasMood) score += 10;

  // Negative patterns
  const abstractWords = ["beautiful", "amazing", "perfect", "incredible", "stunning", "gorgeous"];
  const hasAbstract = abstractWords.some((w) => prompt.toLowerCase().includes(w));
  if (hasAbstract) {
    score -= 5;
    issues.push("Avoid abstract adjectives — use specific physical descriptions instead");
  }

  // Multiple actions check
  const actionWords = prompt.match(/\b(walks|runs|turns|jumps|sits|stands|looks|reaches|opens|closes|moves|falls|flies|dances|fights|kisses|hugs|laughs|cries)\b/gi);
  if (actionWords && actionWords.length > 2) {
    score -= 10;
    issues.push("Multiple actions detected — keep one clear action per shot");
  }

  score = Math.max(0, Math.min(100, score));

  let label: string;
  let color: string;
  if (score >= 80) { label = "Excellent"; color = "text-nc-success"; }
  else if (score >= 60) { label = "Good"; color = "text-nc-accent"; }
  else if (score >= 40) { label = "Fair"; color = "text-nc-warning"; }
  else { label = "Needs work"; color = "text-nc-error"; }

  return { overall: score, label, color, issues, tips };
}

export const PromptQualityMeter = memo(function PromptQualityMeter({
  prompt,
  compact,
}: {
  prompt: string;
  compact?: boolean;
}) {
  const score = useMemo(() => scorePrompt(prompt), [prompt]);

  if (!prompt.trim()) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1 w-16 overflow-hidden rounded-full bg-nc-panel">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              score.overall >= 80 ? "bg-nc-success" :
              score.overall >= 60 ? "bg-nc-accent" :
              score.overall >= 40 ? "bg-nc-warning" :
              "bg-nc-error"
            )}
            style={{ width: `${score.overall}%` }}
          />
        </div>
        <span className={cn("text-xs font-medium", score.color)}>{score.label}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-nc-border bg-nc-surface p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-nc-text">Prompt Quality</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-nc-panel">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                score.overall >= 80 ? "bg-nc-success" :
                score.overall >= 60 ? "bg-nc-accent" :
                score.overall >= 40 ? "bg-nc-warning" :
                "bg-nc-error"
              )}
              style={{ width: `${score.overall}%` }}
            />
          </div>
          <span className={cn("text-sm font-bold tabular-nums", score.color)}>
            {score.overall}
          </span>
        </div>
      </div>

      {score.issues.length > 0 && (
        <div className="mb-2 flex flex-col gap-0.5">
          {score.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-nc-warning">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="mt-0.5 shrink-0">
                <path d="M4 0l4 7H0z" />
              </svg>
              {issue}
            </div>
          ))}
        </div>
      )}

      {score.tips.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {score.tips.slice(0, 3).map((tip, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-nc-text-secondary">
              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-nc-accent/40" />
              {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
