import { useCallback, useRef } from "react";
import {
  useDirectorStore,
  type CharacterProfile,
  type PromptReviewSummary,
  type ProductionBible,
  type QualityScore,
  type Shot,
  type ShotGenerationCard,
} from "@/stores/director-store";
import { useAuthStore } from "@/stores/auth-store";
import { sidecarFetch, SidecarError } from "@/lib/sidecar";

const POLL_INTERVAL = 2000;
const POLL_BACKOFF = 3000;
const MAX_POLL_FAILURES = 10;

interface PlanPollResult {
  status: string;
  error?: string;
  shots?: Array<{
    id: string;
    scene_id: string;
    index: number;
    title: string;
    duration: number;
    prompt: string;
    negative_prompt?: string;
    status: string;
    video_url?: string;
    thumbnail_url?: string;
    camera?: { camera?: string };
    audio?: { dialogue?: string; lip_sync?: string; music?: string; sfx?: string };
    generation_params?: Shot["generationParams"];
  }>;
  scenes?: Array<{
    id: string;
    title: string;
    description: string;
    characters: string[];
  }>;
  quality_scores?: Array<{
    shot_id: string;
    overall: number;
    character_consistency: number;
    prompt_quality: number;
    style_coherence: number;
  }>;
  characters?: Array<{
    name: string;
    appearance?: string;
    personality?: string;
    voice?: string;
    reference_images?: string[];
  }>;
  workbench?: {
    production_bible?: ProductionBible;
    shot_generation_cards?: ShotGenerationCard[];
  };
  metadata?: {
    production_bible?: ProductionBible;
    shot_generation_cards?: ShotGenerationCard[];
    prompt_review?: PromptReviewSummary;
  };
}

function mapShots(
  raw: PlanPollResult["shots"],
  qualityScores?: PlanPollResult["quality_scores"]
): Shot[] {
  if (!raw) return [];
  const qMap = new Map<string, QualityScore>();
  if (qualityScores) {
    for (const q of qualityScores) {
      qMap.set(q.shot_id, {
        overall: q.overall,
        characterConsistency: q.character_consistency,
        promptQuality: q.prompt_quality,
        styleCoherence: q.style_coherence,
        issues: [],
      });
    }
  }
  return raw.map((s) => ({
    id: s.id,
    scene_id: s.scene_id,
    index: s.index,
    title: s.title,
    duration: s.duration,
    prompt: s.prompt,
    negative_prompt: s.negative_prompt || "",
    status: s.status,
    video_url: s.video_url || "",
    thumbnail_url: s.thumbnail_url || "",
    camera: s.camera?.camera || "",
    audio: s.audio ? {
      dialogue: s.audio.dialogue || "",
      lip_sync: s.audio.lip_sync || "",
      music: s.audio.music || "",
      sfx: s.audio.sfx || ""
    } : undefined,
    generationParams: s.generation_params,
    qualityScore: qMap.get(s.id) || null,
  }));
}

function mapCharacters(raw: PlanPollResult["characters"]): CharacterProfile[] {
  if (!raw) return [];
  return raw.map((c, index) => ({
    id: `character_${index + 1}`,
    name: c.name || `Character ${index + 1}`,
    appearance: c.appearance || "",
    personality: c.personality || "",
    voice: c.voice || "",
    referenceImages: c.reference_images || [],
    color: ["#42d392", "#7c5cff", "#ffb86b", "#4cc9f0", "#ff6b9d"][index % 5],
    locked: true,
  }));
}

export function useDirector() {
  const store = useDirectorStore();
  const authStore = useAuthStore();
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPipeline = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    store.setIsRunning(false);
    store.setPipelineStep("idle");
  }, [store]);

  const runPipeline = useCallback(async () => {
    if (!store.prompt.trim()) return;

    stopPipeline();

    const controller = new AbortController();
    abortRef.current = controller;

    store.setIsRunning(true);
    store.setAgentProgress([]);
    store.setLastError(null);
    store.setShots([]);
    store.setSceneOutlines([]);
    store.setCharacters([]);
    store.setProductionBible(null);
    store.setShotGenerationCards([]);
    store.setPromptReview(null);
    store.setPipelineStep("planning");

    try {
      // Inject user's API key if logged in
      const pipelineConfig = { ...store.pipeline };
      if (authStore.user?.dashboardKey) {
        pipelineConfig.video_api_key = authStore.user.dashboardKey;
      }

      const res = await sidecarFetch<{ id: string; status: string }>(
        "/director/plan",
        {
          method: "POST",
          body: JSON.stringify({
            prompt: store.prompt,
            style: store.style,
            num_shots: store.numShots,
            duration: store.duration,
            aspect_ratio: store.aspectRatio,
            workflow: store.selectedWorkflow,
            references: store.references,
            pipeline: pipelineConfig,
          }),
          signal: controller.signal,
        },
        1
      );

      store.setPlanId(res.id);
      pollPlan(res.id, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof SidecarError
        ? `本地引擎错误（${err.status}）`
        : "无法连接本地引擎，请确认 NextAPI Studio 本地引擎已启动。";
      store.setLastError(msg);
      store.setIsRunning(false);
      store.setPipelineStep("idle");
    }
  }, [store, stopPipeline]);

  const pollPlan = useCallback((planId: string, signal: AbortSignal) => {
    let failures = 0;

    const poll = async () => {
      if (signal.aborted) return;

      try {
        const res = await sidecarFetch<PlanPollResult>(
          `/director/plan/${planId}`,
          { signal }
        );

        failures = 0;

        if (res.status === "completed") {
          const shots = mapShots(res.shots, res.quality_scores);
          store.setShots(shots);
          store.setCharacters(mapCharacters(res.characters));

          const bible = res.workbench?.production_bible || res.metadata?.production_bible || null;
          store.setProductionBible(bible);
          store.setShotGenerationCards(
            res.workbench?.shot_generation_cards || res.metadata?.shot_generation_cards || []
          );
          store.setPromptReview(res.metadata?.prompt_review || null);

          if (res.scenes) {
            store.setSceneOutlines(
              res.scenes.map((s) => ({
                id: s.id,
                title: s.title,
                description: s.description,
                characters: s.characters || [],
              }))
            );
          }

          if (res.quality_scores && res.quality_scores.length > 0) {
            const qs = res.quality_scores;
            const n = qs.length;
            const avg = (fn: (q: (typeof qs)[number]) => number) =>
              qs.reduce((sum, q) => sum + fn(q), 0) / n;
            store.setOverallQuality({
              overall: avg((q) => q.overall),
              characterConsistency: avg((q) => q.character_consistency),
              promptQuality: avg((q) => q.prompt_quality),
              styleCoherence: avg((q) => q.style_coherence),
              issues: [],
            });
          }

          store.setIsRunning(false);
          store.setPipelineStep("storyboard_review");
          return;
        }

        if (res.status === "failed") {
          store.setLastError(res.error || "Pipeline failed");
          store.setIsRunning(false);
          store.setPipelineStep("idle");
          return;
        }

        pollRef.current = setTimeout(poll, POLL_INTERVAL);
      } catch {
        if (signal.aborted) return;
        failures++;
        if (failures >= MAX_POLL_FAILURES) {
          store.setLastError("Lost connection to engine during processing");
          store.setIsRunning(false);
          store.setPipelineStep("idle");
          return;
        }
        pollRef.current = setTimeout(poll, POLL_BACKOFF);
      }
    };

    poll();
  }, [store]);

  return { runPipeline, stopPipeline };
}
