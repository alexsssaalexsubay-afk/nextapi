import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function MakeIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Make (Integromat)"
        intro="Build automated video generation scenarios in Make. Use the HTTP module to call the NextAPI endpoint and route the generated video through your automation pipeline."
        configLang="json"
        configSnippet={`// Make HTTP Module Configuration
{
  "url": "https://api.nextapi.top/v1/videos",
  "method": "POST",
  "headers": [
    {
      "name": "Authorization",
      "value": "Bearer {{connection.apiKey}}"
    },
    {
      "name": "Content-Type",
      "value": "application/json"
    }
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
}`}
        steps={[
          "In Make, create a new scenario and add an HTTP → \"Make a request\" module.",
          "Set the URL to https://api.nextapi.top/v1/videos and method to POST.",
          "Add the Authorization header with your Bearer token.",
          "Set the body type to JSON and configure model plus an input object containing prompt, duration_seconds, and resolution.",
          "Enable \"Parse response\" to work with the JSON output.",
          "Connect downstream modules to process the video URL from the response data.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "northern lights dancing over a frozen lake",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
