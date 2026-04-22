import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/legal-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("refundTitle"), description: t("refundDescription") };
}

export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <LegalShell title={t("refundTitle")}>
      <h2>1. Prepaid credits</h2>
      <p>
        Prepaid credits are <strong>non-refundable</strong> once consumed and
        do not expire under normal account activity. Unused prepaid balances
        may be refunded under the conditions below.
      </p>

      <h2>2. SLA breach</h2>
      <p>
        If NextAPI materially fails to meet the{" "}
        <a href="/legal/sla">Service Level Agreement</a> for two consecutive
        months, Customer may request a cash refund of prepaid credits consumed
        during the affected period, net of service credits already issued.
        Requests must be submitted within 30 days of the second affected
        month.
      </p>

      <h2>3. Account closure</h2>
      <p>
        On account closure initiated by Customer without cause, Customer may
        request a refund of the <strong>unused prepaid balance</strong> within{" "}
        <strong>30 days</strong> of closure, subject to:
      </p>
      <ul>
        <li>A deduction of non-refundable payment processor fees (typically 3% for cards, 0% for wire).</li>
        <li>A deduction of any discounts that were conditional on the prepaid commit.</li>
        <li>Verification of account identity and payment origin to prevent chargeback fraud.</li>
      </ul>

      <h2>4. Termination for cause</h2>
      <p>
        Accounts terminated by NextAPI for breach of the Acceptable Use Policy
        or applicable law forfeit any unused prepaid balance. Terminations for
        non-payment forfeit the unused balance only to the extent of amounts
        owed; any surplus is refundable on request.
      </p>

      <h2>5. Free credits</h2>
      <p>
        Promotional and signup credits have no cash value and are not
        refundable under any circumstance.
      </p>

      <h2>6. How to request a refund</h2>
      <p>
        Email <a href="mailto:billing@nextapi.top">billing@nextapi.top</a> from
        the account owner address. We respond within 5 business days. Approved
        refunds are paid to the original payment method within 14 business
        days.
      </p>
    </LegalShell>
  );
}
