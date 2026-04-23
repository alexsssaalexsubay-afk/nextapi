import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function ComfyUIIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="ComfyUI"
        intro="Integrate NextAPI video generation into your ComfyUI node-based workflows. Use our custom node or the generic HTTP request node to add Seedance video generation to any pipeline."
        configLang="python"
        configSnippet={`# ComfyUI Custom Node: NextAPI Video Generate
# Place in ComfyUI/custom_nodes/nextapi_node.py

import os
import requests

class NextAPIVideoGenerate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True}),
                "duration_seconds": ("INT", {"default": 6, "min": 1, "max": 30}),
                "resolution": (["720p", "1080p", "4k"],),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("video_url",)
    FUNCTION = "generate"
    CATEGORY = "NextAPI"

    def generate(self, prompt, duration_seconds, resolution):
        resp = requests.post(
            "https://api.nextapi.top/v1/video/generations",
            headers={
                "Authorization": f"Bearer {os.environ.get('NEXTAPI_KEY', '')}",
                "Content-Type": "application/json",
            },
            json={
                "model": "seedance-2.0-pro",
                "prompt": prompt,
                "duration_seconds": duration_seconds,
                "resolution": resolution,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return (data.get("url", ""),)

NODE_CLASS_MAPPINGS = {"NextAPIVideoGenerate": NextAPIVideoGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"NextAPIVideoGenerate": "NextAPI Video Generate"}`}
        steps={[
          "Copy the custom node file to ComfyUI/custom_nodes/nextapi_node.py.",
          "Set your API key as an environment variable: export NEXTAPI_KEY=your-key-here",
          "Restart ComfyUI to load the new node.",
          "Find \"NextAPI Video Generate\" in the node browser under the \"NextAPI\" category.",
          "Connect a text input to the prompt field and wire the video_url output to your pipeline.",
          "Execute the workflow — the node will call NextAPI and return the generated video URL.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/video/generations \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "prompt": "ink spreading through water in slow motion",
    "duration_seconds": 6,
    "resolution": "1080p"
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
