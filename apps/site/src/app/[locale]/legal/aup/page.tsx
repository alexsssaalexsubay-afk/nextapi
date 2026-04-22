import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/legal-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("aupTitle"), description: t("aupDescription") };
}

export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <LegalShell title={t("aupTitle")}>
      <p>
        NextAPI is a B2B video generation gateway. This Acceptable Use Policy
        defines the content and behavior that is not permitted on the service.
        Violation may result in suspension, termination, and forfeiture of
        prepaid credits net of fees.
      </p>

      <h2>1. Prohibited content</h2>
      <ul>
        <li>
          <strong>Sexual content involving minors.</strong> Absolute prohibition.
          Accounts will be terminated immediately and reported to relevant
          authorities including NCMEC where applicable.
        </li>
        <li>
          <strong>Non-consensual intimate imagery.</strong> Including synthetic
          sexual imagery of any real person without their verifiable consent.
        </li>
        <li>
          <strong>NSFW / adult content.</strong> Explicit sexual output is
          disallowed on the standard tier. Adult-platform customers must
          complete a separate trust-and-safety review before enablement.
        </li>
        <li>
          <strong>Public figures and private individuals.</strong> No
          impersonation, defamation, or sexualization of identifiable people,
          including politicians, celebrities, and private persons, without
          documented authorization.
        </li>
        <li>
          <strong>Violence, gore, and self-harm promotion.</strong> Realistic
          depiction intended to promote, glorify, or instruct harm is
          prohibited.
        </li>
        <li>
          <strong>Illegal content.</strong> Content that is illegal in Hong Kong
          or in the jurisdiction of the end user, including CSAM, terrorist
          propaganda, and content that infringes third-party intellectual
          property.
        </li>
        <li>
          <strong>Election and civic manipulation.</strong> Deceptive synthetic
          media targeting elections, officials, or public-health topics.
        </li>
      </ul>

      <h2>2. Prohibited behavior</h2>
      <ul>
        <li>Reselling raw API access under a different brand without a written reseller agreement.</li>
        <li>Circumventing rate limits, throughput ceilings, or safety classifiers.</li>
        <li>Using the service to generate training data for a competing video generation model.</li>
        <li>Sharing API keys across legal entities.</li>
      </ul>

      <h2>3. Trust &amp; safety controls</h2>
      <p>
        All generations are scanned against provider-side and NextAPI-side
        classifiers. Trust &amp; safety thresholds are <em>configurable</em>{" "}
        within contracted limits for vetted B2B customers — we do not market a
        &quot;no filter&quot; product.
      </p>

      <h2>4. Reporting abuse</h2>
      <p>
        Report suspected violations to{" "}
        <a href="mailto:abuse@nextapi.top">abuse@nextapi.top</a>. We respond to
        verified reports within one business day.
      </p>

      <h2>5. Enforcement</h2>
      <p>
        We may suspend an account pending investigation. Confirmed violations
        result in termination. CSAM is reported to authorities and we cooperate
        with lawful requests from law enforcement.
      </p>
    </LegalShell>
  );
}
