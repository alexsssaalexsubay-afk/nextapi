import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent, usage-based pricing for AI video generation. Start free, scale to enterprise.",
  openGraph: {
    title: "Pricing | NextAPI",
    description: "Transparent, usage-based pricing for AI video generation.",
    images: [{ url: "/og/pricing.png", width: 1200, height: 630 }],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
