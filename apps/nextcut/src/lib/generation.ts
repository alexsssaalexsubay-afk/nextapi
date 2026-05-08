import { sidecarFetch } from "@/lib/sidecar";
import type { PipelineConfig, Shot } from "@/stores/director-store";

export type GeneratePayload = {
  shot_id: string;
  prompt: string;
  negative_prompt: string;
  shot_script: string;
  constraints: string;
  audio_cues: string[];
  reference_instructions: string[];
  duration: number;
  quality: string;
  aspect_ratio: string;
  generate_audio: boolean;
  image_urls: string[];
  video_urls: string[];
  audio_urls: string[];
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  workflow: string;
  provider_options?: Record<string, unknown>;
};

export type ProviderArtifact = {
  type: "image" | "video" | "audio" | "file" | string;
  url: string;
  source: string;
  metadata?: Record<string, unknown>;
};

export type GenerationJobStatus = {
  shot_id: string;
  status: string;
  provider_job_id?: string;
  provider?: string;
  provider_model?: string;
  video_url?: string;
  failure_reason?: string;
  upstream?: {
    request?: Record<string, unknown>;
    submit?: Record<string, unknown>;
    final?: Record<string, unknown>;
  };
  artifacts?: ProviderArtifact[];
};

export type PreflightFinding = {
  shot_id: string;
  severity: "critical" | "warning" | "info" | string;
  code: string;
  message: string;
  suggestion?: string;
};

export type PreflightResponse = {
  status: "allowed" | "blocked" | string;
  critical: number;
  warning: number;
  info: number;
  findings: PreflightFinding[];
};

export function buildGeneratePayload({
  shot,
  pipeline,
  aspectRatio,
  workflow,
  promptOverride,
  durationOverride,
  extraImageUrls = [],
  extraVideoUrls = [],
  extraAudioUrls = [],
}: {
  shot: Shot;
  pipeline: PipelineConfig;
  aspectRatio: string;
  workflow: string;
  promptOverride?: string;
  durationOverride?: number;
  extraImageUrls?: string[];
  extraVideoUrls?: string[];
  extraAudioUrls?: string[];
}): GeneratePayload {
  const params = shot.generationParams;
  const imageUrls = uniqueCompact([
    ...(params?.image_urls || []),
    ...(shot.thumbnail_url ? [shot.thumbnail_url] : []),
    ...extraImageUrls,
  ]);
  const videoUrls = uniqueCompact([
    ...(params?.video_urls || []),
    ...(shot.video_url ? [shot.video_url] : []),
    ...extraVideoUrls,
  ]);
  const audioUrls = uniqueCompact([...(params?.audio_urls || []), ...extraAudioUrls]);

  return {
    shot_id: shot.id,
    prompt: promptOverride || shot.prompt,
    negative_prompt: shot.negative_prompt || "low quality, watermark, text overlay, distorted identity",
    shot_script: params?.shot_script || "",
    constraints: [params?.constraints, shot.camera ? `Camera: ${shot.camera}` : ""].filter(Boolean).join("\n"),
    audio_cues: params?.audio_cues || [],
    reference_instructions: params?.reference_instructions || [],
    duration: durationOverride ?? shot.duration,
    quality: pipeline.video_quality,
    aspect_ratio: aspectRatio,
    generate_audio: pipeline.generate_audio,
    image_urls: imageUrls.slice(0, 9),
    video_urls: videoUrls.slice(0, 3),
    audio_urls: audioUrls.slice(0, 3),
    provider: pipeline.video_provider,
    model: pipeline.video_model,
    api_key: pipeline.video_api_key,
    base_url: pipeline.video_base_url,
    workflow,
    provider_options: params?.provider_options || {},
  };
}

export async function runGenerationPreflight(shots: GeneratePayload[], sequential = false) {
  return sidecarFetch<PreflightResponse>("/generate/preflight", {
    method: "POST",
    body: JSON.stringify({ sequential, shots }),
  });
}

export function formatPreflightFindings(preflight: PreflightResponse) {
  if (!preflight.findings.length) return "";
  return preflight.findings
    .slice(0, 4)
    .map((finding) => `${finding.shot_id ? `${finding.shot_id}: ` : ""}${finding.message}${finding.suggestion ? ` ${finding.suggestion}` : ""}`)
    .join("\n");
}

function uniqueCompact(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}
