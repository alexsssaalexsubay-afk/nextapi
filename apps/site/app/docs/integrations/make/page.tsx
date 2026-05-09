import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function MakeIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Make (Integromat)"
        intro="Build automated video generation scenarios in Make using the built-in HTTP app. This integration uses NextAPI's standard REST API — no custom modules required."
        configLang="json"
        configSnippet={`// Make HTTP Module Configuration
{
  "createVideo": {
    "url": "https://api.nextapi.top/v1/videos",
    "method": "POST",
    "headers": [
      { "name": "Authorization", "value": "Bearer {{connection.apiKey}}" },
      { "name": "Content-Type", "value": "application/json" }
    ],
    "body": {
      "model": "seedance-2.0-pro",
      "input": {
        "prompt": "{{1.prompt}}",
        "duration_seconds": 6,
        "resolution": "1080p"
      }
    },
    "parseResponse": true
  },
  "pollVideo": {
    "url": "https://api.nextapi.top/v1/videos/{{createVideo.id}}",
    "method": "GET",
    "headers": [
      { "name": "Authorization", "value": "Bearer {{connection.apiKey}}" }
    ],
    "parseResponse": true
  }
}`}
        steps={[
          "In Make, create a new scenario and add an HTTP > \"Make a request\" module.",
          "Set the URL to https://api.nextapi.top/v1/videos and method to POST.",
          "Add the Authorization header with your Bearer token.",
          "Set the body type to JSON and configure model plus an input object containing prompt, duration_seconds, and resolution.",
          "Enable \"Parse response\" to work with the JSON output.",
          "Store the returned id, then add a second HTTP module that calls GET /v1/videos/{id}.",
          "Only use output.url or output.video_url after the polled status is succeeded.",
        ]}
        curlTest={`CREATE_RESPONSE=$(curl -sS -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "northern lights dancing over a frozen lake",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }')

VIDEO_ID=$(printf '%s' "$CREATE_RESPONSE" | jq -r '.id')

curl -sS "https://api.nextapi.top/v1/videos/$VIDEO_ID" \\
  -H "Authorization: Bearer $NEXTAPI_KEY"`}
        footerNote={
          <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300">
            For complete setup details including polling, error handling, and security best practices, refer to the{" "}
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
