import { SiteNav } from "@/components/marketing/site-nav"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"
import { IntegrationDoc } from "@/components/marketing/integration-doc"

export default function CursorIntegrationPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <IntegrationDoc
        name="Cursor"
        intro="Use NextAPI as a video generation tool inside Cursor IDE agent workflows. Your AI coding assistant can programmatically generate videos through the NextAPI REST endpoint."
        configLang="json"
        configSnippet={`// .cursor/mcp.json
{
  "mcpServers": {
    "nextapi": {
      "command": "npx",
      "args": ["-y", "@nextapi/mcp-server"],
      "env": {
        "NEXTAPI_BASE_URL": "https://api.nextapi.top",
        "NEXTAPI_API_KEY": "your-api-key-here"
      }
    }
  }
}`}
        steps={[
          "Sign up at dash.nextapi.top and create an API key.",
          "Add the MCP server configuration to your .cursor/mcp.json file.",
          "Restart Cursor to load the new MCP server.",
          "Ask your agent to generate a video — it will use the NextAPI tool automatically.",
          "The generated video URL will be returned in the agent's response.",
        ]}
        curlTest={`curl -X POST https://api.nextapi.top/v1/video/generations \\
  -H "Authorization: Bearer $NEXTAPI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.0-pro",
    "prompt": "a gentle wave rolling onto a sandy beach",
    "duration_seconds": 6,
    "resolution": "1080p"
  }'`}
      />
      <LandingFooter />
    </div>
  )
}
