import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security",
  description: "Enterprise-grade security: TLS 1.3, Argon2id key hashing, HMAC-SHA256 webhooks, and configurable moderation.",
  openGraph: {
    title: "Security | NextAPI",
    description: "Enterprise-grade security for your video generation data.",
    images: [{ url: "/og/security.png", width: 1200, height: 630 }],
  },
}

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return children
}
