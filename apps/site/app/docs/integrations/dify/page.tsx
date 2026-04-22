import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function DifyIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Dify"
        intro="Connect NextAPI as a custom tool in Dify to add video generation capabilities to your AI applications. Dify's tool system lets you define external API endpoints that agents can call."
        configLang="yaml"
        configSnippet={`# Dify Custom Tool Schema
openapi: "3.0"
info:
  title: NextAPI Video Generation
  version: "1.0"
servers:
  - url: https://api.nextapi.top
paths:
  /v1/videos/generate:
    post:
      operationId: generateVideo
      summary: Generate an AI video
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [model, prompt]
              properties:
                model:
                  type: string
                  default: seedance-2.0-pro
                prompt:
                  type: string
                duration:
                  type: integer
                  default: 6
                resolution:
                  type: string
                  default: "1080p"`}
        steps={[
          "In Dify Studio, navigate to Tools → Custom and click \"Create Custom Tool\".",
          "Paste the OpenAPI schema above into the schema editor.",
          "Configure the authentication: select \"API Key\" and set the header to \"Authorization\" with prefix \"Bearer\".",
          "Enter your NextAPI API key and save the tool.",
          "In your Dify app, add the \"Generate Video\" tool to your agent's toolset.",
          "Test by asking the agent to generate a video — it will call NextAPI automatically.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/videos/generate \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "prompt": "aerial view of a city at sunset",
    "duration": 6,
    "resolution": "1080p"
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
