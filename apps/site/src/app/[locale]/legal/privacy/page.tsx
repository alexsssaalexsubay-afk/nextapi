import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/legal-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("privacyTitle"), description: t("privacyDescription") };
}

export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <LegalShell title={t("privacyTitle")}>
      <p>
        This Privacy Policy explains what data NextAPI HK Ltd.
        (&quot;Company&quot;, &quot;we&quot;) collects, how we use it, and who
        we share it with. This policy applies to the NextAPI gateway
        (&quot;Service&quot;) operated from the Hong Kong Special Administrative
        Region.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data.</strong> Email, name, company, billing details,
          tax ID, and authentication metadata.
        </li>
        <li>
          <strong>API traffic.</strong> Request metadata (timestamps, model,
          parameters), prompt text, input images, and generated outputs.
        </li>
        <li>
          <strong>Operational logs.</strong> IP address, user agent, request
          IDs, error codes, and performance metrics.
        </li>
        <li>
          <strong>Billing records.</strong> Invoices, payment processor
          references, and usage summaries.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To operate the Service, route requests to licensed providers, and return results.</li>
        <li>To bill, invoice, and prevent fraud.</li>
        <li>To run trust-and-safety classifiers against inputs and outputs.</li>
        <li>To investigate incidents and comply with legal obligations.</li>
        <li>We do not sell personal data and do not use customer prompts or outputs to train models.</li>
      </ul>

      <h2>3. Retention</h2>
      <ul>
        <li>
          <strong>Generated videos:</strong> stored in Cloudflare R2 for{" "}
          <strong>30 days</strong> by default, then automatically deleted.
          Enterprise plans may configure shorter retention or bring-their-own R2 bucket.
        </li>
        <li><strong>Request metadata and logs:</strong> 90 days.</li>
        <li><strong>Billing records:</strong> 7 years to meet tax and audit requirements.</li>
      </ul>

      <h2>4. Storage and transfers</h2>
      <p>
        Primary data processing occurs on Aliyun Hong Kong. Generated media is
        stored on Cloudflare R2. Data may be transferred internationally to
        subprocessors listed below under appropriate contractual safeguards.
      </p>

      <h2>5. Subprocessors</h2>
      <ul>
        <li><strong>ByteDance Volcengine</strong> — model inference (Seedance).</li>
        <li><strong>Cloudflare, Inc.</strong> — R2 object storage and CDN.</li>
        <li><strong>Aliyun (HK)</strong> — compute and database hosting.</li>
        <li><strong>Stripe, Inc.</strong> — card payment processing.</li>
        <li><strong>Clerk, Inc.</strong> — authentication.</li>
      </ul>
      <p>
        We provide 30 days&rsquo; notice of material changes to this list to
        Enterprise customers.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Subject to applicable law (including the GDPR and UK GDPR where
        relevant), you may request access, correction, deletion, portability,
        or restriction of your personal data. Contact us at{" "}
        <a href="mailto:privacy@nextapi.top">privacy@nextapi.top</a>. We respond
        within 30 days.
      </p>

      <h2>7. GDPR contact</h2>
      <p>
        Data protection inquiries from EU/UK residents:{" "}
        <a href="mailto:privacy@nextapi.top">privacy@nextapi.top</a>. You also
        have the right to lodge a complaint with your local supervisory
        authority.
      </p>

      <h2>8. Security</h2>
      <p>
        Data is encrypted in transit (TLS 1.2+) and at rest. API keys are
        stored as salted hashes. Access to production systems is restricted and
        audited.
      </p>

      <h2>9. Changes</h2>
      <p>
        Material changes will be announced at least 30 days in advance via
        email or dashboard notice.
      </p>
    </LegalShell>
  );
}
