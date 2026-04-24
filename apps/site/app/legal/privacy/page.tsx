export default function PrivacyPage() {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-500 hover:prose-a:text-indigo-400">
      <h1>Privacy Policy</h1>
      <p className="lead">Last updated: April 2026</p>

      <h2>1. Information We Collect</h2>
      <h3>Account Data</h3>
      <p>
        When you create an account, we collect your name, email address, and organization name
        through our authentication provider (Clerk). We do not store passwords directly.
      </p>
      <h3>Usage Data</h3>
      <p>
        We collect API request metadata including timestamps, endpoints called, response codes,
        latency, and credit consumption. This data is used for billing, debugging, and service improvement.
      </p>
      <h3>Content Data</h3>
      <p>
        Prompt text and reference images submitted via the API are processed through our video
        generation infrastructure. Generated videos are stored temporarily in our CDN
        for delivery and deleted after the retention period configured in your account (default: 7 days).
      </p>

      <h2>2. How We Use Your Data</h2>
      <ul>
        <li>To provide, maintain, and improve the Service</li>
        <li>To process billing and enforce spend limits</li>
        <li>To detect and prevent fraud, abuse, and security incidents</li>
        <li>To communicate important service updates</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>3. Data Sharing</h2>
      <p>We do not sell your personal data. We share data only with:</p>
      <ul>
        <li><strong>Model inference</strong> — prompt text and reference images you submit for video generation</li>
        <li><strong>Authentication (Clerk)</strong> — identity verification and session management</li>
        <li><strong>Infrastructure (Cloudflare, Aliyun)</strong> — hosting, CDN, and DDoS protection</li>
        <li><strong>Payment Processing</strong> — billing and invoice management</li>
      </ul>

      <h2>4. Data Security</h2>
      <p>
        All API communication is encrypted via TLS 1.3. API keys are hashed with Argon2id before
        storage. Webhook payloads are signed with HMAC-SHA256. We enforce rate limiting and IP
        allowlists for additional protection.
      </p>

      <h2>5. Data Retention</h2>
      <ul>
        <li>Account data: retained while your account is active, deleted within 30 days of account closure</li>
        <li>API logs: retained for 90 days for debugging and compliance</li>
        <li>Generated videos: retained per your account settings (default 7 days)</li>
        <li>Billing records: retained for 7 years per tax and legal requirements</li>
      </ul>

      <h2>6. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate data</li>
        <li>Delete your data</li>
        <li>Export your data in a portable format</li>
        <li>Object to processing</li>
      </ul>
      <p>To exercise these rights, contact <a href="mailto:privacy@nextapi.top">privacy@nextapi.top</a>.</p>

      <h2>7. Cookies</h2>
      <p>
        We use essential cookies for authentication and session management. We use PostHog
        for product analytics with anonymized data. You can disable analytics cookies in your
        browser settings.
      </p>

      <h2>8. Contact</h2>
      <p>
        For privacy-related questions, contact us at{" "}
        <a href="mailto:privacy@nextapi.top">privacy@nextapi.top</a>.
      </p>
    </article>
  )
}
