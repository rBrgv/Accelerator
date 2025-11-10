import { ScanOutput } from "@/lib/types";
import { migrationPrerequisites } from "@/server/composeScan";

export function generateMetadataReportMarkdown(scan: ScanOutput): string {
  const org = scan.source.organization || {};
  const date = new Date().toISOString().split('T')[0];
  
  let md = `# Salesforce Org Migration - Metadata Insights Report\n\n`;
  md += `**Generated:** ${date}\n`;
  md += `**Org:** ${scan.source.instanceUrl}\n`;
  md += `**Edition:** ${scan.source.edition || "Unknown"}\n`;
  md += `**API Version:** ${scan.source.apiVersion}\n`;
  md += `**Scan ID:** ${scan.scanId || "N/A"}\n\n`;
  md += `---\n\n`;

  // Executive Summary
  md += `## Executive Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Objects | ${scan.summary.objects} |\n`;
  md += `| Custom Objects | ${scan.inventory.sourceObjects.filter(o => o.isCustom).length} |\n`;
  md += `| Standard Objects | ${scan.inventory.sourceObjects.filter(o => !o.isCustom).length} |\n`;
  md += `| Total Records | ${scan.summary.recordsApprox.toLocaleString()} |\n`;
  md += `| Active Flows | ${scan.inventory.automation.flows.filter(f => f.status === "Active").length} |\n`;
  md += `| Total Flows | ${scan.summary.flows} |\n`;
  md += `| Apex Triggers | ${scan.summary.triggers} |\n`;
  md += `| Validation Rules | ${scan.summary.vrs} |\n`;
  md += `| Apex Classes | ${scan.inventory.code.apexClasses.length} |\n`;
  md += `| Reports | ${scan.inventory.reporting.reports.length} |\n`;
  md += `| Dashboards | ${scan.inventory.reporting.dashboards.length} |\n`;
  md += `| Email Templates | ${scan.inventory.reporting.emailTemplates.length} |\n`;
  md += `| High Severity Findings | ${scan.summary.findingsHigh} |\n`;
  md += `| Medium Severity Findings | ${scan.summary.findingsMedium} |\n`;
  md += `| Low Severity Findings | ${scan.summary.findingsLow ?? 0} |\n\n`;

  // Org Profile
  md += `## Org Profile\n\n`;
  md += `| Property | Value |\n`;
  md += `|----------|-------|\n`;
  md += `| Edition | ${scan.source.edition || "Unknown"} |\n`;
  md += `| Organization Type | ${org.isSandbox ? "Sandbox" : "Production"} |\n`;
  md += `| Instance Name | ${org.instanceName || "N/A"} |\n`;
  md += `| Org ID | ${scan.source.orgId || "N/A"} |\n\n`;

  // Security & Access
  if (scan.inventory.security) {
    md += `## Security & Access\n\n`;
    md += `| Metric | Count |\n`;
    md += `|--------|-------|\n`;
    md += `| Profiles | ${scan.inventory.security.totalProfiles} |\n`;
    md += `| Permission Sets | ${scan.inventory.security.totalPermissionSets} |\n`;
    md += `| Active Users | ${scan.inventory.security.totalUsers.toLocaleString()} |\n`;
    md += `| License Types | ${Object.keys(scan.inventory.security.licenseDistribution).length} |\n\n`;
    
    if (Object.keys(scan.inventory.security.licenseDistribution).length > 0) {
      md += `### License Distribution\n\n`;
      md += `| License Type | Used | Total | Available |\n`;
      md += `|--------------|------|-------|-----------|\n`;
      Object.entries(scan.inventory.security.licenseDistribution).forEach(([license, info]) => {
        md += `| ${license} | ${info.used.toLocaleString()} | ${info.total.toLocaleString()} | ${info.available.toLocaleString()} |\n`;
      });
      md += `\n`;
    }
  }

  // Object Inventory
  md += `## Object Inventory\n\n`;
  md += `| Object | Label | Type | Records | Fields | Record Types | Picklists | Lookups | Auto# |\n`;
  md += `|--------|-------|------|---------|--------|--------------|-----------|---------|-------|\n`;
  
  scan.inventory.sourceObjects
    .sort((a, b) => (b.recordCount || 0) - (a.recordCount || 0))
    .forEach(obj => {
      const masterDetailCount = obj.lookups.filter(l => l.isMasterDetail).length;
      md += `| ${obj.name} | ${obj.label || obj.name} | ${obj.isCustom ? "Custom" : "Standard"} | `;
      md += `${obj.recordCount?.toLocaleString() || "—"} | ${obj.fields.length} | `;
      md += `${obj.recordTypes.length} | ${obj.picklists.length} | ${obj.lookups.length} (${masterDetailCount} M-D) | `;
      md += `${obj.autonumberFields.length > 0 ? "Yes" : "No"} |\n`;
    });
  md += `\n`;

  // Automation Inventory
  md += `## Automation Inventory\n\n`;
  
  // Flows
  md += `### Flows (${scan.inventory.automation.flows.length})\n\n`;
  const flowsByType = scan.inventory.automation.flows.reduce((acc, f) => {
    const type = f.processType || "Unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  md += `| Process Type | Count |\n`;
  md += `|--------------|-------|\n`;
  Object.entries(flowsByType).forEach(([type, count]) => {
    md += `| ${type} | ${count} |\n`;
  });
  md += `\n`;

  md += `| Flow Name | Status | Process Type | Object |\n`;
  md += `|-----------|--------|--------------|--------|\n`;
  scan.inventory.automation.flows.slice(0, 50).forEach(flow => {
    md += `| ${flow.masterLabel || flow.developerName} | ${flow.status} | ${flow.processType || "N/A"} | ${flow.object || "N/A"} |\n`;
  });
  if (scan.inventory.automation.flows.length > 50) {
    md += `| ... | ... | ... | ... |\n`;
    md += `| *${scan.inventory.automation.flows.length - 50} more flows* | | | |\n`;
  }
  md += `\n`;

  // Triggers
  md += `### Apex Triggers (${scan.inventory.automation.triggers.length})\n\n`;
  const triggersByObject = scan.inventory.automation.triggers.reduce((acc, t) => {
    const obj = t.tableEnumOrId || "Unknown";
    acc[obj] = (acc[obj] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  md += `| Object | Trigger Count |\n`;
  md += `|--------|---------------|\n`;
  Object.entries(triggersByObject)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .forEach(([obj, count]) => {
      md += `| ${obj} | ${count} |\n`;
    });
  md += `\n`;

  // Validation Rules
  const validationRulesArray = Array.isArray(scan.inventory.automation.validationRules)
    ? scan.inventory.automation.validationRules
    : [];
  const validationRulesCount = Array.isArray(scan.inventory.automation.validationRules)
    ? scan.inventory.automation.validationRules.length
    : (scan.inventory.automation.validationRules?.total ?? 0);
  
  md += `### Validation Rules (${validationRulesCount})\n\n`;
  const vrsByObject = validationRulesArray.reduce((acc, vr) => {
    const obj = vr.fullName.split(".")[0] || "Unknown";
    acc[obj] = (acc[obj] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  md += `| Object | Validation Rule Count |\n`;
  md += `|--------|----------------------|\n`;
  Object.entries(vrsByObject)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .forEach(([obj, count]) => {
      md += `| ${obj} | ${count} |\n`;
    });
  md += `\n`;

  // Code Inventory
  md += `## Code Inventory\n\n`;
  md += `| Type | Count |\n`;
  md += `|------|-------|\n`;
  md += `| Apex Classes | ${scan.inventory.code.apexClasses.length} |\n`;
  md += `| Apex Triggers | ${scan.inventory.code.apexTriggers.length} |\n\n`;

  // Reporting & UX
  md += `## Reporting & UX Assets\n\n`;
  md += `| Type | Count |\n`;
  md += `|------|-------|\n`;
  md += `| Reports | ${scan.inventory.reporting.reports.length} |\n`;
  md += `| Dashboards | ${scan.inventory.reporting.dashboards.length} |\n`;
  md += `| Email Templates | ${scan.inventory.reporting.emailTemplates.length} |\n`;
  md += `| Report Types | ${scan.inventory.reporting.reportTypes.length} |\n\n`;

  // Integrations
  if (scan.inventory.integrations) {
    md += `## Integrations & External Connections\n\n`;
    md += `| Type | Count |\n`;
    md += `|------|-------|\n`;
    md += `| Connected Apps | ${scan.inventory.integrations.connectedApps.length} |\n`;
    md += `| Named Credentials | ${scan.inventory.integrations.namedCredentials.length} |\n`;
    md += `| Remote Site Settings | ${scan.inventory.integrations.remoteSiteSettings.length} |\n`;
    md += `| Auth Providers | ${scan.inventory.integrations.authProviders.length} |\n\n`;
  }

  // Managed Packages
  md += `## Managed Packages\n\n`;
  if (scan.inventory.packages.length === 0) {
    md += `No managed packages detected.\n\n`;
  } else {
    md += `| Namespace | Package Name |\n`;
    md += `|-----------|--------------|\n`;
    scan.inventory.packages.forEach(pkg => {
      md += `| ${pkg.namespace || "N/A"} | ${pkg.name || "N/A"} |\n`;
    });
    md += `\n`;
  }

  // Migration Findings
  md += `## Migration Findings\n\n`;
  md += `| Severity | Count |\n`;
  md += `|----------|-------|\n`;
  md += `| HIGH | ${scan.summary.findingsHigh} |\n`;
  md += `| MEDIUM | ${scan.summary.findingsMedium} |\n`;
  md += `| LOW | ${scan.summary.findingsLow ?? 0} |\n\n`;

  if (scan.findings.length > 0) {
    // Group findings by category
    const findingsByCategory = scan.findings.reduce((acc, finding) => {
      const category = finding.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(finding);
      return acc;
    }, {} as Record<string, typeof scan.findings>);

    md += `### Findings by Category\n\n`;
    md += `| Category | Count |\n`;
    md += `|----------|-------|\n`;
    Object.entries(findingsByCategory).forEach(([category, findings]) => {
      md += `| ${category} | ${findings.length} |\n`;
    });
    md += `\n`;

    // Group findings by severity
    const highFindings = scan.findings.filter(f => f.severity === "HIGH");
    const mediumFindings = scan.findings.filter(f => f.severity === "MEDIUM");
    const lowFindings = scan.findings.filter(f => f.severity === "LOW");

    if (highFindings.length > 0) {
      md += `### High Severity Findings\n\n`;
      highFindings.forEach(finding => {
        md += `#### ${finding.title}\n\n`;
        md += `**ID:** \`${finding.id}\`\n\n`;
        md += `**Category:** ${finding.category}\n\n`;
        md += `**Description:** ${finding.description}\n\n`;
        md += `**Affected Objects:** ${finding.objects.join(", ")}\n\n`;
        md += `**Impact:** ${finding.impact}\n\n`;
        md += `**Remediation Steps:**\n`;
        finding.remediation.forEach(step => {
          md += `- ${step}\n`;
        });
        md += `\n---\n\n`;
      });
    }

    if (mediumFindings.length > 0) {
      md += `### Medium Severity Findings\n\n`;
      mediumFindings.forEach(finding => {
        md += `#### ${finding.title}\n\n`;
        md += `**ID:** \`${finding.id}\`\n\n`;
        md += `**Category:** ${finding.category}\n\n`;
        md += `**Description:** ${finding.description}\n\n`;
        md += `**Affected Objects:** ${finding.objects.join(", ")}\n\n`;
        md += `**Impact:** ${finding.impact}\n\n`;
        md += `**Remediation Steps:**\n`;
        finding.remediation.forEach(step => {
          md += `- ${step}\n`;
        });
        md += `\n---\n\n`;
      });
    }

    if (lowFindings.length > 0) {
      md += `### Low Severity Findings\n\n`;
      lowFindings.forEach(finding => {
        md += `#### ${finding.title}\n\n`;
        md += `**ID:** \`${finding.id}\`\n\n`;
        md += `**Category:** ${finding.category}\n\n`;
        md += `**Description:** ${finding.description}\n\n`;
        md += `**Affected Objects:** ${finding.objects.join(", ")}\n\n`;
        md += `**Impact:** ${finding.impact}\n\n`;
        md += `**Remediation Steps:**\n`;
        finding.remediation.forEach(step => {
          md += `- ${step}\n`;
        });
        md += `\n---\n\n`;
      });
    }

    // Summary table of all findings
    md += `### Complete Findings Summary\n\n`;
    md += `| ID | Title | Severity | Category | Affected Objects |\n`;
    md += `|----|-------|----------|----------|------------------|\n`;
    scan.findings
      .sort((a, b) => {
        const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .forEach(finding => {
        md += `| \`${finding.id}\` | ${finding.title} | ${finding.severity} | ${finding.category} | ${finding.objects.join(", ")} |\n`;
      });
    md += `\n`;
  }

  // Migration Prerequisites
  md += `## Migration Prerequisites Checklist\n\n`;
  md += `| # | Prerequisite | Status | Notes |\n`;
  md += `|---|-------------|--------|-------|\n`;
  migrationPrerequisites.forEach(prereq => {
    md += `| ${prereq.no} | ${prereq.name} | ${prereq.status} | ${prereq.note || "—"} |\n`;
  });
  md += `\n`;

  // Recommended Metadata Deployment Sequence
  md += `## Recommended Metadata Deployment Sequence\n\n`;
  md += `*See the Metadata Deployment Sequence section in the dashboard for the complete 93-phase deployment order.*\n\n`;

  // Dependency Graph Summary
  md += `## Dependency Graph Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Objects | ${scan.dependencyGraph.nodes.length} |\n`;
  md += `| Dependencies (Edges) | ${scan.dependencyGraph.edges.length} |\n`;
  md += `| Load Phases | ${scan.dependencyGraph.order.length > 0 ? "Calculated" : "N/A"} |\n\n`;

  return md;
}

