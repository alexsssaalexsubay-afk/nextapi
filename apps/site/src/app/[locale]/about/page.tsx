export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight">
          We&rsquo;re building the OpenRouter for Video AI.
        </h1>
        <p className="mt-6 text-lg text-zinc-400">
          NextAPI is a video AI API gateway. We hold 1 of 20 global reseller
          licenses for ByteDance Volcengine Seedance. Our mission: be the
          infrastructure layer every AI app reaches for when it needs to
          generate video.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-6">
            <h3 className="font-semibold">Why us</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Official Seedance access. No queueing. No gatekeeping. Pricing
              that scales with real token usage.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-6">
            <h3 className="font-semibold">Where we&rsquo;re going</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Multi-provider routing. Enterprise SLAs. Regional redundancy.
              SDKs for every language.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
