"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Card, StatusBadge } from "@nextapi/ui";
import { Play, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function PlaygroundPage() {
  const t = useTranslations("app");
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  async function submit() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setJobId(null);
    setVideoUrl(null);
    setStatus(null);
    try {
      const r = await apiFetch<{ id: string; status: string }>("/v1/video/generations", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          model: "seedance-2.0",
          duration_seconds: 5,
          resolution: "1080p",
          mode: "fast",
        }),
      });
      if (!r.ok || !r.data) throw new Error("request failed");
      setJobId(r.data.id);
      setStatus(r.data.status);
      poll(r.data.id);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function poll(id: string) {
    setPolling(true);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const r = await apiFetch<{ status: string; video_url?: string; error_message?: string }>(`/v1/jobs/${id}`);
        if (!r.data) break;
        setStatus(r.data.status);
        if (r.data.status === "succeeded") {
          setVideoUrl(r.data.video_url ?? null);
          setPolling(false);
          return;
        }
        if (r.data.status === "failed") {
          setError(r.data.error_message ?? "job failed");
          setPolling(false);
          return;
        }
      } catch {
        break;
      }
    }
    setPolling(false);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Generate a video using your signup credits.
      </p>

      <Card className="mt-6 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Describe your video…"
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPrompt(e.target.value)
            }
            disabled={loading || polling}
            className="flex-1"
          />
          <Button onClick={submit} disabled={loading || polling || !prompt.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="h-4 w-4" /> Generate
              </>
            )}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {jobId && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-zinc-400">Job:</span>
              <code className="font-mono text-xs">{jobId}</code>
              {status && <StatusBadge status={status} />}
              {polling && <Loader2 className="h-3 w-3 animate-spin text-sky-400" />}
            </div>
            {videoUrl && (
              <video
                src={videoUrl}
                controls
                autoPlay
                className="mt-4 w-full rounded-lg border border-zinc-800"
              />
            )}
          </div>
        )}
      </Card>
    </>
  );
}
