import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function LangChainIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="LangChain"
        intro="Use NextAPI as a custom tool in your LangChain agents. Wrap our REST API as a StructuredTool so any LangChain agent can generate videos as part of its execution chain."
        configLang="python"
        configSnippet={`import os
import requests
import time
from langchain.tools import StructuredTool
from pydantic import BaseModel, Field

class VideoGenInput(BaseModel):
    prompt: str = Field(description="Text description of the video to generate")
    duration_seconds: int = Field(default=6, description="Video duration in seconds")
    resolution: str = Field(default="1080p", description="Output resolution")

def generate_video(prompt: str, duration_seconds: int = 6, resolution: str = "1080p") -> str:
    create_resp = requests.post(
        "https://api.nextapi.top/v1/videos",
        headers={
            "Authorization": f"Bearer {os.environ['NEXTAPI_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": "seedance-2.0-pro",
            "input": {
                "prompt": prompt,
                "duration_seconds": duration_seconds,
                "resolution": resolution,
            },
        },
    )
    create_resp.raise_for_status()
    video_id = create_resp.json()["id"]

    for _ in range(60):
        status_resp = requests.get(
            f"https://api.nextapi.top/v1/videos/{video_id}",
            headers={"Authorization": f"Bearer {os.environ['NEXTAPI_KEY']}"},
        )
        status_resp.raise_for_status()
        payload = status_resp.json()
        if payload["status"] == "succeeded":
            output = payload.get("output") or {}
            return output.get("url") or output.get("video_url") or video_id
        if payload["status"] == "failed":
            raise RuntimeError("NextAPI video generation failed")
        time.sleep(5)

    raise TimeoutError("NextAPI video generation did not finish within 5 minutes")

nextapi_tool = StructuredTool.from_function(
    func=generate_video,
    name="nextapi_video_gen",
    description="Generate an AI video from a text prompt using NextAPI",
    args_schema=VideoGenInput,
)`}
        steps={[
          "Install dependencies: pip install langchain requests pydantic",
          "Set your API key: export NEXTAPI_KEY=your-key-here",
          "Define the VideoGenInput schema and generate_video function as shown above.",
          "Create a StructuredTool wrapping the function.",
          "Add the tool to your LangChain agent's tool list.",
          "The tool creates the async task, polls by id, and returns a URL only after the task succeeds.",
        ]}
        curlTest={`CREATE_RESPONSE=$(curl -sS -X POST https://api.nextapi.top/v1/videos \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "input": {
      "prompt": "a butterfly landing on a flower in slow motion",
      "duration_seconds": 6,
      "resolution": "1080p"
    }
  }')

VIDEO_ID=$(printf '%s' "$CREATE_RESPONSE" | jq -r '.id')

curl -sS "https://api.nextapi.top/v1/videos/$VIDEO_ID" \\
  -H "Authorization: Bearer $NEXTAPI_KEY"`}
        footerNote={
          <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-700 dark:border-amber-400/40 dark:text-amber-300">
            Keep <code className="font-mono">NEXTAPI_KEY</code> in server-side or local environment variables, not in shared notebooks. For strict setup details, see the{" "}
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
