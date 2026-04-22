export default function TermsPage() {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-500 hover:prose-a:text-indigo-400">
      <h1>Terms of Service</h1>
      <p className="lead">Last updated: April 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using the NextAPI platform (&quot;Service&quot;), you agree to be bound by these
        Terms of Service (&quot;Terms&quot;). If you are entering into these Terms on behalf of a company or
        other legal entity, you represent that you have the authority to bind such entity.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        NextAPI provides an API gateway for AI video generation powered by Seedance models.
        The Service includes API access, dashboard tools, webhook delivery, billing management,
        and related developer infrastructure.
      </p>

      <h2>3. Account &amp; API Keys</h2>
      <p>
        You are responsible for safeguarding your API keys and all activity under your account.
        You must not share API keys or allow unauthorized access. Compromised keys should be
        revoked immediately via the dashboard.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>
        Your use of the Service must comply with our <a href="/legal/aup">Acceptable Use Policy</a>.
        We reserve the right to suspend accounts that violate these policies.
      </p>

      <h2>5. Billing &amp; Payments</h2>
      <p>
        Usage is metered per API call. Credits are non-refundable except as required by law.
        Spend limits, if configured, are enforced on a best-effort basis with eventual consistency.
        You are responsible for monitoring your usage through the dashboard.
      </p>

      <h2>6. Service Level Agreement</h2>
      <p>
        Enterprise customers receive SLA guarantees as specified in their enterprise agreement.
        Standard-tier availability targets are described in our <a href="/legal/sla">SLA</a> page
        but are not contractually guaranteed for free-tier accounts.
      </p>

      <h2>7. Intellectual Property</h2>
      <p>
        You retain all rights to content you submit through the API. Videos generated through
        the Service are owned by you, subject to the upstream model provider&apos;s terms.
        NextAPI retains no ownership of your generated content.
      </p>

      <h2>8. Data &amp; Privacy</h2>
      <p>
        We process data as described in our <a href="/legal/privacy">Privacy Policy</a>.
        Prompt text and generated videos are processed in transit and not stored beyond
        the retention period specified in your account settings.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, NextAPI shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, including loss of profits,
        data, or goodwill, arising from your use of the Service.
      </p>

      <h2>10. Termination</h2>
      <p>
        Either party may terminate this agreement at any time. Upon termination, your API keys
        will be revoked and access to the Service will cease. Any outstanding balance remains payable.
      </p>

      <h2>11. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be notified via email
        or dashboard notification at least 30 days before taking effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        For questions about these Terms, contact us at{" "}
        <a href="mailto:legal@nextapi.dev">legal@nextapi.dev</a>.
      </p>
    </article>
  )
}
