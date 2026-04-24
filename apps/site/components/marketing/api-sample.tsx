"use client"

import { CodeBlock } from "@/components/nextapi/code-block"
import { Activity, CheckCircle2, Gauge } from "lucide-react"
import { useTranslations } from "@/lib/i18n/context"

const tabs = [
  {
    label: "text-to-video",
    language: "bash",
    code: `curl https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "mode": "text-to-video",
      "prompt": "Drone orbiting a lighthouse at dusk, cinematic, 35mm",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`,
  },
  {
    label: "image-to-video",
    language: "bash",
    code: `curl https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "mode": "image-to-video",
      "image_url": "https://cdn.acme.com/lighthouse.jpg",
      "prompt": "Camera slowly orbits around the lighthouse as waves crash below",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`,
  },
  {
    label: "Node.js",
    language: "javascript",
    code: `import { NextAPI } from "nextapi"

const nextapi = new NextAPI({ apiKey: process.env.NEXTAPI_KEY })

const video = await nextapi.generate({
  model: "seedance-2.0-pro",
  mode: "text-to-video",
  prompt: "Drone orbiting a lighthouse at dusk, cinematic, 35mm",
  durationSeconds: 6,
  resolution: "1080p",
})

// video.id                   -> "vid_7Hc9Xk2Lm3NpQ4rS"
// video.status               -> "queued"
// video.estimated_cost_cents -> 100`,
  },
  {
    label: "Python",
    language: "python",
    code: `from nextapi import Client

client = Client(api_key=os.environ["NEXTAPI_KEY"])

# image-to-video — pass image_url alongside prompt
video = client.generate(
    model="seedance-2.0-pro",
    mode="image-to-video",
    image_url="https://cdn.acme.com/lighthouse.jpg",
    prompt="Camera slowly orbits around the lighthouse",
    duration_seconds=6,
    resolution="1080p",
)

# video["id"]                   -> "vid_7Hc9Xk2Lm3NpQ4rS"
# video["status"]               -> "queued"
# video["estimated_cost_cents"] -> 100`,
  },
]

const webhookTab = [
  {
    label: "webhook payload",
    language: "json",
    code: `{
  "event": "video.succeeded",
  "id": "vid_7Hc9Xk2Lm3NpQ4rS",
  "job_id": "job_7Hc9Xk2Lm3NpQ4rS",
  "video_id": "vid_7Hc9Xk2Lm3NpQ4rS",
  "model": "seedance-2.0-pro",
  "status": "succeeded",
  "duration_ms": 38420,
  "output": {
    "video_url": "https://cdn.nextapi.top/out/7Hc9Xk2Lm3NpQ4rS.mp4",
    "thumb_url": "https://cdn.nextapi.top/out/7Hc9Xk2Lm3NpQ4rS.jpg",
    "width": 1920,
    "height": 1080,
    "duration_s": 6.0
  },
  "billing": {
    "estimated_cost_cents": 100,
    "billed_cents": 84,
    "refunded_cents": 0,
    "currency": "USD"
  },
  "delivered_at": "2025-04-22T17:03:11Z"
}`,
  },
]

export function ApiSample() {
  const t = useTranslations()
  const bullets = [
    { icon: CheckCircle2, text: t.api.bullets.idempotency },
    { icon: Gauge, text: t.api.bullets.latency },
    { icon: Activity, text: t.api.bullets.rateLimits },
  ]

  return (
    <section id="api" className="border-b border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[380px_1fr]">
          <div className="flex flex-col gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
              / {t.api.eyebrow}
            </span>
            <h2 className="text-balance text-[32px] font-medium leading-tight tracking-tight md:text-[40px]">
              {t.api.title}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t.api.subtitle}</p>

            <ul className="mt-4 flex flex-col gap-3 text-[13.5px]">
              {bullets.map((i) => (
                <li key={i.text} className="flex items-start gap-3">
                  <i.icon className="mt-0.5 size-4 text-signal" />
                  <span className="text-foreground/90">{i.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-5">
            <CodeBlock tabs={tabs} />
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
              <div className="h-px flex-1 bg-border/60" />
              <span className="font-mono uppercase tracking-[0.18em]">{t.api.webhookReceived}</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <CodeBlock tabs={webhookTab} />
          </div>
        </div>
      </div>
    </section>
  )
}
