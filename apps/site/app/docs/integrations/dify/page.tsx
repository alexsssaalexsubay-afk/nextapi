import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function DifyIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Dify"
        intro="Connect NextAPI as a custom tool in Dify to add video generation capabilities to your AI applications. Dify's OpenAPI tool system lets you define external API endpoints that agents can call — no plugin required."
        configLang="yaml"
        configSnippet={`# Dify Custom Tool Schema
openapi: "3.0"
info:
  title: NextAPI Video Generation
  version: "1.0"
servers:
  - url: https://api.nextapi.top
paths:
  /v1/videos:
    post:
      operationId: generateVideo
      summary: Generate an AI video
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [model, input]
              properties:
                model:
                  type: string
                  default: seedance-2.0-pro
                input:
                  type: object
                  required: [prompt]
                  properties:
                    prompt:
                      type: string
                    duration_seconds:
                      type: integer
                      default: 6
                    resolution:
                      type: string
                      default: "1080p"
      responses:
        "202":
          description: Video task created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  status:
                    type: string
                  estimated_cost_cents:
                    type: integer
  /v1/videos/{id}:
    get:
      operationId: getVideo
      summary: Get an AI video task result
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Video task status
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  status:
                    type: string
                    enum: [queued, running, succeeded, failed]
                  output:
                    type: object
                    properties:
                      url:
                        type: string
                      video_url:
                        type: string
                  error:
                    type: string`}
        steps={[
          "In Dify Studio, navigate to Tools > Custom and click \"Create Custom Tool\".",
          "Paste the OpenAPI schema above into the schema editor.",
          "Configure the authentication: select \"API Key\" and set the header to \"Authorization\" with prefix \"Bearer\".",
          "Enter your NextAPI API key and save the tool.",
          "In your Dify app, add both the generateVideo and getVideo tools to the workflow or agent toolset.",
          "First call generateVideo, save the returned id, then call getVideo until status is succeeded.",
          "Only return output.url or output.video_url to the user after the query tool reports success.",
        ]}
        curlTest={`CREATE_RESPONSE=$(curl -sS -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "aerial view of a city at sunset",
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
