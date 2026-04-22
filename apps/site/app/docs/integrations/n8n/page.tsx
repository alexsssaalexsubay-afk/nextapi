import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function N8nIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="n8n"
        intro="Add AI video generation to your n8n automation workflows. Use the HTTP Request node to call the NextAPI endpoint and process results downstream."
        configLang="json"
        configSnippet={`// n8n HTTP Request Node Configuration
{
  "method": "POST",
  "url": "https://api.nextapi.top/v1/videos/generate",
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
    "prompt": "={{ $json.prompt }}",
    "duration": 6,
    "resolution": "1080p"
  }
}`}
        steps={[
          "In n8n, go to Settings → Credentials and create a new \"Header Auth\" credential with your NextAPI key.",
          "Add an HTTP Request node to your workflow.",
          "Set the method to POST and the URL to https://api.nextapi.top/v1/videos/generate.",
          "Configure the authentication to use your Header Auth credential with header name \"Authorization\" and value \"Bearer {key}\".",
          "Set the JSON body with your model, prompt, duration, and resolution parameters.",
          "Connect the output to downstream nodes to process the video URL from the response.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/videos/generate \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "prompt": "timelapse of clouds over mountains",
    "duration": 6,
    "resolution": "1080p"
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
