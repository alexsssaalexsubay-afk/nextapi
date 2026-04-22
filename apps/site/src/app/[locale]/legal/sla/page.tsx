import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalShell } from "@/components/legal-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("slaTitle"), description: t("slaDescription") };
}

export default async function Page() {
  const t = await getTranslations("legal");
  return (
    <LegalShell title={t("slaTitle")}>
      <p>
        This Service Level Agreement (&quot;SLA&quot;) applies to Scale and
        Enterprise plans of the NextAPI Service. The SLA is the exclusive
        remedy for availability failures.
      </p>

      <h2>1. Uptime commitment</h2>
      <p>
        NextAPI commits to <strong>99.9% monthly uptime</strong> measured as
        successful responses from <code>/v1/video/generations</code> and{" "}
        <code>/v1/jobs/:id</code> endpoints, excluding failures attributable to
        Customer, Customer&rsquo;s content, upstream provider outages where
        Customer has not elected multi-provider routing, or Scheduled
        Maintenance.
      </p>

      <h2>2. Credit rebate schedule</h2>
      <p>
        If monthly uptime falls below the committed level, Customer is entitled
        to a service credit against the following month&rsquo;s invoice:
      </p>
      <ul>
        <li><strong>Less than 99.9% but ≥ 99.0%:</strong> 10% credit.</li>
        <li><strong>Less than 99.0% but ≥ 95.0%:</strong> 25% credit.</li>
        <li><strong>Less than 95.0%:</strong> 50% credit.</li>
      </ul>
      <p>
        Credits are computed against the monthly commit fee, excluding
        consumption above the commit. Credits must be claimed within 30 days of
        the incident.
      </p>

      <h2>3. Scheduled maintenance</h2>
      <p>
        Planned maintenance windows are Saturday 18:00–22:00 UTC. We aim for
        zero-downtime deploys; announced downtime is communicated at least 72
        hours in advance via the status page and email.
      </p>

      <h2>4. Incident response times</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Growth</th>
            <th>Scale</th>
            <th>Enterprise</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Sev 1 (service down)</td><td>4h</td><td>1h</td><td>15m</td></tr>
          <tr><td>Sev 2 (major degradation)</td><td>8h</td><td>4h</td><td>1h</td></tr>
          <tr><td>Sev 3 (minor issue)</td><td>next business day</td><td>8h</td><td>4h</td></tr>
        </tbody>
      </table>

      <h2>5. Status page and incident reports</h2>
      <p>
        Live status:{" "}
        <a href="https://status.nextapi.top">status.nextapi.top</a>. Post-mortems
        for Sev 1 and Sev 2 incidents are published within 7 business days.
      </p>

      <h2>6. Exclusions</h2>
      <ul>
        <li>Force majeure events (natural disasters, war, government action).</li>
        <li>Customer-initiated rate limits and trust-and-safety blocks.</li>
        <li>Failures caused by Customer code, DNS misconfiguration, or third-party integrations.</li>
      </ul>
    </LegalShell>
  );
}
