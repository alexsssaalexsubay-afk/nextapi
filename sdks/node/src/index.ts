import { NextAPIError } from "./errors.js";

export { NextAPIError };

export interface NextAPIOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface GenerateParams {
  prompt: string;
  model?: string;
  imageUrl?: string;
  durationSeconds?: number;
  resolution?: string;
  mode?: string;
}

export interface VideoGenerationResponse {
  id: string;
  status: string;
  estimated_credits: number;
  [key: string]: unknown;
}

export interface JobResponse {
  id: string;
  status: string;
  output?: unknown;
  error?: { code: string; message: string };
  [key: string]: unknown;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

const TERMINAL = new Set([
  "succeeded",
  "failed",
  "canceled",
  "cancelled",
  "completed",
  "error",
]);

export class NextAPI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NextAPIOptions) {
    if (!options.apiKey) throw new Error("apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.nextapi.top").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error("global fetch is not available; Node 20+ required or pass options.fetch");
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
    }

    if (!res.ok) {
      const env = (data ?? {}) as ApiErrorEnvelope;
      const code = env.error?.code ?? `http_${res.status}`;
      const message = env.error?.message ?? text ?? "request failed";
      throw new NextAPIError(code, message, res.status);
    }
    return data as T;
  }

  generate(params: GenerateParams): Promise<VideoGenerationResponse> {
    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      model: params.model ?? "seedance-v2-pro",
      duration_seconds: params.durationSeconds ?? 5,
      resolution: params.resolution ?? "1080p",
      mode: params.mode ?? "normal",
    };
    if (params.imageUrl !== undefined) payload.image_url = params.imageUrl;
    return this.request<VideoGenerationResponse>("POST", "/v1/video/generations", payload);
  }

  getJob(jobId: string): Promise<JobResponse> {
    return this.request<JobResponse>("GET", `/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  async wait(
    jobId: string,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<JobResponse> {
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.getJob(jobId);
      if (TERMINAL.has(String(job.status).toLowerCase())) return job;
      if (Date.now() >= deadline) {
        throw new NextAPIError("timeout", `job ${jobId} did not finish within ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }
}

export default NextAPI;
