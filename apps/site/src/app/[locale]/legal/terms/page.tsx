import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/legal-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("termsTitle"), description: t("termsDescription") };
}

export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <LegalShell title={t("termsTitle")}>
      <h2>1. Service description</h2>
      <p>
        NextAPI (&quot;Service&quot;) is a B2B API gateway operated by NextAPI
        HK Ltd. (&quot;Company&quot;) that provides programmatic access to
        licensed video generation models, including ByteDance Volcengine
        Seedance. The Service is offered as infrastructure; Company does not
        generate, review, or endorse customer content.
      </p>

      <h2>2. Account and API keys</h2>
      <p>
        Customer must register an account, provide accurate business
        information, and keep API credentials confidential. Customer is
        responsible for all activity performed under its account and keys.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        Use of the Service is governed by the{" "}
        <a href="/legal/aup">Acceptable Use Policy</a>, incorporated by
        reference. Breach of the AUP constitutes a material breach of these
        Terms.
      </p>

      <h2>4. Payment and credits</h2>
      <ul>
        <li>The Service uses a prepaid credit model. Credits are non-refundable except as set out in the <a href="/legal/refund">Refund Policy</a>.</li>
        <li>Prices are quoted in USD excluding taxes. Customer is responsible for applicable VAT, GST, and withholding taxes.</li>
        <li>Committed plans auto-renew monthly or annually; cancellation requires 30 days&rsquo; written notice.</li>
      </ul>

      <h2>5. Service levels</h2>
      <p>
        Scale and Enterprise plans are covered by the{" "}
        <a href="/legal/sla">Service Level Agreement</a>. Credit rebates under
        the SLA are the exclusive remedy for availability failures.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        As between the parties, Customer owns its input prompts and retains
        such rights as applicable law grants in outputs. Company retains all
        rights in the Service, documentation, and infrastructure. Customer
        grants Company a limited license to process inputs and outputs solely
        to operate the Service.
      </p>

      <h2>7. Confidentiality and data</h2>
      <p>
        Each party will protect the other&rsquo;s confidential information with
        reasonable care. Data handling is further described in the{" "}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h2>8. Warranties and disclaimers</h2>
      <p>
        The Service is provided on an &quot;as is&quot; and &quot;as
        available&quot; basis. To the maximum extent permitted by law, Company
        disclaims all implied warranties including merchantability, fitness for
        a particular purpose, and non-infringement. Generated outputs are
        probabilistic and may be inaccurate; Customer is responsible for
        evaluating suitability before use.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, each party&rsquo;s aggregate
        liability under these Terms is capped at the fees paid by Customer to
        Company in the twelve (12) months preceding the claim. Neither party is
        liable for indirect, incidental, special, or consequential damages.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        Customer will defend and indemnify Company against claims arising from
        Customer&rsquo;s content, Customer&rsquo;s breach of the AUP, or
        Customer&rsquo;s violation of applicable law.
      </p>

      <h2>11. Termination</h2>
      <p>
        Either party may terminate for material breach not cured within 30 days
        of written notice. Company may suspend immediately for AUP violations,
        payment failure, or security risk. Unused prepaid balances are handled
        under the Refund Policy.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the Hong Kong Special
        Administrative Region. Disputes are subject to the exclusive
        jurisdiction of the Hong Kong courts, without prejudice to either
        party&rsquo;s right to seek injunctive relief in any competent
        jurisdiction.
      </p>

      <h2>13. Contact</h2>
      <p>
        Legal notices: <a href="mailto:legal@nextapi.top">legal@nextapi.top</a>.
      </p>
    </LegalShell>
  );
}
