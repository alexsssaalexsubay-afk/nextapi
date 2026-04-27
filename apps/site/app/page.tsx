import { SiteNav } from "@/components/marketing/site-nav"
import { LandingHero } from "@/components/marketing/landing/landing-hero"
import { IntegrationsStrip } from "@/components/marketing/landing/integrations-strip"
import { HowItWorks } from "@/components/marketing/how-it-works"
import { TrustRail } from "@/components/marketing/trust-rail"
import { FeaturesGrid } from "@/components/marketing/landing/features-grid"
import { GalleryStrip } from "@/components/marketing/landing/gallery-strip"
import { DevexSection } from "@/components/marketing/landing/devex-section"
import { CtaBanner } from "@/components/marketing/landing/cta-banner"
import { LandingFooter } from "@/components/marketing/landing/landing-footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <SiteNav />
      <main>
        <LandingHero />
        <IntegrationsStrip />
        <HowItWorks />
        <TrustRail />
        <FeaturesGrid />
        <GalleryStrip />
        <DevexSection />
        <CtaBanner />
      </main>
      <LandingFooter />
    </div>
  )
}
