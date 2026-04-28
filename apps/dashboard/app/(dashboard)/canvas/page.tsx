import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { CanvasWorkspace } from "@/components/canvas/canvas-workspace"

export default function CanvasPage() {
  return (
    <DashboardShell activeHref="/canvas" workspace>
      <CanvasWorkspace />
    </DashboardShell>
  )
}
