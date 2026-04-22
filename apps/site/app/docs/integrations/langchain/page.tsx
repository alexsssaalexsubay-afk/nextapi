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
from langchain.tools import StructuredTool
from pydantic import BaseModel, Field

class VideoGenInput(BaseModel):
    prompt: str = Field(description="Text description of the video to generate")
    duration: int = Field(default=6, description="Video duration in seconds")
    resolution: str = Field(default="1080p", description="Output resolution")

def generate_video(prompt: str, duration: int = 6, resolution: str = "1080p") -> str:
    resp = requests.post(
        "https://api.nextapi.top/v1/videos/generate",
        headers={
            "Authorization": f"Bearer {os.environ['NEXTAPI_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": "seedance-2.0-pro",
            "prompt": prompt,
            "duration": duration,
            "resolution": resolution,
        },
    )
    resp.raise_for_status()
    return resp.json()

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
          "The agent will call NextAPI when it decides video generation is needed.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/videos/generate \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "prompt": "a butterfly landing on a flower in slow motion",
    "duration": 6,
    "resolution": "1080p"
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
