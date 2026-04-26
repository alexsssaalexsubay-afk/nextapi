import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { TemplateGallery } from "@/components/templates/template-gallery"

export default function TemplatesPage() {
  return (
    <DashboardShell activeHref="/templates">
      <TemplateGallery />
    </DashboardShell>
  )
}
