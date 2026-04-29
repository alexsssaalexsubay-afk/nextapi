import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function ComfyUIIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="ComfyUI"
        intro="Connect ComfyUI to NextAPI using a trusted HTTP/API request custom node. A packaged NextAPI custom node is in development and not yet shipped — the verified path today is through ComfyUI's generic HTTP request nodes."
        configLang="json"
        configSnippet={`// ComfyUI HTTP/API Request Node Configuration
{
  "create": {
    "method": "POST",
    "url": "https://api.nextapi.top/v1/videos",
    "headers": {
      "Authorization": "Bearer sk_...",
      "Content-Type": "application/json"
    },
    "body": {
      "model": "seedance-2.0-pro",
      "input": {
        "prompt": "your prompt here",
        "duration_seconds": 6,
        "resolution": "1080p"
      }
    }
  },
  "poll": {
    "method": "GET",
    "url": "https://api.nextapi.top/v1/videos/{id}",
    "headers": {
      "Authorization": "Bearer sk_..."
    }
  }
}`}
        steps={[
          "Use a local or trusted ComfyUI installation. Do not use unofficial hosted mirrors.",
          "Install a trusted HTTP/API Request custom node in your ComfyUI.",
          "Add a create request node: method POST, URL https://api.nextapi.top/v1/videos, headers Authorization: Bearer sk_... and Content-Type: application/json.",
          "Set the JSON body with model and input (prompt, duration_seconds, resolution).",
          "Save the returned id from the create response.",
          "Add a poll request node: method GET, URL https://api.nextapi.top/v1/videos/{id}, same Authorization header.",
          "When status = succeeded, read output.url or output.video_url as the download address.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "ink spreading through water in slow motion",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`}
        footerNote={
          <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300">
            A packaged NextAPI ComfyUI custom node is pending. For strict setup instructions and tool-specific details, refer to the{" "}
            <a href="/docs/third-party-tools" className="font-semibold underline underline-offset-2">
              third-party tools configuration guide
            </a>{" "}
            in the NextAPI documentation.
          </div>
        }
      />
      <LandingFooter />
    </div>
  )
}
