import { HealthComputation } from "@/lib/types";

type OrgInfo = {
  name?: string;
  edition?: string;
  instanceUrl?: string;
  myDomain?: string;
};

function safe(val: any): string {
  return val === null || val === undefined ? "N/A" : String(val);
}

function remediationForKpi(key: string): string {
  switch (key) {
    case "singleTriggerPerObject":
      return "Consolidate to a single trigger per object using a trigger handler framework; enforce pre/post patterns.";
    case "totalApexClasses":
      return "Rationalize classes; modularize shared libs; delete dead code; align on latest API version.";
    case "codeCoverage":
      return "Target ≥75% with test factories; cover critical paths and negative scenarios; enforce coverage gates in CI.";
    case "apiVersionConsistency":
      return "Upgrade Apex/Flow API versions to be within 2 of current; regression test before release.";
    case "profilesPermSetsRatio":
      return "Reduce profiles; move privileges to Permission Sets; use roles for visibility.";
    case "activeFlowsRatio":
      return "Retire legacy flows; re-implement scattered logic into record-triggered flows with clear entry conditions.";
    case "processBuilders":
      return "Migrate Process Builder and Workflow Rules to Flows per Salesforce guidance.";
    case "triggersPerObject":
      return "Merge multiple triggers; ensure one trigger per object with ordered handlers.";
    case "validationRulesPerObject":
      return "Consolidate overlapping rules; move complex logic to Flows/apex where appropriate.";
    case "workflowRulesActive":
      return "Decommission remaining Workflow Rules; use Flows instead.";
    case "dataStorage":
      return "Archive or externalize historical data; schedule deletions; consider Big Objects.";
    case "fileStorage":
      return "Purge orphaned files; enable retention policies; consider external storage.";
    case "highVolumeObjects":
      return "Design migration in stages (Bulk API 2.0), parent-child order, retry and dead-letter queues.";
    case "objectsWithoutVR":
      return "Define minimal VRs for critical objects; validate statuses and lifecycle fields.";
    case "inactiveUsers":
      return "Deactivate unused users; reclaim licenses; reassign ownership via queue.";
    case "profilesModifyAll":
      return "Enforce least privilege; reduce Modify All/View All Data; audit quarterly.";
    case "guestUsers":
      return "Restrict guest/community permissions; apply sharing sets; remove Modify All.";
    case "inactiveQueues":
      return "Remove or reactivate queues; ensure case/lead routing accuracy.";
    case "sharingRules":
      return "Define sharing rules for key objects; document access model.";
    case "usersWithoutRole":
      return "Assign roles to maintain RLS; avoid role-less users.";
    case "apiCalls24h":
      return "Throttle polling, implement caching, back-off on limits; review integration schedules.";
    case "asyncApexQueue":
      return "Consolidate queueables/batches; stagger schedules; consider Platform Events.";
    case "concurrentBatchJobs":
      return "Cap concurrent batches; chain with schedulables/queueables.";
    case "dataSkewObjects":
      return "Rebalance ownership; enable territory or queue assignment; index selective filters.";
    case "integrationUsers":
      return "Limit to ≤5 integration users; centralize credentials and scopes.";
    default:
      return "Apply standard Salesforce Well-Architected guidance and least-privilege, flow-first patterns.";
  }
}

export function generateHealthAuditMarkdown(health: HealthComputation, org?: OrgInfo): string {
  const lines: string[] = [];

  lines.push(`# Salesforce Org Health Audit Report`);
  lines.push(``);
  lines.push(`**Organization:** ${safe(org?.name)}`);
  lines.push(`**Edition:** ${safe(org?.edition)}`);
  lines.push(`**Instance:** ${safe(org?.instanceUrl || org?.myDomain)}`);
  lines.push(`**Overall Health Score:** ${safe(health?.overallScore)}%`);
  lines.push(``);

  // Methodology
  lines.push(`## Methodology`);
  if (health?.methodology) {
    const m = health.methodology;
    lines.push(`- Weights: Governance ${m.weights.governance}%, Automation ${m.weights.automation}%, Data ${m.weights.data}%, Security ${m.weights.security}%, Limits ${m.weights.limits}%.`);
    lines.push(`- Status→Points: Healthy=${m.statusToPoints.HEALTHY}, Monitor=${m.statusToPoints.MONITOR}, Risk=${m.statusToPoints.RISK}, N/A=${m.statusToPoints.NA}.`);
    lines.push(`- Category score = (sum of KPI points / max possible) × 100; Overall = weighted average of category scores.`);
    lines.push(`- N/A does not penalize; it reduces the category denominator.`);
    if (Array.isArray(m.notes)) {
      m.notes.forEach((n) => lines.push(`- ${n}`));
    }
  } else {
    lines.push(`Computed from metadata, limits, and automation inventories collected during scan.`);
  }
  lines.push(``);

  // Categories table
  for (const cat of health?.categories || []) {
    lines.push(`## ${cat.label}`);
    lines.push(`**Score:** ${safe(cat.score)}%`);
    lines.push(``);
    lines.push(`| KPI | Current Value | Status | Evidence / Notes | Recommended Action |`);
    lines.push(`|-----|---------------|--------|------------------|--------------------|`);
    for (const k of cat.kpis || []) {
      const action = remediationForKpi(k.key);
      lines.push(`| ${k.label} | ${safe(k.value)} | ${k.status || "N/A"} | ${safe(k.detail)} | ${action} |`);
    }
    lines.push(``);
  }

  // Top risks
  lines.push(`## Executive Risk Summary`);
  const risky = (health?.categories || [])
    .flatMap((c) =>
      (c.kpis || [])
        .filter((k) => k.status === "RISK" || k.status === "MONITOR")
        .map((k) => ({ c, k }))
    )
    .slice(0, 10);

  if (risky.length > 0) {
    risky.forEach((rk, i) => {
      lines.push(`${i + 1}. ${rk.k.label} (${rk.c.label}) — current ${safe(rk.k.value)} → ${rk.k.status}.`);
      lines.push(`   Mitigation: ${remediationForKpi(rk.k.key)}`);
    });
  } else {
    lines.push(`No high-priority risks identified.`);
  }

  // Best practices appendix
  lines.push(``);
  lines.push(`## Best-Practice Appendix`);
  lines.push(`| Area | Best Practice |`);
  lines.push(`|------|---------------|`);
  lines.push(`| Governance | Single trigger per object; modular trigger handler; keep API versions current. |`);
  lines.push(`| Automation | Prefer record-triggered Flows; retire Workflow Rules/Process Builders. |`);
  lines.push(`| Data | Keep storage <85%; archive old data; plan HV object migration with Bulk API 2.0. |`);
  lines.push(`| Security | Least privilege; minimize admin profiles; quarterly access reviews. |`);
  lines.push(`| Limits | Monitor API/async usage; implement back-off and scheduling discipline. |`);

  return lines.join("\n");
}

export function generateHealthAuditHTML(health: HealthComputation, org?: OrgInfo): string {
  const escapeHtml = (text: string) => {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HEALTHY":
        return "#10b981"; // green
      case "MONITOR":
        return "#f59e0b"; // amber
      case "RISK":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  let html = `
    <div style="max-width: 900px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h1 style="color: #1e40af; font-size: 32px; margin-bottom: 10px; border-bottom: 3px solid #3b82f6; padding-bottom: 15px;">
        Salesforce Org Health Audit Report
      </h1>
      
      <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-left: 4px solid #3b82f6; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Organization:</strong> ${escapeHtml(safe(org?.name))}</p>
        <p style="margin: 5px 0;"><strong>Edition:</strong> ${escapeHtml(safe(org?.edition))}</p>
        <p style="margin: 5px 0;"><strong>Instance:</strong> ${escapeHtml(safe(org?.instanceUrl || org?.myDomain))}</p>
        <p style="margin: 5px 0;"><strong>Overall Health Score:</strong> <span style="font-size: 24px; font-weight: bold; color: #1e40af;">${safe(health?.overallScore)}%</span></p>
      </div>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        Methodology
      </h2>
      <div style="margin-bottom: 30px;">
  `;

  if (health?.methodology) {
    const m = health.methodology;
    html += `
        <ul style="margin: 15px 0; padding-left: 30px;">
          <li style="margin: 8px 0;">Weights: Governance ${m.weights.governance}%, Automation ${m.weights.automation}%, Data ${m.weights.data}%, Security ${m.weights.security}%, Limits ${m.weights.limits}%.</li>
          <li style="margin: 8px 0;">Status→Points: Healthy=${m.statusToPoints.HEALTHY}, Monitor=${m.statusToPoints.MONITOR}, Risk=${m.statusToPoints.RISK}, N/A=${m.statusToPoints.NA}.</li>
          <li style="margin: 8px 0;">Category score = (sum of KPI points / max possible) × 100; Overall = weighted average of category scores.</li>
          <li style="margin: 8px 0;">N/A does not penalize; it reduces the category denominator.</li>
    `;
    if (Array.isArray(m.notes)) {
      m.notes.forEach((n) => {
        html += `<li style="margin: 8px 0;">${escapeHtml(n)}</li>`;
      });
    }
    html += `</ul>`;
  } else {
    html += `<p>Computed from metadata, limits, and automation inventories collected during scan.</p>`;
  }

  html += `</div>`;

  // Categories
  for (const cat of health?.categories || []) {
    html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 15px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        ${escapeHtml(cat.label)}
      </h2>
      <p style="margin-bottom: 15px; font-size: 18px;"><strong>Score:</strong> <span style="color: #1e40af; font-weight: bold;">${safe(cat.score)}%</span></p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">KPI</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Current Value</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Status</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Evidence / Notes</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Recommended Action</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const k of cat.kpis || []) {
      const action = remediationForKpi(k.key);
      const statusColor = getStatusColor(k.status || "NA");
      html += `
          <tr style="background-color: ${(cat.kpis || []).indexOf(k) % 2 === 0 ? "#ffffff" : "#f9fafb"};">
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(k.label)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(k.value))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;"><span style="color: ${statusColor}; font-weight: 600;">${escapeHtml(k.status || "N/A")}</span></td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(k.detail))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(action)}</td>
          </tr>
      `;
    }

    html += `
        </tbody>
      </table>
    `;
  }

  // Executive Risk Summary
  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        Executive Risk Summary
      </h2>
      <div style="margin-bottom: 30px;">
  `;

  const risky = (health?.categories || [])
    .flatMap((c) =>
      (c.kpis || [])
        .filter((k) => k.status === "RISK" || k.status === "MONITOR")
        .map((k) => ({ c, k }))
    )
    .slice(0, 10);

  if (risky.length > 0) {
    html += `<ol style="margin: 15px 0; padding-left: 30px;">`;
    risky.forEach((rk, i) => {
      html += `
        <li style="margin: 12px 0; line-height: 1.8;">
          <strong>${escapeHtml(rk.k.label)}</strong> (${escapeHtml(rk.c.label)}) — current ${escapeHtml(safe(rk.k.value))} → <span style="color: ${getStatusColor(rk.k.status || "NA")};">${escapeHtml(rk.k.status || "N/A")}</span>.
          <br><span style="color: #6b7280; margin-left: 20px;">Mitigation: ${escapeHtml(remediationForKpi(rk.k.key))}</span>
        </li>
      `;
    });
    html += `</ol>`;
  } else {
    html += `<p style="color: #10b981; font-weight: 600;">No high-priority risks identified.</p>`;
  }

  html += `</div>`;

  // Best practices appendix
  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        Best-Practice Appendix
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Area</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Best Practice</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background-color: #ffffff;">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: 600;">Governance</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Single trigger per object; modular trigger handler; keep API versions current.</td>
          </tr>
          <tr style="background-color: #f9fafb;">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: 600;">Automation</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Prefer record-triggered Flows; retire Workflow Rules/Process Builders.</td>
          </tr>
          <tr style="background-color: #ffffff;">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: 600;">Data</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Keep storage <85%; archive old data; plan HV object migration with Bulk API 2.0.</td>
          </tr>
          <tr style="background-color: #f9fafb;">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: 600;">Security</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Least privilege; minimize admin profiles; quarterly access reviews.</td>
          </tr>
          <tr style="background-color: #ffffff;">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-weight: 600;">Limits</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Monitor API/async usage; implement back-off and scheduling discipline.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  return html;
}

