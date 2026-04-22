import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Status",
  description: "Real-time system health monitoring for NextAPI services.",
  openGraph: {
    title: "Status | NextAPI",
    description: "Real-time system health monitoring.",
    images: [{ url: "/og/status.png", width: 1200, height: 630 }],
  },
}

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children
}
