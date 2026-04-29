import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function CursorIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Cursor"
        intro="Use NextAPI from Cursor through the standard REST API. This page describes the verified create-and-poll HTTP flow; a packaged NextAPI MCP server is not claimed here."
        configLang="md"
        configSnippet={`# .cursor/rules/nextapi-video.mdc
When the user asks for AI video generation:
- Read NEXTAPI_KEY from the local environment.
- POST https://api.nextapi.top/v1/videos with Authorization: Bearer $NEXTAPI_KEY.
- Save the returned id.
- Poll GET https://api.nextapi.top/v1/videos/{id}.
- Treat the task as complete only when status = succeeded and output.url or output.video_url exists.`}
        steps={[
          "Sign up at app.nextapi.top and create an API key.",
          "Store it outside source control, for example in your shell as NEXTAPI_KEY.",
          "Add the rule above to your Cursor project so the agent follows the async REST flow.",
          "Ask your agent to generate a video and have it run the create request.",
          "Have the agent poll by id and return the final URL only after status is succeeded.",
        ]}
        curlTest={`CREATE_RESPONSE=$(curl -sS -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "a gentle wave rolling onto a sandy beach",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }')

VIDEO_ID=$(printf '%s' "$CREATE_RESPONSE" | jq -r '.id')

curl -sS "https://api.nextapi.top/v1/videos/$VIDEO_ID" \\
  -H "Authorization: Bearer $NEXTAPI_KEY"`}
        footerNote={
          <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300">
            Do not commit <code className="font-mono">sk_*</code> keys or local Cursor rules containing secrets. For strict setup details, see the{" "}
            <a href="/docs/third-party-tools" className="font-semibold underline underline-offset-2">
              third-party tools configuration guide
            </a>.
          </div>
        }
      />
      <LandingFooter />
    </div>
  )
}
