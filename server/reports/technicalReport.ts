import type { ScanOutput } from "@/lib/types";

type OrgInfo = {
  name?: string;
  edition?: string;
  instanceUrl?: string;
  myDomain?: string;
};

function safe(v: any, alt = "N/A"): string {
  return v === undefined || v === null || v === "" ? alt : String(v);
}

function yesno(b?: boolean): string {
  return b ? "Yes" : "No";
}

function pct(n?: number | null): string {
  return n === null || n === undefined ? "N/A" : `${Math.round(Number(n))}%`;
}

function getRemediationForFinding(finding: any): string {
  // First, try to use the finding's own remediation array if available
  if (Array.isArray(finding?.remediation) && finding.remediation.length > 0) {
    return finding.remediation.join("; ");
  }

  // If finding has a description with remediation info, use that
  if (finding?.description && typeof finding.description === "string") {
    // Some findings have remediation embedded in description
    if (finding.description.includes("remediation") || finding.description.includes("recommendation")) {
      return finding.description;
    }
  }

  // Fallback to code-based remediation
  const code = String(finding?.code || finding?.id || "").toUpperCase();
  const key = code.split("_")[0];

  switch (key) {
    case "AUTONUMBER":
      return "Identify all auto-number fields; plan for renumbering strategy if sequential numbers are required; use external ID fields for record matching; document auto-number format and starting number.";
    case "LARGE":
      return "Use Bulk API 2.0 for data migration; implement staged parent→child load ordering; plan for parallelization with governor limits; set up dead-letter queue and retry mechanisms.";
    case "TRIGGER":
      return "Review all triggers on affected objects; consider deactivating non-critical triggers during bulk data loads; test trigger behavior with sample data; monitor governor limits during migration.";
    case "MULTIPLE":
      return "Consolidate multiple triggers into a single trigger per object; adopt a trigger framework with before/after handlers; route operations by context (isInsert/update/delete, isBefore/after).";
    case "FLOW":
      return "Review all record-triggered flows on affected objects; consider deactivating flows during bulk data loads; test flow behavior with sample data loads; monitor flow execution and governor limits; plan for flow re-activation after data migration.";
    case "COMPLEX":
      return "Review all automation components (triggers, flows, validation rules); prioritize which automation can be safely disabled during migration; test automation behavior with sample data; document automation dependencies.";
    case "REQUIRED":
      return "Identify all required fields without defaults; ensure source data contains values for all required fields; create data quality checks to identify records with missing required fields; consider adding default values in target org if appropriate; plan for data transformation to populate required fields.";
    case "MASTER":
      return "Load parent records before child records; ensure parent records exist before creating child records; validate parent-child relationships in source data; plan for relationship mapping if object names differ.";
    case "LOW":
    case "CRITICAL":
    case "MODERATE":
      if (code.includes("COVERAGE")) {
        return "Prioritize test development for classes with low coverage; review each class to understand why coverage is low; develop targeted test classes for critical business logic; ensure all critical business logic is tested; add factories and branch-path tests; enforce ≥75% coverage in CI with quality gates.";
      }
      break;
    case "SINGLE":
      return "Refactor to a single trigger per object; adopt a trigger framework (before/after handlers), add ordered execution and unit tests.";
    case "APEX":
      return "Consolidate dead code; extract shared libs; align API versions; enforce code ownership and module boundaries.";
    case "CODE":
      return "Add factories, branch-path tests, selective data creation; enforce ≥75% in CI with quality gates.";
    case "API":
      return "Upgrade Apex/Flow/Metadata API versions within 2 releases; run regression suites.";
    case "PROCESS":
      return "Migrate PB/Workflow Rules to record-triggered Flows; decompose into modular subflows; document entry criteria.";
    case "VALIDATION":
      return "Reduce rule sprawl; centralize complex logic in flows/apex; document lifecycle state transitions.";
    case "WORKFLOW":
      return "Decommission Workflow Rules; map each rule to equivalent Flow nodes/actions.";
    case "DATA":
      return "Archive/Externalize historical data; Big Objects for logs; scheduled cleanup via batch/flows.";
    case "FILE":
      return "Purge orphaned ContentDocuments; external storage/CDN for large binaries.";
    case "HIGH":
      return "Bulk API 2.0; staged parent→child order; parallelization with limits; DLQ/retry plan.";
    case "OBJECTS":
      return "Introduce minimal VRs for critical objects to enforce data quality; align with picklists/record types.";
    case "INACTIVE":
      return "Deactivate/Freeze unused users; reassign ownership to queues; reconcile licenses.";
    case "ADMIN":
    case "PROFILES":
      return "Apply least privilege; shift to Permission Sets; quarterly entitlements review.";
    case "GUEST":
      return "Remove Modify All; apply sharing sets; use custom permissions and flow checks.";
    default:
      // Try to extract meaningful remediation from title or description
      if (finding?.title) {
        const title = String(finding.title).toLowerCase();
        if (title.includes("autonumber")) {
          return "Plan for auto-number field handling; use external IDs for matching; document numbering format.";
        }
        if (title.includes("trigger")) {
          return "Review and potentially disable triggers during bulk data loads; test trigger behavior.";
        }
        if (title.includes("flow")) {
          return "Review and potentially disable flows during bulk data loads; test flow behavior.";
        }
        if (title.includes("validation")) {
          return "Review validation rules; consider temporarily disabling during data loads if appropriate.";
        }
        if (title.includes("coverage")) {
          return "Develop test classes to increase code coverage; target ≥75% coverage for production deployment.";
        }
      }
      return "Review finding details and apply appropriate remediation based on object-specific requirements.";
  }
}

export function generateTechnicalReportMarkdown(scan: ScanOutput, org?: OrgInfo): string {
  const h = scan.health;
  const src = scan?.source || (scan as any)?.source_profile || {};
  const inv: any = scan?.inventory || {};
  const schema = inv?.sourceObjects || inv?.schema || [];
  const automation = inv?.automation || {};
  const reporting = inv?.reporting || {};
  const ownership = inv?.ownership || {};
  const findings = scan?.findings || [];
  const summary = scan?.summary || {};
  const flowSummary = (automation as any)?.flowSummary || {};
  const code = inv?.code || {};

  const lines: string[] = [];

  lines.push(`# Salesforce Org Technical Report`);
  lines.push(``);
  lines.push(`**Organization:** ${safe(org?.name)}`);
  lines.push(`**Edition:** ${safe(org?.edition)}`);
  lines.push(`**Instance:** ${safe(org?.instanceUrl || org?.myDomain)}`);
  if (summary?.orgId || src?.orgId) {
    lines.push(`**Org Id:** ${safe(summary.orgId || src.orgId)}`);
  }
  lines.push(``);

  // 1. Overview
  lines.push(`## 1. Overview & Scan Inputs`);
  lines.push(`- Objects discovered: ${safe(summary?.objects ?? schema?.length)}.`);
  if (summary?.recordsApprox) {
    lines.push(`- Approximate records scanned: ${safe(summary.recordsApprox.toLocaleString())}.`);
  }
  if (code?.apexClasses?.length !== undefined) {
    lines.push(`- Apex classes: ${safe(code.apexClasses.length)}; Triggers: ${safe(code?.apexTriggers?.length || automation?.triggers?.length || 0)}.`);
  }
  if (flowSummary?.total !== undefined) {
    lines.push(`- Flows (total/active): ${safe(flowSummary.total)}/${safe(flowSummary.active)} (method: ${safe(flowSummary.method)})`);
  }
  const storage = src?.storage;
  if (storage?.data?.usedPct !== undefined || storage?.file?.usedPct !== undefined) {
    lines.push(`- Storage usage: Data ${pct(storage.data?.usedPct)}; Files ${pct(storage.file?.usedPct)}.`);
  }
  lines.push(``);

  // 2. Metadata Inventory
  lines.push(`## 2. Metadata Inventory`);
  lines.push(`### 2.1 Objects & Fields`);
  lines.push(`- Total objects: ${safe(schema?.length)} (custom vs standard counted in scan).`);
  if (Array.isArray(schema) && schema.length > 0) {
    const customCount = schema.filter((o: any) => o?.isCustom).length;
    const standardCount = schema.length - customCount;
    lines.push(`- Custom objects: ${customCount}; Standard objects: ${standardCount}.`);
  }
  lines.push(`- Field types: tracked per object including Formula, Lookup, Rollup, Autonumber.`);
  lines.push(``);

  lines.push(`### 2.2 Picklists & Record Types`);
  if (Array.isArray(schema)) {
    const totalPicklists = schema.reduce((sum: number, o: any) => sum + (o?.picklists?.length || 0), 0);
    const totalRecordTypes = schema.reduce((sum: number, o: any) => sum + (o?.recordTypes?.length || 0), 0);
    lines.push(`- Total picklists: ${totalPicklists}; Total record types: ${totalRecordTypes}.`);
  }
  lines.push(`- Picklist sources (Global/Standard Value Sets) and per-object values captured.`);
  lines.push(`- Record types per object captured with developer names.`);
  lines.push(``);

  lines.push(`### 2.3 Relationships`);
  if (Array.isArray(schema)) {
    const totalLookups = schema.reduce((sum: number, o: any) => sum + (o?.lookups?.length || 0), 0);
    const masterDetailCount = schema.reduce(
      (sum: number, o: any) => sum + (o?.lookups?.filter((l: any) => l?.isMasterDetail)?.length || 0),
      0
    );
    lines.push(`- Total lookups: ${totalLookups} (${masterDetailCount} Master-Detail).`);
  }
  lines.push(`- Lookups/Master-Detail indexed with relationship names and targets.`);
  lines.push(``);

  lines.push(`### 2.4 Automation`);
  const vrCount = Array.isArray(automation?.validationRules)
    ? automation.validationRules.length
    : (automation?.validationRules as any)?.total ?? 0;
  const wrCount = Array.isArray(automation?.workflowRules)
    ? automation.workflowRules.length
    : (automation?.workflowRules as any)?.total ?? 0;
  lines.push(`- Flows: ${safe(flowSummary?.total ?? automation?.flows?.length ?? 0)} total, ${safe(flowSummary?.active ?? automation?.flows?.filter((f: any) => f.status === "Active")?.length ?? 0)} active.`);
  lines.push(`- Validation Rules: ${safe(vrCount)}.`);
  lines.push(`- Triggers: ${safe(automation?.triggers?.length ?? 0)}.`);
  lines.push(`- Workflow Rules: ${safe(wrCount)}.`);
  lines.push(`- Process builders flagged if present.`);
  lines.push(``);

  lines.push(`### 2.5 Profiles, Permission Sets, Sharing Model`);
  const security = inv?.security || {};
  lines.push(`- Profiles: ${safe(security?.profiles?.length ?? 0)}; Permission Sets: ${safe(security?.permissionSets?.length ?? 0)}.`);
  lines.push(`- Field-level/object-level access (summary), roles, queues, and selected sharing rules indexed.`);
  lines.push(``);

  lines.push(`### 2.6 Reporting & Code`);
  lines.push(`- Email templates: ${safe(reporting?.emailTemplates?.length ?? 0)}; Reports: ${safe(reporting?.reports?.length ?? 0)}; Dashboards: ${safe(reporting?.dashboards?.length ?? 0)}.`);
  lines.push(`- Apex classes/triggers; API versions in use; (optional) code coverage if available.`);
  if (code?.coverage?.orgWidePercent !== undefined && code.coverage.orgWidePercent !== null) {
    lines.push(`- Code coverage: ${pct(code.coverage.orgWidePercent)} org-wide.`);
  }
  lines.push(``);

  // 3. Data Inventory
  lines.push(`## 3. Data Inventory & Volumes`);
  lines.push(`- High-volume objects (≥100k records) identified with migration notes.`);
  lines.push(`- AutoNumber fields across objects tracked for legacy preservation.`);
  lines.push(``);

  lines.push(`### 3.1 High-Volume Objects (sample)`);
  lines.push(`| Object | Records | Notes |`);
  lines.push(`|--------|---------|-------|`);
  const hv = Array.isArray(schema)
    ? schema
        .filter((o: any) => (o?.recordCount || o?.record_count || 0) >= 100000)
        .sort((a: any, b: any) => (b?.recordCount || b?.record_count || 0) - (a?.recordCount || a?.record_count || 0))
        .slice(0, 15)
    : [];
  if (hv.length) {
    hv.forEach((o: any) => {
      lines.push(`| ${safe(o?.name || o?.apiName || o?.api_name)} | ${safe((o?.recordCount || o?.record_count || 0).toLocaleString())} | Bulk API 2.0; staged loads; parent→child order |`);
    });
  } else {
    lines.push(`| — | — | — |`);
  }
  lines.push(``);

  // 4. Automation Deep Dive
  lines.push(`## 4. Automation Deep Dive`);
  lines.push(`- Flows (total/active): ${safe(flowSummary?.total)}/${safe(flowSummary?.active)} (source: ${safe(flowSummary?.method)})`);
  if (Array.isArray(automation?.flows) && automation.flows.length > 0) {
    lines.push(`### 4.1 Flows (sample)`);
    lines.push(`| DeveloperName | Status | ProcessType | Object |`);
    lines.push(`|---------------|--------|-------------|--------|`);
    automation.flows.slice(0, 30).forEach((f: any) => {
      lines.push(`| ${safe(f?.developerName || f?.DeveloperName)} | ${safe(f?.status || f?.Status)} | ${safe(f?.processType || f?.ProcessType)} | ${safe(f?.object || f?.Object)} |`);
    });
    if (automation.flows.length > 30) {
      lines.push(`_... ${automation.flows.length - 30} more_`);
    }
  } else {
    lines.push(`_Flows list not available in current scan._`);
  }
  lines.push(``);

  // 5. Validation Rules & Triggers
  lines.push(`## 5. Validation Rules & Triggers`);
  if (vrCount > 0) {
    lines.push(`- Validation rules: ${safe(vrCount)} total.`);
    if (Array.isArray(automation?.validationRules) && automation.validationRules.length > 0) {
      lines.push(`- Validation rules captured per object; review counts and complexity hotspots.`);
    }
  }
  if (Array.isArray(automation?.triggers) && automation.triggers.length > 0) {
    lines.push(`### 5.1 Triggers (sample)`);
    lines.push(`| Object | Name | Status |`);
    lines.push(`|--------|------|--------|`);
    automation.triggers.slice(0, 30).forEach((t: any) => {
      lines.push(`| ${safe(t?.tableEnumOrId || t?.TableEnumOrId || t?.tableEnum)} | ${safe(t?.name || t?.Name)} | ${safe(t?.status || (t?.IsActive ? "Active" : "Inactive"))} |`);
    });
    if (automation.triggers.length > 30) {
      lines.push(`_... ${automation.triggers.length - 30} more_`);
    }
  } else {
    lines.push(`_Triggers list not available in current scan._`);
  }
  lines.push(``);

  // 6. Security & Access Model
  lines.push(`## 6. Security & Access Model`);
  lines.push(`- Profiles vs Permission Sets summary; admin-like profiles flagged; users without roles flagged if available.`);
  lines.push(`- Roles/Queues summary, key sharing rules noted.`);
  if (security?.profiles?.length || security?.permissionSets?.length) {
    const adminProfiles = (security.profiles || []).filter((p: any) => {
      const name = (p?.name || "").toLowerCase();
      return name.includes("admin") || name.includes("system");
    }).length;
    lines.push(`- Admin-like profiles detected: ${adminProfiles}.`);
  }
  lines.push(``);

  // 7. Limits & Performance Signals
  lines.push(`## 7. Limits & Performance Signals`);
  const limits = (summary as any)?.limits || {};
  lines.push(`- API usage (24h): ${pct(limits?.apiUsagePct || (summary as any)?.apiUsagePct)}; Async Apex usage: ${pct(limits?.asyncApexUsagePct || (summary as any)?.asyncApexUsagePct)}; Concurrent Batches: ${safe(limits?.concurrentBatchJobs ?? (summary as any)?.concurrentBatchJobs ?? "N/A")}.`);
  lines.push(``);

  // 8. Findings → Remediation
  lines.push(`## 8. Findings and Remediation Plan`);
  if (Array.isArray(findings) && findings.length > 0) {
    lines.push(`**Total Findings:** ${findings.length}`);
    lines.push(``);
    lines.push(`| Code | Severity | Objects | Description | Recommended Remediation |`);
    lines.push(`|------|----------|---------|-------------|-------------------------|`);
    // Show ALL findings, no truncation
    findings.forEach((f: any) => {
      const remediation = getRemediationForFinding(f);
      const description = f?.description || f?.title || "—";
      const descriptionShort = description.length > 150 ? description.substring(0, 150) + "..." : description;
      lines.push(`| ${safe(f?.code || f?.id)} | ${safe(f?.severity)} | ${Array.isArray(f?.objects) ? f.objects.slice(0, 3).join(", ") + (f.objects.length > 3 ? ` (+${f.objects.length - 3} more)` : "") : safe(f?.object || "—")} | ${safe(descriptionShort)} | ${safe(remediation)} |`);
    });
  } else {
    lines.push(`_No findings attached to this scan._`);
  }
  lines.push(``);

  // 9. Migration Impacts & Dependency Notes
  lines.push(`## 9. Migration Impacts & Dependency Notes`);
  lines.push(``);
  
  lines.push(`### 9.1 AutoNumber Field Handling`);
  lines.push(`Auto-number fields cannot be migrated directly as they are system-generated. New records in the target org will receive new auto-numbers, breaking any sequential numbering requirements.`);
  lines.push(``);
  lines.push(`**Recommended Strategy:**`);
  lines.push(`1. Create custom text fields (e.g., \`Legacy_AccountNumber__c\`) to preserve original numbers`);
  lines.push(`2. Backfill legacy numbers during data load using Bulk API 2.0`);
  lines.push(`3. Keep legacy number fields visible on key page layouts for reference`);
  lines.push(`4. Update any integrations or reports that depend on sequential numbering`);
  lines.push(`5. Document the original auto-number format and starting number for audit purposes`);
  lines.push(``);
  
  lines.push(`### 9.2 Data Load Order Dependencies`);
  lines.push(`Master-detail relationships require parent records to exist before child records can be created. Incorrect load order will cause migration failures.`);
  lines.push(``);
  lines.push(`**Load Sequence Strategy:**`);
  lines.push(`1. **Phase 1 - Foundation Objects:** Load standard objects (Account, Contact, User) and custom objects with no dependencies`);
  lines.push(`2. **Phase 2 - Parent Objects:** Load all parent objects in master-detail relationships`);
  lines.push(`3. **Phase 3 - Child Objects:** Load child objects, ensuring parent external IDs are mapped correctly`);
  lines.push(`4. **Phase 4 - Junction Objects:** Load many-to-many relationship objects after both parent objects exist`);
  lines.push(`5. **Phase 5 - Dependent Records:** Load records with lookup relationships to previously loaded objects`);
  lines.push(``);
  lines.push(`**Validation:** After each phase, verify record counts, relationship integrity, and data quality before proceeding.`);
  lines.push(``);
  
  lines.push(`### 9.3 Automation Execution During Data Loads`);
  lines.push(`Active triggers, flows, and validation rules will execute during bulk data loads, potentially causing:`);
  lines.push(`- Performance degradation and governor limit errors`);
  lines.push(`- Validation failures blocking record creation`);
  lines.push(`- Unintended side effects (emails, field updates, related record creation)`);
  lines.push(`- Cascading automation execution on related objects`);
  lines.push(``);
  lines.push(`**Mitigation Strategy:**`);
  lines.push(`1. **Pre-Migration Audit:** Document all active automation on high-volume objects`);
  lines.push(`2. **Selective Deactivation:** Temporarily disable non-critical triggers/flows during bulk loads`);
  lines.push(`3. **Validation Rule Toggle:** Create custom settings to bypass validation rules during migration`);
  lines.push(`4. **Test Loads:** Execute sample data loads to identify automation blockers`);
  lines.push(`5. **Monitoring:** Track governor limit usage and automation execution during loads`);
  lines.push(`6. **Re-activation Plan:** Document re-activation sequence after data migration completes`);
  lines.push(``);
  
  lines.push(`### 9.4 Owner and Queue Dependencies`);
  lines.push(`Records require valid owners (Users) or Queues to be assigned. Missing owners will cause migration failures.`);
  lines.push(``);
  lines.push(`**Prerequisites:**`);
  lines.push(`1. **User Mapping:** Create user mapping table (source User ID → target User ID) before migration`);
  lines.push(`2. **Queue Creation:** Ensure all queues referenced in source data exist in target org`);
  lines.push(`3. **Default Owner:** Identify default user/queue for records with invalid owners`);
  lines.push(`4. **Ownership Validation:** Run data quality checks to identify records with missing/invalid owners`);
  lines.push(`5. **Assignment Rules:** Document and replicate lead/case assignment rules in target org`);
  lines.push(``);
  
  lines.push(`### 9.5 Picklist and Value Set Alignment`);
  lines.push(`Picklist values must exist in the target org before records can be loaded. Mismatched values will cause data load failures.`);
  lines.push(``);
  lines.push(`**Alignment Strategy:**`);
  lines.push(`1. **Inventory:** Document all picklist fields and their values per object`);
  lines.push(`2. **Global Value Sets:** Identify shared value sets used across multiple objects`);
  lines.push(`3. **Value Comparison:** Compare source and target picklist values (requires target org metadata scan)`);
  lines.push(`4. **Value Creation:** Add missing picklist values in target org before data load`);
  lines.push(`5. **Value Mapping:** Create mapping table for renamed or restructured picklist values`);
  lines.push(`6. **Data Transformation:** Update source data to match target picklist values if necessary`);
  lines.push(``);
  
  lines.push(`### 9.6 External ID Requirements`);
  lines.push(`External ID fields are critical for maintaining relationships and enabling upsert operations during migration.`);
  lines.push(``);
  lines.push(`**Best Practices:**`);
  lines.push(`1. **Identify External IDs:** Document all existing external ID fields in source org`);
  lines.push(`2. **Create Missing External IDs:** Add external ID fields to objects that lack them (especially custom objects)`);
  lines.push(`3. **Populate External IDs:** Ensure source data has values in external ID fields before migration`);
  lines.push(`4. **Relationship Mapping:** Use external IDs to maintain lookup and master-detail relationships`);
  lines.push(`5. **Upsert Strategy:** Use upsert operations with external IDs to handle updates and new records`);
  lines.push(``);
  
  lines.push(`### 9.7 Required Fields Without Defaults`);
  lines.push(`Required fields without default values must have data in source records or migration will fail.`);
  lines.push(``);
  lines.push(`**Data Quality Prerequisites:**`);
  lines.push(`1. **Field Inventory:** Identify all required fields without defaults per object`);
  lines.push(`2. **Data Completeness Check:** Run queries to identify records missing required field values`);
  lines.push(`3. **Data Remediation:** Populate missing values in source data before migration`);
  lines.push(`4. **Default Value Strategy:** Consider adding default values in target org if business-appropriate`);
  lines.push(`5. **Transformation Rules:** Create data transformation logic to populate required fields from other fields`);
  lines.push(``);
  
  lines.push(`### 9.8 High-Volume Object Migration Strategy`);
  lines.push(`Objects with ≥100,000 records require specialized migration approaches to avoid timeouts and governor limit errors.`);
  lines.push(``);
  lines.push(`**Bulk API 2.0 Best Practices:**`);
  lines.push(`1. **Batch Size:** Use optimal batch sizes (5,000-10,000 records) based on field count and complexity`);
  lines.push(`2. **Parallelization:** Run multiple batches in parallel while respecting concurrent batch limits`);
  lines.push(`3. **Retry Logic:** Implement exponential backoff for failed batches`);
  lines.push(`4. **Dead Letter Queue:** Capture failed records for manual review and retry`);
  lines.push(`5. **Progress Tracking:** Monitor batch status and record success/failure rates`);
  lines.push(`6. **Data Validation:** Verify record counts and data integrity after each batch`);
  lines.push(``);
  
  lines.push(``);

  // 10. Best-Practice Appendix
  lines.push(`## 10. Best-Practice Appendix (Technical)`);
  lines.push(``);
  
  lines.push(`### 10.1 Trigger Architecture Patterns`);
  lines.push(`**Single Trigger Per Object Pattern:**`);
  lines.push(`- Implement one trigger per object that routes to a handler class`);
  lines.push(`- Use before/after context separation (beforeInsert, afterUpdate, etc.)`);
  lines.push(`- Implement ordered execution for multiple operations`);
  lines.push(`- Add comprehensive unit tests with ≥75% code coverage`);
  lines.push(`- Enforce code ownership and peer review processes`);
  lines.push(`- Document trigger execution order and dependencies`);
  lines.push(``);
  lines.push(`**Trigger Handler Framework Example:**`);
  lines.push(`\`\`\`apex`);
  lines.push(`public class AccountTriggerHandler {`);
  lines.push(`  public static void beforeInsert(List<Account> accounts) {`);
  lines.push(`    // Validation and field population logic`);
  lines.push(`  }`);
  lines.push(`  public static void afterInsert(List<Account> accounts) {`);
  lines.push(`    // Related record creation, integration calls`);
  lines.push(`  }`);
  lines.push(`}\`\`\``);
  lines.push(``);
  
  lines.push(`### 10.2 Automation Best Practices`);
  lines.push(`**Flow-First Strategy:**`);
  lines.push(`- Prefer record-triggered Flows over Apex triggers for business logic`);
  lines.push(`- Use Flows for declarative automation (field updates, record creation, email alerts)`);
  lines.push(`- Reserve Apex for complex logic, external integrations, and bulk operations`);
  lines.push(`- Migrate existing Workflow Rules and Process Builders to Flows`);
  lines.push(`- Implement version control for Flows using Metadata API or CI/CD pipelines`);
  lines.push(`- Document flow entry criteria and execution conditions`);
  lines.push(`- Test flows with various data scenarios before deployment`);
  lines.push(``);
  lines.push(`**Process Builder Migration:**`);
  lines.push(`- Process Builders are deprecated; migrate to record-triggered Flows`);
  lines.push(`- Map Process Builder criteria to Flow decision elements`);
  lines.push(`- Convert Process Builder actions to Flow action elements`);
  lines.push(`- Test migrated flows thoroughly before deactivating Process Builders`);
  lines.push(``);
  
  lines.push(`### 10.3 Data Management Strategies`);
  lines.push(`**Storage Optimization:**`);
  lines.push(`- Maintain data storage usage below 85% to allow for growth`);
  lines.push(`- Implement archival jobs for historical data using Batch Apex or scheduled Flows`);
  lines.push(`- Use Big Objects for high-volume, append-only data (logs, events, audit trails)`);
  lines.push(`- Purge orphaned ContentDocuments and attachments regularly`);
  lines.push(`- Consider external storage/CDN for large binary files`);
  lines.push(`- Monitor storage usage trends and plan capacity increases proactively`);
  lines.push(``);
  lines.push(`**Data Quality Management:**`);
  lines.push(`- Implement validation rules on critical objects to enforce data quality`);
  lines.push(`- Use duplicate management rules to prevent duplicate records`);
  lines.push(`- Create data quality dashboards to monitor completeness and accuracy`);
  lines.push(`- Schedule regular data cleanup jobs for stale or invalid records`);
  lines.push(`- Document data retention policies and implement automated deletion`);
  lines.push(``);
  lines.push(`**Bulk API 2.0 Strategy:**`);
  lines.push(`- Use Bulk API 2.0 for all data migration operations (faster, more reliable)`);
  lines.push(`- Implement proper error handling and retry logic`);
  lines.push(`- Monitor batch job status and handle partial failures gracefully`);
  lines.push(`- Use external IDs for upsert operations to handle updates and new records`);
  lines.push(`- Validate data before submission to reduce batch failures`);
  lines.push(``);
  
  lines.push(`### 10.4 Security Model Best Practices`);
  lines.push(`**Least Privilege Principle:**`);
  lines.push(`- Minimize admin-like profiles; shift permissions to Permission Sets`);
  lines.push(`- Use Permission Sets for role-based access instead of profiles`);
  lines.push(`- Implement field-level security to restrict sensitive data access`);
  lines.push(`- Use sharing rules and manual sharing for record-level access control`);
  lines.push(`- Remove "Modify All" and "View All Data" permissions except for system admins`);
  lines.push(`- Conduct quarterly access reviews to identify and remove unnecessary permissions`);
  lines.push(``);
  lines.push(`**Guest User Security:**`);
  lines.push(`- Restrict guest user permissions to minimum required for public access`);
  lines.push(`- Remove Modify All permissions from guest users`);
  lines.push(`- Use sharing sets for Experience Cloud sites instead of org-wide defaults`);
  lines.push(`- Implement custom permissions and flow checks for guest user actions`);
  lines.push(`- Regularly audit guest user access and permissions`);
  lines.push(``);
  lines.push(`**Role Hierarchy and Sharing:**`);
  lines.push(`- Design role hierarchy to reflect organizational structure`);
  lines.push(`- Use public groups for sharing rule criteria`);
  lines.push(`- Document sharing model and access patterns`);
  lines.push(`- Test sharing rules with various user scenarios`);
  lines.push(`- Monitor sharing rule performance and optimize as needed`);
  lines.push(``);
  
  lines.push(`### 10.5 Performance and Limits Optimization`);
  lines.push(`**API Call Optimization:**`);
  lines.push(`- Reduce polling frequency; implement caching where appropriate`);
  lines.push(`- Use change data capture (CDC) or Platform Events for real-time updates`);
  lines.push(`- Prefer event-driven integration patterns over scheduled polling`);
  lines.push(`- Implement exponential backoff for API retries`);
  lines.push(`- Monitor API usage trends and optimize integration schedules`);
  lines.push(``);
  lines.push(`**Async Apex Management:**`);
  lines.push(`- Consolidate queueable and batch jobs to reduce concurrent execution`);
  lines.push(`- Stagger scheduled jobs to avoid governor limit conflicts`);
  lines.push(`- Use Platform Events for decoupled, scalable automation`);
  lines.push(`- Monitor async job queue depth and execution times`);
  lines.push(`- Implement job chaining for complex multi-step processes`);
  lines.push(``);
  lines.push(`**Governor Limit Best Practices:**`);
  lines.push(`- Design code to operate within governor limits (SOQL queries, DML statements, CPU time)`);
  lines.push(`- Use bulkification patterns to process records in batches`);
  lines.push(`- Cache describe calls and metadata to reduce API calls`);
  lines.push(`- Monitor limit usage in production and optimize hot paths`);
  lines.push(`- Implement circuit breakers for external API calls`);
  lines.push(``);
  
  lines.push(`### 10.6 Testing and Quality Assurance`);
  lines.push(`**Code Coverage Requirements:**`);
  lines.push(`- Maintain ≥75% org-wide code coverage for production deployments`);
  lines.push(`- Target 100% coverage for critical business logic`);
  lines.push(`- Use test factories to create test data efficiently`);
  lines.push(`- Test both positive and negative scenarios`);
  lines.push(`- Implement test data builders for complex object hierarchies`);
  lines.push(`- Enforce coverage gates in CI/CD pipelines`);
  lines.push(``);
  lines.push(`**Integration Testing:**`);
  lines.push(`- Test automation execution with various data scenarios`);
  lines.push(`- Validate trigger and flow behavior with bulk operations`);
  lines.push(`- Test sharing rules and security model with different user contexts`);
  lines.push(`- Perform load testing for high-volume objects`);
  lines.push(`- Test error handling and recovery scenarios`);
  lines.push(``);
  
  lines.push(`### 10.7 Deployment and Change Management`);
  lines.push(`**Version Control:**`);
  lines.push(`- Use version control (Git) for all metadata (Apex, Flows, Profiles, etc.)`);
  lines.push(`- Implement CI/CD pipelines for automated deployments`);
  lines.push(`- Use source tracking to identify changes between environments`);
  lines.push(`- Document deployment procedures and rollback plans`);
  lines.push(`- Perform deployments during maintenance windows when possible`);
  lines.push(``);
  lines.push(`**API Version Management:**`);
  lines.push(`- Keep Apex, Flow, and Metadata API versions within 2 releases of current`);
  lines.push(`- Test API version upgrades in sandbox before production`);
  lines.push(`- Document API version dependencies and upgrade impact`);
  lines.push(`- Plan for deprecated feature migration (Process Builder, Workflow Rules)`);
  lines.push(``);
  
  lines.push(`### 10.8 Monitoring and Observability`);
  lines.push(`**Performance Monitoring:**`);
  lines.push(`- Set up custom dashboards for key metrics (API usage, storage, automation execution)`);
  lines.push(`- Monitor Apex execution times and identify slow queries`);
  lines.push(`- Track flow execution and identify performance bottlenecks`);
  lines.push(`- Set up alerts for governor limit usage approaching thresholds`);
  lines.push(`- Monitor data quality metrics (completeness, accuracy, duplicates)`);
  lines.push(``);
  lines.push(`**Error Tracking:**`);
  lines.push(`- Implement centralized error logging (custom objects, external services)`);
  lines.push(`- Set up alerts for critical errors and automation failures`);
  lines.push(`- Track and analyze error patterns to identify systemic issues`);
  lines.push(`- Document error resolution procedures and runbooks`);
  lines.push(``);

  return lines.join("\n");
}

export function generateTechnicalReportHTML(scan: ScanOutput, org?: OrgInfo): string {
  const escapeHtml = (text: string) => {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const h = scan.health;
  const src = scan?.source || (scan as any)?.source_profile || {};
  const inv: any = scan?.inventory || {};
  const schema = inv?.sourceObjects || inv?.schema || [];
  const automation = inv?.automation || {};
  const reporting = inv?.reporting || {};
  const ownership = inv?.ownership || {};
  const findings = scan?.findings || [];
  const summary = scan?.summary || {};
  const flowSummary = (automation as any)?.flowSummary || {};
  const code = inv?.code || {};
  const security = inv?.security || {};

  let html = `
    <div style="max-width: 1000px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h1 style="color: #1e40af; font-size: 32px; margin-bottom: 10px; border-bottom: 3px solid #3b82f6; padding-bottom: 15px;">
        Salesforce Org Technical Report
      </h1>
      
      <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-left: 4px solid #3b82f6; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Organization:</strong> ${escapeHtml(safe(org?.name))}</p>
        <p style="margin: 5px 0;"><strong>Edition:</strong> ${escapeHtml(safe(org?.edition))}</p>
        <p style="margin: 5px 0;"><strong>Instance:</strong> ${escapeHtml(safe(org?.instanceUrl || org?.myDomain))}</p>
        ${summary?.orgId || src?.orgId ? `<p style="margin: 5px 0;"><strong>Org Id:</strong> ${escapeHtml(safe(summary.orgId || src.orgId))}</p>` : ""}
      </div>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        1. Overview & Scan Inputs
      </h2>
      <ul style="margin: 15px 0; padding-left: 30px;">
        <li style="margin: 8px 0;">Objects discovered: ${safe(summary?.objects ?? schema?.length)}.</li>
        ${summary?.recordsApprox ? `<li style="margin: 8px 0;">Approximate records scanned: ${safe(summary.recordsApprox.toLocaleString())}.</li>` : ""}
        ${code?.apexClasses?.length !== undefined ? `<li style="margin: 8px 0;">Apex classes: ${safe(code.apexClasses.length)}; Triggers: ${safe(code?.apexTriggers?.length || automation?.triggers?.length || 0)}.</li>` : ""}
        ${flowSummary?.total !== undefined ? `<li style="margin: 8px 0;">Flows (total/active): ${safe(flowSummary.total)}/${safe(flowSummary.active)} (method: ${safe(flowSummary.method)})</li>` : ""}
        ${src?.storage?.data?.usedPct !== undefined || src?.storage?.file?.usedPct !== undefined ? `<li style="margin: 8px 0;">Storage usage: Data ${pct(src.storage.data?.usedPct)}; Files ${pct(src.storage.file?.usedPct)}.</li>` : ""}
      </ul>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        2. Metadata Inventory
      </h2>
      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.1 Objects & Fields</h3>
      <p>Total objects: ${safe(schema?.length)} (custom vs standard counted in scan).</p>
      ${Array.isArray(schema) && schema.length > 0 ? `<p>Custom objects: ${schema.filter((o: any) => o?.isCustom).length}; Standard objects: ${schema.length - schema.filter((o: any) => o?.isCustom).length}.</p>` : ""}
      <p>Field types: tracked per object including Formula, Lookup, Rollup, Autonumber.</p>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.2 Picklists & Record Types</h3>
      ${Array.isArray(schema) ? `<p>Total picklists: ${schema.reduce((sum: number, o: any) => sum + (o?.picklists?.length || 0), 0)}; Total record types: ${schema.reduce((sum: number, o: any) => sum + (o?.recordTypes?.length || 0), 0)}.</p>` : ""}
      <p>Picklist sources (Global/Standard Value Sets) and per-object values captured.</p>
      <p>Record types per object captured with developer names.</p>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.3 Relationships</h3>
      ${Array.isArray(schema) ? `<p>Total lookups: ${schema.reduce((sum: number, o: any) => sum + (o?.lookups?.length || 0), 0)} (${schema.reduce((sum: number, o: any) => sum + (o?.lookups?.filter((l: any) => l?.isMasterDetail)?.length || 0), 0)} Master-Detail).</p>` : ""}
      <p>Lookups/Master-Detail indexed with relationship names and targets.</p>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.4 Automation</h3>
      ${(() => {
        const vrCount = Array.isArray(automation?.validationRules) ? automation.validationRules.length : (automation?.validationRules as any)?.total ?? 0;
        const wrCount = Array.isArray(automation?.workflowRules) ? automation.workflowRules.length : (automation?.workflowRules as any)?.total ?? 0;
        return `<p>Flows: ${safe(flowSummary?.total ?? automation?.flows?.length ?? 0)} total, ${safe(flowSummary?.active ?? automation?.flows?.filter((f: any) => f.status === "Active")?.length ?? 0)} active.</p>
        <p>Validation Rules: ${safe(vrCount)}.</p>
        <p>Triggers: ${safe(automation?.triggers?.length ?? 0)}.</p>
        <p>Workflow Rules: ${safe(wrCount)}.</p>
        <p>Process builders flagged if present.</p>`;
      })()}

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.5 Profiles, Permission Sets, Sharing Model</h3>
      <p>Profiles: ${safe(security?.profiles?.length ?? 0)}; Permission Sets: ${safe(security?.permissionSets?.length ?? 0)}.</p>
      <p>Field-level/object-level access (summary), roles, queues, and selected sharing rules indexed.</p>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">2.6 Reporting & Code</h3>
      <p>Email templates: ${safe(reporting?.emailTemplates?.length ?? 0)}; Reports: ${safe(reporting?.reports?.length ?? 0)}; Dashboards: ${safe(reporting?.dashboards?.length ?? 0)}.</p>
      <p>Apex classes/triggers; API versions in use; (optional) code coverage if available.</p>
      ${code?.coverage?.orgWidePercent !== undefined && code.coverage.orgWidePercent !== null ? `<p>Code coverage: ${pct(code.coverage.orgWidePercent)} org-wide.</p>` : ""}

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        3. Data Inventory & Volumes
      </h2>
      <p>High-volume objects (≥100k records) identified with migration notes.</p>
      <p>AutoNumber fields across objects tracked for legacy preservation.</p>
      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">3.1 High-Volume Objects (sample)</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Object</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Records</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Notes</th>
          </tr>
        </thead>
        <tbody>
  `;

  const hv = Array.isArray(schema)
    ? schema
        .filter((o: any) => (o?.recordCount || o?.record_count || 0) >= 100000)
        .sort((a: any, b: any) => (b?.recordCount || b?.record_count || 0) - (a?.recordCount || a?.record_count || 0))
        .slice(0, 15)
    : [];

  if (hv.length) {
    hv.forEach((o: any, idx: number) => {
      html += `
          <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(o?.name || o?.apiName || o?.api_name))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe((o?.recordCount || o?.record_count || 0).toLocaleString()))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">Bulk API 2.0; staged loads; parent→child order</td>
          </tr>
      `;
    });
  } else {
    html += `
          <tr style="background-color: #ffffff;">
            <td style="border: 1px solid #e5e7eb; padding: 12px;">—</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">—</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">—</td>
          </tr>
    `;
  }

  html += `
        </tbody>
      </table>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        4. Automation Deep Dive
      </h2>
      <p>Flows (total/active): ${safe(flowSummary?.total)}/${safe(flowSummary?.active)} (source: ${safe(flowSummary?.method)})</p>
  `;

  if (Array.isArray(automation?.flows) && automation.flows.length > 0) {
    html += `
      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">4.1 Flows (sample)</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">DeveloperName</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Status</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">ProcessType</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Object</th>
          </tr>
        </thead>
        <tbody>
    `;
    automation.flows.slice(0, 30).forEach((f: any, idx: number) => {
      html += `
          <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(f?.developerName || f?.DeveloperName))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(f?.status || f?.Status))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(f?.processType || f?.ProcessType))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(f?.object || f?.Object))}</td>
          </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
    if (automation.flows.length > 30) {
      html += `<p style="color: #6b7280; font-style: italic;">... ${automation.flows.length - 30} more</p>`;
    }
  } else {
    html += `<p style="color: #6b7280; font-style: italic;">Flows list not available in current scan.</p>`;
  }

  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        5. Validation Rules & Triggers
      </h2>
  `;

  const vrCount = Array.isArray(automation?.validationRules)
    ? automation.validationRules.length
    : (automation?.validationRules as any)?.total ?? 0;
  if (vrCount > 0) {
    html += `<p>Validation rules: ${safe(vrCount)} total.</p>`;
  }

  if (Array.isArray(automation?.triggers) && automation.triggers.length > 0) {
    html += `
      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">5.1 Triggers (sample)</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Object</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Name</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    automation.triggers.slice(0, 30).forEach((t: any, idx: number) => {
      html += `
          <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(t?.tableEnumOrId || t?.TableEnumOrId || t?.tableEnum))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(t?.name || t?.Name))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">${escapeHtml(safe(t?.status || (t?.IsActive ? "Active" : "Inactive")))}</td>
          </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
    if (automation.triggers.length > 30) {
      html += `<p style="color: #6b7280; font-style: italic;">... ${automation.triggers.length - 30} more</p>`;
    }
  } else {
    html += `<p style="color: #6b7280; font-style: italic;">Triggers list not available in current scan.</p>`;
  }

  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        6. Security & Access Model
      </h2>
      <p>Profiles vs Permission Sets summary; admin-like profiles flagged; users without roles flagged if available.</p>
      <p>Roles/Queues summary, key sharing rules noted.</p>
  `;

  if (security?.profiles?.length || security?.permissionSets?.length) {
    const adminProfiles = (security.profiles || []).filter((p: any) => {
      const name = (p?.name || "").toLowerCase();
      return name.includes("admin") || name.includes("system");
    }).length;
    html += `<p>Admin-like profiles detected: ${adminProfiles}.</p>`;
  }

  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        7. Limits & Performance Signals
      </h2>
      <p>API usage (24h): ${pct((summary as any)?.limits?.apiUsagePct || (summary as any)?.apiUsagePct)}; Async Apex usage: ${pct((summary as any)?.limits?.asyncApexUsagePct || (summary as any)?.asyncApexUsagePct)}; Concurrent Batches: ${safe((summary as any)?.limits?.concurrentBatchJobs ?? (summary as any)?.concurrentBatchJobs ?? "N/A")}.</p>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        8. Findings and Remediation Plan
      </h2>
  `;

  if (Array.isArray(findings) && findings.length > 0) {
    html += `<p style="margin-bottom: 15px;"><strong>Total Findings:</strong> ${findings.length}</p>`;
    html += `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); table-layout: fixed;">
        <colgroup>
          <col style="width: 12%;">
          <col style="width: 8%;">
          <col style="width: 12%;">
          <col style="width: 23%;">
          <col style="width: 45%;">
        </colgroup>
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Code</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Severity</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Objects</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Description</th>
            <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-weight: 600;">Recommended Remediation</th>
          </tr>
        </thead>
        <tbody>
    `;
    // Show ALL findings, no truncation
    findings.forEach((f: any, idx: number) => {
      const remediation = getRemediationForFinding(f);
      const description = f?.description || f?.title || "—";
      const descriptionShort = description.length > 120 ? description.substring(0, 120) + "..." : description;
      const objectsStr = Array.isArray(f?.objects) 
        ? f.objects.slice(0, 2).join(", ") + (f.objects.length > 2 ? ` (+${f.objects.length - 2})` : "")
        : safe(f?.object || "—");
      html += `
          <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-word;">${escapeHtml(safe(f?.code || f?.id))}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px;">
              <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; ${
                f?.severity === "HIGH" || f?.severity === "CRITICAL" ? "background-color: #fee2e2; color: #991b1b;" :
                f?.severity === "MEDIUM" ? "background-color: #fef3c7; color: #92400e;" :
                "background-color: #dbeafe; color: #1e40af;"
              }">${escapeHtml(safe(f?.severity))}</span>
            </td>
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 11px; word-break: break-word;">${escapeHtml(objectsStr)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 12px; word-break: break-word;">${escapeHtml(descriptionShort)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 13px; line-height: 1.6; word-break: break-word;">${escapeHtml(remediation)}</td>
          </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
  } else {
    html += `<p style="color: #6b7280; font-style: italic;">No findings attached to this scan.</p>`;
  }

  html += `
      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        9. Migration Impacts & Dependency Notes
      </h2>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.1 AutoNumber Field Handling</h3>
      <p>Auto-number fields cannot be migrated directly as they are system-generated. New records in the target org will receive new auto-numbers, breaking any sequential numbering requirements.</p>
      <p><strong>Recommended Strategy:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Create custom text fields (e.g., <code>Legacy_AccountNumber__c</code>) to preserve original numbers</li>
        <li style="margin: 8px 0;">Backfill legacy numbers during data load using Bulk API 2.0</li>
        <li style="margin: 8px 0;">Keep legacy number fields visible on key page layouts for reference</li>
        <li style="margin: 8px 0;">Update any integrations or reports that depend on sequential numbering</li>
        <li style="margin: 8px 0;">Document the original auto-number format and starting number for audit purposes</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.2 Data Load Order Dependencies</h3>
      <p>Master-detail relationships require parent records to exist before child records can be created. Incorrect load order will cause migration failures.</p>
      <p><strong>Load Sequence Strategy:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Phase 1 - Foundation Objects:</strong> Load standard objects (Account, Contact, User) and custom objects with no dependencies</li>
        <li style="margin: 8px 0;"><strong>Phase 2 - Parent Objects:</strong> Load all parent objects in master-detail relationships</li>
        <li style="margin: 8px 0;"><strong>Phase 3 - Child Objects:</strong> Load child objects, ensuring parent external IDs are mapped correctly</li>
        <li style="margin: 8px 0;"><strong>Phase 4 - Junction Objects:</strong> Load many-to-many relationship objects after both parent objects exist</li>
        <li style="margin: 8px 0;"><strong>Phase 5 - Dependent Records:</strong> Load records with lookup relationships to previously loaded objects</li>
      </ol>
      <p><strong>Validation:</strong> After each phase, verify record counts, relationship integrity, and data quality before proceeding.</p>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.3 Automation Execution During Data Loads</h3>
      <p>Active triggers, flows, and validation rules will execute during bulk data loads, potentially causing:</p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Performance degradation and governor limit errors</li>
        <li style="margin: 8px 0;">Validation failures blocking record creation</li>
        <li style="margin: 8px 0;">Unintended side effects (emails, field updates, related record creation)</li>
        <li style="margin: 8px 0;">Cascading automation execution on related objects</li>
      </ul>
      <p><strong>Mitigation Strategy:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Pre-Migration Audit:</strong> Document all active automation on high-volume objects</li>
        <li style="margin: 8px 0;"><strong>Selective Deactivation:</strong> Temporarily disable non-critical triggers/flows during bulk loads</li>
        <li style="margin: 8px 0;"><strong>Validation Rule Toggle:</strong> Create custom settings to bypass validation rules during migration</li>
        <li style="margin: 8px 0;"><strong>Test Loads:</strong> Execute sample data loads to identify automation blockers</li>
        <li style="margin: 8px 0;"><strong>Monitoring:</strong> Track governor limit usage and automation execution during loads</li>
        <li style="margin: 8px 0;"><strong>Re-activation Plan:</strong> Document re-activation sequence after data migration completes</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.4 Owner and Queue Dependencies</h3>
      <p>Records require valid owners (Users) or Queues to be assigned. Missing owners will cause migration failures.</p>
      <p><strong>Prerequisites:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>User Mapping:</strong> Create user mapping table (source User ID → target User ID) before migration</li>
        <li style="margin: 8px 0;"><strong>Queue Creation:</strong> Ensure all queues referenced in source data exist in target org</li>
        <li style="margin: 8px 0;"><strong>Default Owner:</strong> Identify default user/queue for records with invalid owners</li>
        <li style="margin: 8px 0;"><strong>Ownership Validation:</strong> Run data quality checks to identify records with missing/invalid owners</li>
        <li style="margin: 8px 0;"><strong>Assignment Rules:</strong> Document and replicate lead/case assignment rules in target org</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.5 Picklist and Value Set Alignment</h3>
      <p>Picklist values must exist in the target org before records can be loaded. Mismatched values will cause data load failures.</p>
      <p><strong>Alignment Strategy:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Inventory:</strong> Document all picklist fields and their values per object</li>
        <li style="margin: 8px 0;"><strong>Global Value Sets:</strong> Identify shared value sets used across multiple objects</li>
        <li style="margin: 8px 0;"><strong>Value Comparison:</strong> Compare source and target picklist values (requires target org metadata scan)</li>
        <li style="margin: 8px 0;"><strong>Value Creation:</strong> Add missing picklist values in target org before data load</li>
        <li style="margin: 8px 0;"><strong>Value Mapping:</strong> Create mapping table for renamed or restructured picklist values</li>
        <li style="margin: 8px 0;"><strong>Data Transformation:</strong> Update source data to match target picklist values if necessary</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.6 External ID Requirements</h3>
      <p>External ID fields are critical for maintaining relationships and enabling upsert operations during migration.</p>
      <p><strong>Best Practices:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Identify External IDs:</strong> Document all existing external ID fields in source org</li>
        <li style="margin: 8px 0;"><strong>Create Missing External IDs:</strong> Add external ID fields to objects that lack them (especially custom objects)</li>
        <li style="margin: 8px 0;"><strong>Populate External IDs:</strong> Ensure source data has values in external ID fields before migration</li>
        <li style="margin: 8px 0;"><strong>Relationship Mapping:</strong> Use external IDs to maintain lookup and master-detail relationships</li>
        <li style="margin: 8px 0;"><strong>Upsert Strategy:</strong> Use upsert operations with external IDs to handle updates and new records</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.7 Required Fields Without Defaults</h3>
      <p>Required fields without default values must have data in source records or migration will fail.</p>
      <p><strong>Data Quality Prerequisites:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Field Inventory:</strong> Identify all required fields without defaults per object</li>
        <li style="margin: 8px 0;"><strong>Data Completeness Check:</strong> Run queries to identify records missing required field values</li>
        <li style="margin: 8px 0;"><strong>Data Remediation:</strong> Populate missing values in source data before migration</li>
        <li style="margin: 8px 0;"><strong>Default Value Strategy:</strong> Consider adding default values in target org if business-appropriate</li>
        <li style="margin: 8px 0;"><strong>Transformation Rules:</strong> Create data transformation logic to populate required fields from other fields</li>
      </ol>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">9.8 High-Volume Object Migration Strategy</h3>
      <p>Objects with ≥100,000 records require specialized migration approaches to avoid timeouts and governor limit errors.</p>
      <p><strong>Bulk API 2.0 Best Practices:</strong></p>
      <ol style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;"><strong>Batch Size:</strong> Use optimal batch sizes (5,000-10,000 records) based on field count and complexity</li>
        <li style="margin: 8px 0;"><strong>Parallelization:</strong> Run multiple batches in parallel while respecting concurrent batch limits</li>
        <li style="margin: 8px 0;"><strong>Retry Logic:</strong> Implement exponential backoff for failed batches</li>
        <li style="margin: 8px 0;"><strong>Dead Letter Queue:</strong> Capture failed records for manual review and retry</li>
        <li style="margin: 8px 0;"><strong>Progress Tracking:</strong> Monitor batch status and record success/failure rates</li>
        <li style="margin: 8px 0;"><strong>Data Validation:</strong> Verify record counts and data integrity after each batch</li>
      </ol>

      <h2 style="color: #2563eb; margin-top: 40px; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
        10. Best-Practice Appendix (Technical)
      </h2>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.1 Trigger Architecture Patterns</h3>
      <p><strong>Single Trigger Per Object Pattern:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Implement one trigger per object that routes to a handler class</li>
        <li style="margin: 8px 0;">Use before/after context separation (beforeInsert, afterUpdate, etc.)</li>
        <li style="margin: 8px 0;">Implement ordered execution for multiple operations</li>
        <li style="margin: 8px 0;">Add comprehensive unit tests with ≥75% code coverage</li>
        <li style="margin: 8px 0;">Enforce code ownership and peer review processes</li>
        <li style="margin: 8px 0;">Document trigger execution order and dependencies</li>
      </ul>
      <p><strong>Trigger Handler Framework Example:</strong></p>
      <pre style="background-color: #f3f4f6; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.6;"><code>public class AccountTriggerHandler {
  public static void beforeInsert(List&lt;Account&gt; accounts) {
    // Validation and field population logic
  }
  public static void afterInsert(List&lt;Account&gt; accounts) {
    // Related record creation, integration calls
  }
}</code></pre>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.2 Automation Best Practices</h3>
      <p><strong>Flow-First Strategy:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Prefer record-triggered Flows over Apex triggers for business logic</li>
        <li style="margin: 8px 0;">Use Flows for declarative automation (field updates, record creation, email alerts)</li>
        <li style="margin: 8px 0;">Reserve Apex for complex logic, external integrations, and bulk operations</li>
        <li style="margin: 8px 0;">Migrate existing Workflow Rules and Process Builders to Flows</li>
        <li style="margin: 8px 0;">Implement version control for Flows using Metadata API or CI/CD pipelines</li>
        <li style="margin: 8px 0;">Document flow entry criteria and execution conditions</li>
        <li style="margin: 8px 0;">Test flows with various data scenarios before deployment</li>
      </ul>
      <p><strong>Process Builder Migration:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Process Builders are deprecated; migrate to record-triggered Flows</li>
        <li style="margin: 8px 0;">Map Process Builder criteria to Flow decision elements</li>
        <li style="margin: 8px 0;">Convert Process Builder actions to Flow action elements</li>
        <li style="margin: 8px 0;">Test migrated flows thoroughly before deactivating Process Builders</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.3 Data Management Strategies</h3>
      <p><strong>Storage Optimization:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Maintain data storage usage below 85% to allow for growth</li>
        <li style="margin: 8px 0;">Implement archival jobs for historical data using Batch Apex or scheduled Flows</li>
        <li style="margin: 8px 0;">Use Big Objects for high-volume, append-only data (logs, events, audit trails)</li>
        <li style="margin: 8px 0;">Purge orphaned ContentDocuments and attachments regularly</li>
        <li style="margin: 8px 0;">Consider external storage/CDN for large binary files</li>
        <li style="margin: 8px 0;">Monitor storage usage trends and plan capacity increases proactively</li>
      </ul>
      <p><strong>Data Quality Management:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Implement validation rules on critical objects to enforce data quality</li>
        <li style="margin: 8px 0;">Use duplicate management rules to prevent duplicate records</li>
        <li style="margin: 8px 0;">Create data quality dashboards to monitor completeness and accuracy</li>
        <li style="margin: 8px 0;">Schedule regular data cleanup jobs for stale or invalid records</li>
        <li style="margin: 8px 0;">Document data retention policies and implement automated deletion</li>
      </ul>
      <p><strong>Bulk API 2.0 Strategy:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Use Bulk API 2.0 for all data migration operations (faster, more reliable)</li>
        <li style="margin: 8px 0;">Implement proper error handling and retry logic</li>
        <li style="margin: 8px 0;">Monitor batch job status and handle partial failures gracefully</li>
        <li style="margin: 8px 0;">Use external IDs for upsert operations to handle updates and new records</li>
        <li style="margin: 8px 0;">Validate data before submission to reduce batch failures</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.4 Security Model Best Practices</h3>
      <p><strong>Least Privilege Principle:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Minimize admin-like profiles; shift permissions to Permission Sets</li>
        <li style="margin: 8px 0;">Use Permission Sets for role-based access instead of profiles</li>
        <li style="margin: 8px 0;">Implement field-level security to restrict sensitive data access</li>
        <li style="margin: 8px 0;">Use sharing rules and manual sharing for record-level access control</li>
        <li style="margin: 8px 0;">Remove "Modify All" and "View All Data" permissions except for system admins</li>
        <li style="margin: 8px 0;">Conduct quarterly access reviews to identify and remove unnecessary permissions</li>
      </ul>
      <p><strong>Guest User Security:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Restrict guest user permissions to minimum required for public access</li>
        <li style="margin: 8px 0;">Remove Modify All permissions from guest users</li>
        <li style="margin: 8px 0;">Use sharing sets for Experience Cloud sites instead of org-wide defaults</li>
        <li style="margin: 8px 0;">Implement custom permissions and flow checks for guest user actions</li>
        <li style="margin: 8px 0;">Regularly audit guest user access and permissions</li>
      </ul>
      <p><strong>Role Hierarchy and Sharing:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Design role hierarchy to reflect organizational structure</li>
        <li style="margin: 8px 0;">Use public groups for sharing rule criteria</li>
        <li style="margin: 8px 0;">Document sharing model and access patterns</li>
        <li style="margin: 8px 0;">Test sharing rules with various user scenarios</li>
        <li style="margin: 8px 0;">Monitor sharing rule performance and optimize as needed</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.5 Performance and Limits Optimization</h3>
      <p><strong>API Call Optimization:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Reduce polling frequency; implement caching where appropriate</li>
        <li style="margin: 8px 0;">Use change data capture (CDC) or Platform Events for real-time updates</li>
        <li style="margin: 8px 0;">Prefer event-driven integration patterns over scheduled polling</li>
        <li style="margin: 8px 0;">Implement exponential backoff for API retries</li>
        <li style="margin: 8px 0;">Monitor API usage trends and optimize integration schedules</li>
      </ul>
      <p><strong>Async Apex Management:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Consolidate queueable and batch jobs to reduce concurrent execution</li>
        <li style="margin: 8px 0;">Stagger scheduled jobs to avoid governor limit conflicts</li>
        <li style="margin: 8px 0;">Use Platform Events for decoupled, scalable automation</li>
        <li style="margin: 8px 0;">Monitor async job queue depth and execution times</li>
        <li style="margin: 8px 0;">Implement job chaining for complex multi-step processes</li>
      </ul>
      <p><strong>Governor Limit Best Practices:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Design code to operate within governor limits (SOQL queries, DML statements, CPU time)</li>
        <li style="margin: 8px 0;">Use bulkification patterns to process records in batches</li>
        <li style="margin: 8px 0;">Cache describe calls and metadata to reduce API calls</li>
        <li style="margin: 8px 0;">Monitor limit usage in production and optimize hot paths</li>
        <li style="margin: 8px 0;">Implement circuit breakers for external API calls</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.6 Testing and Quality Assurance</h3>
      <p><strong>Code Coverage Requirements:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Maintain ≥75% org-wide code coverage for production deployments</li>
        <li style="margin: 8px 0;">Target 100% coverage for critical business logic</li>
        <li style="margin: 8px 0;">Use test factories to create test data efficiently</li>
        <li style="margin: 8px 0;">Test both positive and negative scenarios</li>
        <li style="margin: 8px 0;">Implement test data builders for complex object hierarchies</li>
        <li style="margin: 8px 0;">Enforce coverage gates in CI/CD pipelines</li>
      </ul>
      <p><strong>Integration Testing:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Test automation execution with various data scenarios</li>
        <li style="margin: 8px 0;">Validate trigger and flow behavior with bulk operations</li>
        <li style="margin: 8px 0;">Test sharing rules and security model with different user contexts</li>
        <li style="margin: 8px 0;">Perform load testing for high-volume objects</li>
        <li style="margin: 8px 0;">Test error handling and recovery scenarios</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.7 Deployment and Change Management</h3>
      <p><strong>Version Control:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Use version control (Git) for all metadata (Apex, Flows, Profiles, etc.)</li>
        <li style="margin: 8px 0;">Implement CI/CD pipelines for automated deployments</li>
        <li style="margin: 8px 0;">Use source tracking to identify changes between environments</li>
        <li style="margin: 8px 0;">Document deployment procedures and rollback plans</li>
        <li style="margin: 8px 0;">Perform deployments during maintenance windows when possible</li>
      </ul>
      <p><strong>API Version Management:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Keep Apex, Flow, and Metadata API versions within 2 releases of current</li>
        <li style="margin: 8px 0;">Test API version upgrades in sandbox before production</li>
        <li style="margin: 8px 0;">Document API version dependencies and upgrade impact</li>
        <li style="margin: 8px 0;">Plan for deprecated feature migration (Process Builder, Workflow Rules)</li>
      </ul>

      <h3 style="color: #3b82f6; margin-top: 30px; margin-bottom: 15px; font-size: 20px;">10.8 Monitoring and Observability</h3>
      <p><strong>Performance Monitoring:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Set up custom dashboards for key metrics (API usage, storage, automation execution)</li>
        <li style="margin: 8px 0;">Monitor Apex execution times and identify slow queries</li>
        <li style="margin: 8px 0;">Track flow execution and identify performance bottlenecks</li>
        <li style="margin: 8px 0;">Set up alerts for governor limit usage approaching thresholds</li>
        <li style="margin: 8px 0;">Monitor data quality metrics (completeness, accuracy, duplicates)</li>
      </ul>
      <p><strong>Error Tracking:</strong></p>
      <ul style="margin: 15px 0; padding-left: 30px; line-height: 1.8;">
        <li style="margin: 8px 0;">Implement centralized error logging (custom objects, external services)</li>
        <li style="margin: 8px 0;">Set up alerts for critical errors and automation failures</li>
        <li style="margin: 8px 0;">Track and analyze error patterns to identify systemic issues</li>
        <li style="margin: 8px 0;">Document error resolution procedures and runbooks</li>
      </ul>
    </div>
  `;

  return html;
}

