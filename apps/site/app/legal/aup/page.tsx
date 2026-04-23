export default function AUPPage() {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-500 hover:prose-a:text-indigo-400">
      <h1>Acceptable Use Policy</h1>
      <p className="lead">Last updated: April 2026</p>

      <h2>1. Overview</h2>
      <p>
        This Acceptable Use Policy (&quot;AUP&quot;) governs your use of the NextAPI video generation
        platform. All users, whether on free or enterprise tiers, must comply with this policy.
      </p>

      <h2>2. Prohibited Content</h2>
      <p>You may not use the Service to generate, distribute, or store content that:</p>
      <ul>
        <li>Depicts child sexual abuse material (CSAM) in any form</li>
        <li>Contains non-consensual intimate imagery of real individuals</li>
        <li>Constitutes realistic deepfakes intended to deceive or defame</li>
        <li>Promotes terrorism, extreme violence, or incitement to harm</li>
        <li>Violates intellectual property rights without authorization</li>
        <li>Constitutes spam, phishing, or social engineering attacks</li>
      </ul>

      <h2>3. Configurable Moderation Profiles</h2>
      <p>
        NextAPI supports configurable moderation profiles to match your compliance requirements.
        Enterprise customers can work with their solutions architect to define custom moderation
        rules that align with their industry regulations and internal policies.
      </p>
      <p>Available moderation levels include:</p>
      <ul>
        <li><strong>Strict</strong> — maximum content filtering, suitable for consumer-facing applications</li>
        <li><strong>Standard</strong> — balanced filtering for general business use (default)</li>
        <li><strong>Permissive</strong> — reduced filtering for creative and research applications, with additional compliance requirements</li>
      </ul>
      <p>
        Regardless of moderation level, Section 2 prohibitions are always enforced and cannot be overridden.
      </p>

      <h2>4. Rate Limits &amp; Fair Use</h2>
      <p>
        API rate limits exist to ensure fair access for all customers. Attempting to circumvent
        rate limits, using multiple accounts to bypass quotas, or abusing free-tier resources
        constitutes a violation of this policy.
      </p>

      <h2>5. Security Requirements</h2>
      <ul>
        <li>Keep your API keys confidential and rotate them regularly</li>
        <li>Do not embed API keys in client-side code or public repositories</li>
        <li>Report security vulnerabilities to <a href="mailto:security@nextapi.top">security@nextapi.top</a></li>
        <li>Do not attempt to access other customers&apos; data or accounts</li>
      </ul>

      <h2>6. Enforcement</h2>
      <p>
        Violations may result in immediate API key revocation, account suspension, or termination.
        For borderline cases, we will attempt to contact you before taking action. Repeat or
        severe violations may result in permanent bans without prior notice.
      </p>

      <h2>7. Reporting Violations</h2>
      <p>
        To report AUP violations, contact <a href="mailto:abuse@nextapi.top">abuse@nextapi.top</a>.
        We investigate all reports within 24 hours.
      </p>
    </article>
  )
}
