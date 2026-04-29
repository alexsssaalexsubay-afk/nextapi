import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function N8nIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="n8n"
        intro="Add AI video generation to your n8n automation workflows using the built-in HTTP Request node. This integration uses NextAPI's standard REST API — no custom nodes required."
        configLang="json"
        configSnippet={`// n8n HTTP Request Node Configuration
{
  "createVideo": {
    "method": "POST",
    "url": "https://api.nextapi.top/v1/videos",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "headerAuth": {
      "name": "Authorization",
      "value": "Bearer {{ $credentials.nextapiKey }}"
    },
    "sendBody": true,
    "bodyContentType": "json",
    "jsonBody": {
      "model": "seedance-2.0-pro",
      "input": {
        "prompt": "={{ $json.prompt }}",
        "duration_seconds": 6,
        "resolution": "1080p"
      }
    }
  },
  "pollVideo": {
    "method": "GET",
    "url": "={{ 'https://api.nextapi.top/v1/videos/' + $json.id }}",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "headerAuth": {
      "name": "Authorization",
      "value": "Bearer {{ $credentials.nextapiKey }}"
    }
  }
}`}
        steps={[
          "In n8n, go to Settings → Credentials and create a new \"Header Auth\" credential with your NextAPI key.",
          "Add an HTTP Request node to your workflow.",
          "Set the method to POST and the URL to https://api.nextapi.top/v1/videos.",
          "Configure the authentication to use your Header Auth credential with header name \"Authorization\" and value \"Bearer {key}\".",
          "Set the JSON body with model plus an input object containing prompt, duration_seconds, and resolution.",
          "Save the returned id, then add a second HTTP Request node that calls GET /v1/videos/{id}.",
          "Only pass output.url or output.video_url downstream after status is succeeded.",
        ]}
        curlTest={`CREATE_RESPONSE=$(curl -sS -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "timelapse of clouds over mountains",
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
