export default function SLAPage() {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-500 hover:prose-a:text-indigo-400">
      <h1>Service Level Agreement</h1>
      <p className="lead">Last updated: April 2026</p>

      <h2>1. Scope</h2>
      <p>
        This SLA applies to the NextAPI video generation API (&quot;Service&quot;) and covers
        availability, latency, and support response commitments for Enterprise-tier customers.
      </p>

      <h2>2. Availability</h2>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Monthly Uptime Target</th>
            <th>Guarantee</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Free / Builder</td>
            <td>99.0%</td>
            <td>Best-effort (no credits)</td>
          </tr>
          <tr>
            <td>Scale</td>
            <td>99.9%</td>
            <td>Service credits on breach</td>
          </tr>
          <tr>
            <td>Enterprise</td>
            <td>99.95%</td>
            <td>Service credits on breach</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Uptime</strong> is calculated as the percentage of 5-minute intervals in a calendar
        month during which the API returns non-5xx responses to valid, authenticated requests.
      </p>

      <h2>3. Latency Targets</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Scale Tier</th>
            <th>Enterprise Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>API response (P50)</td>
            <td>&lt; 200ms</td>
            <td>&lt; 100ms</td>
          </tr>
          <tr>
            <td>API response (P95)</td>
            <td>&lt; 500ms</td>
            <td>&lt; 250ms</td>
          </tr>
          <tr>
            <td>Video generation queue wait</td>
            <td>&lt; 60s</td>
            <td>&lt; 15s (dedicated lane)</td>
          </tr>
          <tr>
            <td>Webhook delivery (P95)</td>
            <td>&lt; 30s</td>
            <td>&lt; 10s</td>
          </tr>
        </tbody>
      </table>

      <h2>4. Service Credits</h2>
      <table>
        <thead>
          <tr>
            <th>Monthly Uptime</th>
            <th>Credit Percentage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>&lt; 99.95% but &ge; 99.0%</td>
            <td>10% of monthly bill</td>
          </tr>
          <tr>
            <td>&lt; 99.0% but &ge; 95.0%</td>
            <td>25% of monthly bill</td>
          </tr>
          <tr>
            <td>&lt; 95.0%</td>
            <td>50% of monthly bill</td>
          </tr>
        </tbody>
      </table>
      <p>
        Service credits must be requested within 30 days of the incident. Credits are applied
        to future invoices and are not redeemable for cash.
      </p>

      <h2>5. Support Response Times</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Description</th>
            <th>Scale Tier</th>
            <th>Enterprise Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>P1 — Critical</td>
            <td>Service outage affecting production</td>
            <td>4 hours</td>
            <td>30 minutes</td>
          </tr>
          <tr>
            <td>P2 — High</td>
            <td>Degraded performance or partial outage</td>
            <td>8 hours</td>
            <td>2 hours</td>
          </tr>
          <tr>
            <td>P3 — Normal</td>
            <td>Non-urgent issues or questions</td>
            <td>24 hours</td>
            <td>8 hours</td>
          </tr>
        </tbody>
      </table>

      <h2>6. Exclusions</h2>
      <p>This SLA does not apply to:</p>
      <ul>
        <li>Scheduled maintenance windows (announced 48 hours in advance)</li>
        <li>Force majeure events</li>
        <li>Issues caused by customer code, configuration, or third-party integrations</li>
        <li>Free-tier accounts</li>
      </ul>

      <h2>7. Contact</h2>
      <p>
        For SLA inquiries or credit requests, contact{" "}
        <a href="mailto:support@nextapi.dev">support@nextapi.dev</a>.
      </p>
    </article>
  )
}
