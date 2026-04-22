import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { JobDetail } from "@/components/dashboard/job-detail"
import { JobBackLink } from "@/components/dashboard/job-back-link"

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <DashboardShell activeHref="/jobs">
      <div className="border-b border-border/60 px-6 py-4">
        <JobBackLink />
      </div>
      <JobDetail jobId={id} />
    </DashboardShell>
  )
}
