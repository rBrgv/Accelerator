import { ScanOutput } from "@/lib/types";

export function generateDataReportMarkdown(scan: ScanOutput): string {
  const org = scan.source.organization || {};
  const date = new Date().toISOString().split('T')[0];
  
  let md = `# Salesforce Org Migration - Data Insights Report\n\n`;
  md += `**Generated:** ${date}\n`;
  md += `**Org:** ${scan.source.instanceUrl}\n`;
  md += `**Edition:** ${scan.source.edition || "Unknown"}\n`;
  md += `**API Version:** ${scan.source.apiVersion}\n`;
  md += `**Scan ID:** ${scan.scanId || "N/A"}\n\n`;
  md += `---\n\n`;

  // Executive Summary
  md += `## Executive Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Records | ${scan.summary.recordsApprox.toLocaleString()} |\n`;
  md += `| Objects with Data | ${scan.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount > 0).length} |\n`;
  md += `| Objects without Data | ${scan.inventory.sourceObjects.filter(o => !o.recordCount || o.recordCount === 0).length} |\n`;
  md += `| High-Volume Objects (≥100k) | ${scan.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 100000).length} |\n`;
  md += `| Very Large Objects (≥1M) | ${scan.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 1000000).length} |\n\n`;

  // Data Volume Analysis
  md += `## Data Volume Analysis\n\n`;
  
  // Objects by Record Count
  md += `### Objects by Record Count\n\n`;
  md += `| Object | Label | Type | Record Count |\n`;
  md += `|--------|-------|------|--------------|\n`;
  scan.inventory.sourceObjects
    .filter(o => o.recordCount && o.recordCount > 0)
    .sort((a, b) => (b.recordCount || 0) - (a.recordCount || 0))
    .forEach(obj => {
      md += `| ${obj.name} | ${obj.label || obj.name} | ${obj.isCustom ? "Custom" : "Standard"} | ${obj.recordCount!.toLocaleString()} |\n`;
    });
  md += `\n`;

  // High-Volume Objects
  const highVolumeObjects = scan.inventory.sourceObjects.filter(o => o.recordCount && o.recordCount >= 100000);
  if (highVolumeObjects.length > 0) {
    md += `### High-Volume Objects (≥100,000 records)\n\n`;
    md += `| Object | Record Count | Migration Considerations |\n`;
    md += `|--------|--------------|-------------------------|\n`;
    highVolumeObjects.forEach(obj => {
      const considerations = [];
      if (obj.recordCount! >= 1000000) considerations.push("Requires batch processing");
      if (obj.autonumberFields.length > 0) considerations.push("Has autonumber fields");
      if (obj.lookups.filter(l => l.isMasterDetail).length > 0) considerations.push("Has master-detail relationships");
      md += `| ${obj.name} | ${obj.recordCount!.toLocaleString()} | ${considerations.join("; ") || "Standard migration"} |\n`;
    });
    md += `\n`;
  }

  // Data Quality Insights
  md += `## Data Quality Insights\n\n`;
  
  // Required Fields Analysis
  const objectsWithRequiredFields = scan.inventory.sourceObjects.filter(obj => 
    obj.fields.some(f => f.required && !f.nillable)
  );
  md += `### Required Fields Analysis\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Objects with Required Fields | ${objectsWithRequiredFields.length} |\n`;
  md += `| Total Required Fields | ${scan.inventory.sourceObjects.reduce((sum, obj) => 
    sum + obj.fields.filter(f => f.required && !f.nillable).length, 0)} |\n\n`;

  if (objectsWithRequiredFields.length > 0) {
    md += `#### Top Objects with Required Fields (Create-time Blockers)\n\n`;
    md += `| Object | Required Fields |\n`;
    md += `|--------|-----------------|\n`;
    objectsWithRequiredFields
      .sort((a, b) => {
        const aCount = a.fields.filter(f => f.required && !f.nillable).length;
        const bCount = b.fields.filter(f => f.required && !f.nillable).length;
        return bCount - aCount;
      })
      .slice(0, 20)
      .forEach(obj => {
        const count = obj.fields.filter(f => f.required && !f.nillable).length;
        md += `| ${obj.name} | ${count} |\n`;
      });
    md += `\n`;
  }

  // External ID Fields
  const totalExternalIds = scan.inventory.sourceObjects.reduce((sum, obj) => 
    sum + obj.fields.filter(f => f.externalId === true).length, 0
  );
  md += `### External ID Fields\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total External ID Fields | ${totalExternalIds} |\n`;
  md += `| Objects with External IDs | ${scan.inventory.sourceObjects.filter(o => o.fields.some(f => f.externalId === true)).length} |\n\n`;

  if (totalExternalIds > 0) {
    md += `#### Objects with External ID Fields\n\n`;
    md += `| Object | External ID Fields |\n`;
    md += `|--------|-------------------|\n`;
    scan.inventory.sourceObjects
      .filter(o => o.fields.some(f => f.externalId === true))
      .forEach(obj => {
        const extIds = obj.fields.filter(f => f.externalId === true);
        md += `| ${obj.name} | ${extIds.map(f => f.name).join(", ")} |\n`;
      });
    md += `\n`;
  }

  // Autonumber Fields
  const objectsWithAutonumber = scan.inventory.sourceObjects.filter(o => o.autonumberFields.length > 0);
  if (objectsWithAutonumber.length > 0) {
    md += `### Autonumber Fields\n\n`;
    md += `| Object | Autonumber Fields | Format |\n`;
    md += `|-------|-------------------|--------|\n`;
    objectsWithAutonumber.forEach(obj => {
      obj.autonumberFields.forEach(af => {
        md += `| ${obj.name} | ${af.field} | ${af.displayFormat || "N/A"} |\n`;
      });
    });
    md += `\n`;
  }

  // Master-Detail Relationships
  const objectsWithMD = scan.inventory.sourceObjects.filter(o => 
    o.lookups.some(l => l.isMasterDetail)
  );
  if (objectsWithMD.length > 0) {
    md += `### Master-Detail Relationships\n\n`;
    md += `| Child Object | Parent Object | Field |\n`;
    md += `|--------------|---------------|------|\n`;
    objectsWithMD.forEach(obj => {
      obj.lookups.filter(l => l.isMasterDetail).forEach(lookup => {
        md += `| ${obj.name} | ${lookup.target} | ${lookup.field} |\n`;
      });
    });
    md += `\n`;
  }

  // Lookup Relationships
  md += `### Lookup Relationships Summary\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Lookup Relationships | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.lookups.length, 0)} |\n`;
  md += `| Master-Detail Relationships | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.lookups.filter(l => l.isMasterDetail).length, 0)} |\n`;
  md += `| Standard Lookups | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.lookups.filter(l => !l.isMasterDetail).length, 0)} |\n\n`;

  // Feature Flags
  md += `## Feature Flags & Settings\n\n`;
  md += `| Feature | Status |\n`;
  md += `|---------|--------|\n`;
  md += `| Person Accounts | ${org.IsPersonAccountEnabled ? "Enabled" : "Disabled"} |\n`;
  md += `| Email-to-Case | ${org.IsEmailToCaseEnabled ? "Enabled" : "Disabled"} |\n`;
  md += `| Multi-Currency | ${org.IsMultiCurrencyEnabled ? "Enabled" : "Disabled"} |\n`;
  md += `| State/Country Picklists | ${org.IsStateCountryPicklistsEnabled ? "Enabled" : "Disabled"} |\n`;
  md += `| Knowledge | ${org.IsKnowledgeEnabled ? "Enabled" : "Disabled"} |\n`;
  md += `| Communities | ${org.IsCommunitiesEnabled ? "Enabled" : "Disabled"} |\n\n`;

  // Data Migration Considerations
  md += `## Data Migration Considerations\n\n`;
  
  // Long Text Fields
  const longTextFields = scan.inventory.sourceObjects.reduce((sum, obj) => 
    sum + obj.fields.filter(f => (f.type === "textarea" || f.type === "richtextarea") && f.length && f.length > 255).length, 0
  , 0);
  md += `### Long Text & Rich Text Fields\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Long Text Fields (>255 chars) | ${longTextFields} |\n`;
  md += `| Rich Text Fields | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.fields.filter(f => f.type === "richtextarea").length, 0)} |\n\n`;
  md += `**Note:** Long text fields may require special handling during data migration.\n\n`;

  // Picklist Analysis
  md += `### Picklist Fields\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Objects with Picklists | ${scan.inventory.sourceObjects.filter(o => o.picklists.length > 0).length} |\n`;
  md += `| Total Picklist Fields | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.picklists.length, 0)} |\n\n`;
  md += `**Note:** Ensure picklist values match between source and target orgs.\n\n`;

  // Record Type Analysis
  md += `### Record Types\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Objects with Record Types | ${scan.inventory.sourceObjects.filter(o => o.recordTypes.length > 0).length} |\n`;
  md += `| Total Record Types | ${scan.inventory.sourceObjects.reduce((sum, obj) => sum + obj.recordTypes.length, 0)} |\n\n`;

  // Recommended Data Deployment Sequence
  md += `## Recommended Data Deployment Sequence\n\n`;
  md += `*See the Data Deployment Sequence section in the dashboard for the complete 37-phase data load order.*\n\n`;
  md += `### Key Principles:\n\n`;
  md += `1. **Foundation First:** Load Users, Roles, Queues, Record Types before transactional data\n`;
  md += `2. **Master Data:** Load Accounts, Contacts, Products before dependent records\n`;
  md += `3. **Transactional Data:** Load Opportunities, Cases, Orders after master data\n`;
  md += `4. **Related Data:** Load junction objects and team members last\n`;
  md += `5. **Finalization:** Recalculate rollups and re-enable automation\n\n`;

  // Data Migration Checklist
  md += `## Data Migration Pre-Load Checklist\n\n`;
  md += `- [ ] Disable validation rules, triggers, and workflows\n`;
  md += `- [ ] Create external ID fields for key objects\n`;
  md += `- [ ] Set up old→new ID mapping tables\n`;
  md += `- [ ] Verify User, Queue, and RecordType mappings\n`;
  md += `- [ ] Prepare data extract files (CSV/JSON)\n`;
  md += `- [ ] Test data load on sandbox first\n`;
  md += `- [ ] Plan batch sizes for large objects\n`;
  md += `- [ ] Schedule migration windows\n\n`;

  // Post-Load Validation
  md += `## Post-Load Validation Checklist\n\n`;
  md += `- [ ] Verify record counts match source org\n`;
  md += `- [ ] Validate lookup relationships\n`;
  md += `- [ ] Check for data quality issues\n`;
  md += `- [ ] Re-enable automation (triggers, validation rules, workflows)\n`;
  md += `- [ ] Recalculate formula and rollup fields\n`;
  md += `- [ ] Test critical business processes\n`;
  md += `- [ ] Verify sharing rules and permissions\n`;
  md += `- [ ] Run data quality reports\n\n`;

  // Data Migration Findings (Automation Blockers)
  const dataMigrationFindings = scan.findings.filter(f => 
    f.category === "Data Migration" || 
    f.category === "Data Migration - Automation" ||
    f.category === "Data Volume"
  );

  if (dataMigrationFindings.length > 0) {
    md += `## Data Migration Blockers & Warnings\n\n`;
    md += `This section highlights automation and data-related findings that could impact your data migration.\n\n`;

    // Group by category
    const automationBlockers = dataMigrationFindings.filter(f => f.category === "Data Migration - Automation");
    const dataBlockers = dataMigrationFindings.filter(f => f.category === "Data Migration");
    const volumeWarnings = dataMigrationFindings.filter(f => f.category === "Data Volume");

    if (automationBlockers.length > 0) {
      md += `### Automation Blockers (${automationBlockers.length})\n\n`;
      md += `**⚠️ Critical:** These automation components will execute during data loads and may cause performance issues, validation errors, or block migration entirely.\n\n`;

      // Group by type
      const triggerBlockers = automationBlockers.filter(f => f.id.startsWith("TRIGGER_BLOCKER"));
      const triggerDense = automationBlockers.filter(f => f.id.startsWith("TRIGGER_DENSE"));
      const validationBlockers = automationBlockers.filter(f => f.id.startsWith("VALIDATION_BLOCKER"));
      const flowBlockers = automationBlockers.filter(f => f.id.startsWith("FLOW_BLOCKER"));
      const complexAutomation = automationBlockers.filter(f => f.id.startsWith("AUTOMATION_COMPLEX"));

      if (triggerBlockers.length > 0) {
        md += `#### Active Triggers (${triggerBlockers.length} objects)\n\n`;
        md += `| Object | Trigger Count | Impact |\n`;
        md += `|--------|---------------|--------|\n`;
        triggerBlockers.forEach(finding => {
          const triggerNames = finding.description.match(/trigger\(s\) that will execute during data migration: (.+?)\./)?.[1] || "Multiple triggers";
          md += `| ${finding.objects[0]} | ${triggerNames} | Triggers will fire during data loads |\n`;
        });
        md += `\n`;
        md += `**Action Required:** Disable triggers during initial data load to prevent performance issues and governor limit errors.\n\n`;
      }

      if (triggerDense.length > 0) {
        md += `#### Objects with Multiple Triggers (${triggerDense.length} objects)\n\n`;
        md += `| Object | Trigger Count |\n`;
        md += `|--------|---------------|\n`;
        triggerDense.forEach(finding => {
          const count = finding.description.match(/(\d+) active triggers/)?.[1] || "Multiple";
          md += `| ${finding.objects[0]} | ${count} triggers |\n`;
        });
        md += `\n`;
        md += `**Action Required:** Review trigger execution order and consider consolidating logic.\n\n`;
      }

      if (validationBlockers.length > 0) {
        md += `#### Validation Rule Blockers (${validationBlockers.length} objects)\n\n`;
        md += `| Object | Validation Rules | Required Fields |\n`;
        md += `|--------|----------------|-----------------|\n`;
        validationBlockers.forEach(finding => {
          const vrCount = finding.description.match(/(\d+) active validation rule/)?.[1] || "Multiple";
          const reqFields = finding.description.match(/(\d+) required field/)?.[1] || "0";
          md += `| ${finding.objects[0]} | ${vrCount} | ${reqFields} |\n`;
        });
        md += `\n`;
        md += `**Action Required:** Disable validation rules during initial data load and ensure all required fields have values in source data.\n\n`;
      }

      if (flowBlockers.length > 0) {
        md += `#### Record-Triggered Flows (${flowBlockers.length} objects)\n\n`;
        md += `| Object | Flow Count |\n`;
        md += `|--------|------------|\n`;
        flowBlockers.forEach(finding => {
          const flowCount = finding.description.match(/(\d+) active record-triggered flow/)?.[1] || "Multiple";
          md += `| ${finding.objects[0]} | ${flowCount} flows |\n`;
        });
        md += `\n`;
        md += `**Action Required:** Consider deactivating flows during bulk data loads to prevent governor limit errors.\n\n`;
      }

      if (complexAutomation.length > 0) {
        md += `#### Complex Automation (${complexAutomation.length} objects)\n\n`;
        md += `| Object | Total Automation Components |\n`;
        md += `|--------|----------------------------|\n`;
        complexAutomation.forEach(finding => {
          const total = finding.description.match(/(\d+) active automation components/)?.[1] || "Multiple";
          md += `| ${finding.objects[0]} | ${total} (triggers + flows + validation rules) |\n`;
        });
        md += `\n`;
        md += `**Action Required:** Disable all automation during initial bulk data load, then re-enable incrementally.\n\n`;
      }
    }

    if (dataBlockers.length > 0) {
      md += `### Data Migration Blockers (${dataBlockers.length})\n\n`;
      dataBlockers.forEach(finding => {
        md += `#### ${finding.title}\n\n`;
        md += `**ID:** \`${finding.id}\`\n\n`;
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

    if (volumeWarnings.length > 0) {
      md += `### Data Volume Warnings (${volumeWarnings.length})\n\n`;
      volumeWarnings.forEach(finding => {
        md += `#### ${finding.title}\n\n`;
        md += `**Description:** ${finding.description}\n\n`;
        md += `**Impact:** ${finding.impact}\n\n`;
        md += `**Remediation Steps:**\n`;
        finding.remediation.forEach(step => {
          md += `- ${step}\n`;
        });
        md += `\n---\n\n`;
      });
    }

    // Summary table
    md += `### Data Migration Findings Summary\n\n`;
    md += `| ID | Title | Severity | Category | Affected Objects |\n`;
    md += `|----|-------|----------|----------|------------------|\n`;
    dataMigrationFindings
      .sort((a, b) => {
        const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .forEach(finding => {
        md += `| \`${finding.id}\` | ${finding.title} | ${finding.severity} | ${finding.category} | ${finding.objects.join(", ")} |\n`;
      });
    md += `\n`;
  }

  return md;
}

