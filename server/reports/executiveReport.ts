import { ScanOutput } from "@/lib/types";

/**
 * Calculate migration readiness score (0-100)
 * More lenient scoring - migration is possible even with lower scores
 */
function calculateReadinessScore(scan: ScanOutput): number {
  let score = 85; // Start higher - most orgs can migrate with some remediation
  
  // Deduct points for high severity findings (less punitive)
  score -= Math.min(scan.summary.findingsHigh * 1.5, 30);
  
  // Deduct points for medium severity findings (less punitive)
  score -= Math.min(scan.summary.findingsMedium * 0.5, 15);
  
  // Deduct points for low automation (no active flows) - minor impact
  // Use flowSummary if available (more accurate), otherwise fallback to flows array
  const activeFlows = scan.inventory.automation.flowSummary?.active ?? 
    scan.inventory.automation.flows.filter(f => f.status === "Active").length;
  if (activeFlows === 0) score -= 8;
  
  // Deduct points for excessive Apex classes - minor impact
  const apexCount = scan.inventory.code?.apexClasses?.length || 0;
  if (apexCount > 1000) score -= 5;
  else if (apexCount > 500) score -= 3;
  
  // Deduct points for low code coverage - moderate impact
  const coverage = scan.inventory.code?.coverage?.orgWidePercent;
  if (coverage !== null && coverage !== undefined) {
    if (coverage < 50) score -= 10;
    else if (coverage < 75) score -= 5;
  }
  
  // Deduct points for validation rules gaps - minor impact
  if (scan.summary.vrs === 0) score -= 5;
  
  return Math.max(20, Math.min(100, score)); // Minimum 20% - migration is always possible
}

/**
 * Get status indicator for a KPI
 */
function getStatusIndicator(value: number, target: number | null, isLowerBetter: boolean = false): string {
  if (target === null) return "—";
  
  if (isLowerBetter) {
    if (value <= target) return "✓ Good";
    if (value <= target * 1.5) return "⚠ At Risk";
    return "🔴 Critical";
  } else {
    if (value >= target) return "✓ Good";
    if (value >= target * 0.75) return "⚠ At Risk";
    return "🔴 Critical";
  }
}

/**
 * Get status for readiness score - more nuanced messaging
 */
function getReadinessStatus(score: number): string {
  if (score >= 75) return "✓ Ready";
  if (score >= 50) return "⚠ Ready with Remediation";
  if (score >= 30) return "⚠ Requires Significant Remediation";
  return "⚠ Migration Possible with Extensive Remediation";
}

export function generateExecutiveReportMarkdown(scan: ScanOutput): string {
  const org = scan.source.organization || {};
  const readinessScore = calculateReadinessScore(scan);
  // Use flowSummary if available (more accurate), otherwise fallback to flows array
  const activeFlows = scan.inventory.automation.flowSummary?.active ?? 
    scan.inventory.automation.flows.filter(f => f.status === "Active").length;
  const totalFlows = scan.inventory.automation.flowSummary?.total ?? scan.inventory.automation.flows.length;
  const apexCount = scan.inventory.code?.apexClasses?.length || 0;
  const coverage = scan.inventory.code?.coverage?.orgWidePercent;
  const totalObjects = scan.summary.objects;
  const customObjects = scan.inventory.sourceObjects.filter(o => o.isCustom).length;
  const highVolumeObjects = scan.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 100000).length;
  
  // Get validation rules count (handle both array and AutomationCount types)
  const validationRulesCount = Array.isArray(scan.inventory.automation.validationRules)
    ? scan.inventory.automation.validationRules.length
    : (scan.inventory.automation.validationRules?.total ?? 0);
  const validationRulesActive = Array.isArray(scan.inventory.automation.validationRules)
    ? scan.inventory.automation.validationRules.filter(vr => vr.active).length
    : (scan.inventory.automation.validationRules?.active ?? null);
  
  // Get storage information
  const storage = scan.source.storage;
  const dataStorageUsed = storage?.data.usedMb ?? 0;
  const dataStorageMax = storage?.data.maxMb ?? 0;
  const fileStorageUsed = storage?.file.usedMb ?? 0;
  const fileStorageMax = storage?.file.maxMb ?? 0;
  
  let md = `# Salesforce Org Migration Executive Readiness Summary\n\n`;
  md += `**Organization:** ${scan.source.organizationName || "Unknown"}\n`;
  md += `**Org URL:** ${scan.source.instanceUrl}\n`;
  md += `**Edition:** ${scan.source.edition || "Unknown"}\n`;
  md += `**Organization Type:** ${org.isSandbox ? "Sandbox" : "Production"}\n\n`;
  md += `---\n\n`;

  // Section 1: Migration Health Snapshot
  md += `## Migration Health Snapshot\n\n`;
  md += `| KPI | Target | Current | Status |\n`;
  md += `|-----|--------|---------|--------|\n`;
  md += `| Total Objects | — | ${totalObjects} (${customObjects} custom) | ${customObjects > 150 ? "⚠ High customization" : "✓ Manageable"} |\n`;
  md += `| Apex Classes | <500 | ${apexCount} | ${apexCount > 1000 ? "🔴 Excessive complexity" : apexCount > 500 ? "⚠ High complexity" : "✓ Manageable"} |\n`;
  md += `| Data Volume | — | ${scan.summary.recordsApprox.toLocaleString()} records | ${highVolumeObjects > 0 ? "⚠ High-volume objects" : "✓ Manageable"} |\n`;
  md += `| Validation Rules | >25 | ${validationRulesCount}${validationRulesActive !== null ? ` (${validationRulesActive} active)` : ""} | ${validationRulesCount === 0 ? "⚠ Missing governance" : validationRulesCount < 25 ? "⚠ Low coverage" : "✓ Good"} |\n`;
  md += `| Data Storage | — | ${dataStorageMax > 0 ? `${dataStorageUsed.toLocaleString()} / ${dataStorageMax.toLocaleString()} MB (${storage?.data.usedPct ?? 0}%)` : "N/A"} | ${dataStorageMax > 0 ? (storage?.data.usedPct && storage.data.usedPct > 80 ? "🔴 Near capacity" : storage?.data.usedPct && storage.data.usedPct > 60 ? "⚠ High usage" : "✓ Manageable") : "—"} |\n`;
  md += `| File Storage | — | ${fileStorageMax > 0 ? `${fileStorageUsed.toLocaleString()} / ${fileStorageMax.toLocaleString()} MB (${storage?.file.usedPct ?? 0}%)` : "N/A"} | ${fileStorageMax > 0 ? (storage?.file.usedPct && storage.file.usedPct > 80 ? "🔴 Near capacity" : storage?.file.usedPct && storage.file.usedPct > 60 ? "⚠ High usage" : "✓ Manageable") : "—"} |\n`;
  md += `| High Severity Findings | 0 | ${scan.summary.findingsHigh} | ${scan.summary.findingsHigh === 0 ? "✓ Good" : scan.summary.findingsHigh < 10 ? "⚠ Requires attention" : "🔴 Requires remediation"} |\n`;
  md += `| Code Coverage | ≥75% | ${coverage !== null && coverage !== undefined ? `${coverage}%` : "Requires careful coverage review"} | ${coverage !== null && coverage !== undefined ? (coverage >= 75 ? "✓ Good" : coverage >= 50 ? "⚠ Below threshold" : "🔴 Critical") : "⚠ Review needed"} |\n`;
  md += `| Migration Readiness | 100% | ${readinessScore}% | ${getReadinessStatus(readinessScore)} |\n\n`;

  // KPI Visualization
  md += `### Migration Readiness Score\n\n`;
  const barLength = Math.round(readinessScore / 5); // 20 chars max
  const bar = "█".repeat(barLength) + "░".repeat(20 - barLength);
  md += `\`${bar}\` ${readinessScore}% - ${getReadinessStatus(readinessScore)}\n\n`;

  // Section 2: Executive Summary
  md += `## Executive Summary\n\n`;
  
  const summaryText = [];
  if (readinessScore >= 75) {
    summaryText.push("The audit indicates a well-structured Salesforce environment with manageable migration complexity.");
  } else if (readinessScore >= 50) {
    summaryText.push("The audit indicates a mature Salesforce environment that can proceed with migration after addressing identified remediation areas.");
  } else if (readinessScore >= 30) {
    summaryText.push("The audit indicates migration is feasible but will require significant remediation efforts to address technical debt and configuration gaps.");
  } else {
    summaryText.push("The audit indicates migration is possible but will require extensive remediation to address multiple technical and process gaps.");
  }
  
  // Only flag as issue if truly 0 active flows (not just some inactive versions)
  if (activeFlows === 0 && totalFlows > 0) {
    summaryText.push("Core automation controls are inactive and should be reactivated to restore business process efficiency.");
  } else if (activeFlows > 0 && totalFlows > activeFlows) {
    // Some flows are inactive (different versions) - this is normal, not a concern
    // Don't add any negative messaging about this
  }
  
  if (apexCount > 500) {
    summaryText.push("Heavy reliance on custom code increases technical complexity and may benefit from rationalization.");
  }
  
  if (scan.summary.findingsHigh > 0) {
    summaryText.push(`${scan.summary.findingsHigh} high-severity findings should be prioritized for remediation to streamline migration.`);
  }
  
  if (summaryText.length === 0) {
    summaryText.push("The organization demonstrates strong migration readiness with minimal remediation required.");
  }
  
  md += summaryText.join(" ") + "\n\n";

  // Section 3: Key Risks
  md += `## Key Risks\n\n`;
  const risks: string[] = [];
  
  // Only flag as risk if truly 0 active flows (not just some inactive versions)
  if (activeFlows === 0 && totalFlows > 0) {
    risks.push("Inactive automation layer (0 active flows) - business processes may be manual or dependent on triggers.");
  }
  
  if (apexCount > 500) {
    risks.push(`Heavy reliance on Apex logic (${apexCount} classes) instead of declarative tools increases complexity and maintenance costs.`);
  }
  
  if (validationRulesCount === 0) {
    risks.push("Missing validation controls impacting data accuracy and governance.");
  } else if (validationRulesCount < 25) {
    risks.push(`Limited validation rules (${validationRulesCount}) may indicate gaps in data quality controls.`);
  }
  
  if (scan.summary.findingsHigh > 0) {
    risks.push(`${scan.summary.findingsHigh} high-severity findings blocking migration readiness, including dependency conflicts and data quality issues.`);
  }
  
  if (coverage !== null && coverage !== undefined && coverage < 75) {
    risks.push(`Low code coverage (${coverage}%) may block production deployment requirements.`);
  }
  
  const objectsWithAutonumber = scan.inventory.sourceObjects.filter(o => o.autonumberFields.length > 0).length;
  if (objectsWithAutonumber > 0) {
    risks.push(`${objectsWithAutonumber} objects with autonumber fields requiring special handling during data migration.`);
  }
  
  const objectsWithTriggers = scan.inventory.automation.triggers.length;
  if (objectsWithTriggers > 50) {
    risks.push(`Excessive trigger usage (${objectsWithTriggers} triggers) may cause performance issues and automation conflicts during data migration.`);
  }
  
  if (highVolumeObjects > 0) {
    risks.push(`${highVolumeObjects} high-volume objects (≥100k records) requiring specialized migration strategies.`);
  }
  
  if (risks.length === 0) {
    risks.push("No critical risks identified. Migration can proceed with standard protocols.");
  }
  
  risks.forEach((risk, index) => {
    md += `${index + 1}. ${risk}\n`;
  });
  md += `\n`;

  // Section 4: Recommended Leadership Actions
  md += `## Recommended Leadership Actions\n\n`;
  const actions: string[] = [];
  
  if (scan.summary.findingsHigh > 0) {
    actions.push("Approve remediation phase to address high-severity findings blocking migration.");
  }
  
  // Only flag as action if truly 0 active flows (not just some inactive versions)
  if (activeFlows === 0 && totalFlows > 0) {
    actions.push("Sponsor automation reactivation initiative to restore business process automation.");
  }
  
  if (apexCount > 500) {
    actions.push("Mandate code rationalization review to identify opportunities for declarative alternatives.");
  }
  
  if (coverage !== null && coverage !== undefined && coverage < 75) {
    actions.push("Approve test development program to achieve minimum 75% code coverage requirement.");
  }
  
  if (validationRulesCount === 0 || validationRulesCount < 25) {
    actions.push(`Establish data governance framework with validation rules to ensure data quality (currently ${validationRulesCount} rules).`);
  }
  
  if (storage && storage.data.usedPct > 80) {
    actions.push(`Address data storage capacity (${storage.data.usedPct}% used - ${storage.data.usedMb.toLocaleString()} / ${storage.data.maxMb.toLocaleString()} MB) to prevent migration constraints.`);
  }
  
  if (storage && storage.file.usedPct > 80) {
    actions.push(`Address file storage capacity (${storage.file.usedPct}% used - ${storage.file.usedMb.toLocaleString()} / ${storage.file.maxMb.toLocaleString()} MB) to ensure adequate space for migration.`);
  }
  
  if (highVolumeObjects > 0) {
    actions.push("Approve specialized data migration strategy for high-volume objects.");
  }
  
  if (readinessScore < 75) {
    actions.push("Establish executive oversight committee to track remediation progress and readiness KPIs.");
  }
  
  if (actions.length === 0) {
    actions.push("Proceed with standard migration protocols. No additional executive actions required at this time.");
  }
  
  actions.forEach((action, index) => {
    md += `${index + 1}. ${action}\n`;
  });
  md += `\n`;

  // Section 5: Critical Findings Summary
  const highFindings = scan.findings.filter(f => f.severity === "HIGH");
  const mediumFindings = scan.findings.filter(f => f.severity === "MEDIUM");
  
  if (highFindings.length > 0 || mediumFindings.length > 0) {
    md += `## Critical Findings Summary\n\n`;
    
    if (highFindings.length > 0) {
      md += `### Critical Issues\n\n`;
      md += `**${highFindings.length}** - Requires immediate attention\n\n`;
      
      // Group high findings by category
      const highFindingsByCategory = highFindings.reduce((acc, finding) => {
        const category = finding.category || "Other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(finding);
        return acc;
      }, {} as Record<string, typeof highFindings>);
      
      // Show counts by category
      Object.entries(highFindingsByCategory)
        .sort(([, a], [, b]) => b.length - a.length)
        .forEach(([category, findings]) => {
          md += `- **${category}**: ${findings.length} issue${findings.length !== 1 ? "s" : ""}\n`;
        });
      md += `\n`;
    }
    
    if (mediumFindings.length > 0) {
      md += `### Moderate Issues\n\n`;
      md += `**${mediumFindings.length}** - Plan for remediation\n\n`;
      
      // Group medium findings by category
      const mediumFindingsByCategory = mediumFindings.reduce((acc, finding) => {
        const category = finding.category || "Other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(finding);
        return acc;
      }, {} as Record<string, typeof mediumFindings>);
      
      // Show counts by category
      Object.entries(mediumFindingsByCategory)
        .sort(([, a], [, b]) => b.length - a.length)
        .forEach(([category, findings]) => {
          md += `- **${category}**: ${findings.length} issue${findings.length !== 1 ? "s" : ""}\n`;
        });
      md += `\n`;
    }
  }

  md += `---\n\n`;
  md += `*This executive summary provides a high-level assessment of migration readiness. Detailed technical findings and remediation steps are available in the full scan results.*\n`;

  return md;
}

