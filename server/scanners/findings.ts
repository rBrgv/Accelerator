import { Finding, ObjectStat, AutomationIndex, CodeIndex } from "@/lib/types";
import { createLogger } from "../logger";

export function scanFindings(
  objects: ObjectStat[],
  automation: AutomationIndex,
  code?: CodeIndex,
  requestId?: string
): Finding[] {
  const logger = createLogger(requestId);
  const findings: Finding[] = [];
  
  // Build object name to object map for quick lookup
  const objectMap = new Map<string, ObjectStat>();
  objects.forEach(obj => objectMap.set(obj.name, obj));
  
  // Scan for autonumber fields
  for (const obj of objects) {
    if (obj.autonumberFields.length > 0) {
      findings.push({
        id: `AUTONUMBER_${obj.name}`,
        severity: "HIGH",
        category: "Data Migration",
        title: `Auto-number field detected in ${obj.label}`,
        description: `${obj.label} contains ${obj.autonumberFields.length} auto-number field(s) that may require special handling during migration.`,
        objects: [obj.name],
        impact: "Auto-number fields cannot be migrated directly. New records will receive new auto-numbers in the target org.",
        remediation: [
          "Identify all auto-number fields in the object",
          "Plan for renumbering strategy if sequential numbers are required",
          "Consider using external ID fields for record matching",
          "Document the auto-number format and starting number",
        ],
      });
    }
    
    // Scan for large objects
    if (obj.recordCount && obj.recordCount > 100000) {
      findings.push({
        id: `LARGE_OBJECT_${obj.name}`,
        severity: "MEDIUM",
        category: "Data Volume",
        title: `Large object detected: ${obj.label}`,
        description: `${obj.label} contains ${obj.recordCount.toLocaleString()} records, which may require special handling during migration.`,
        objects: [obj.name],
        impact: "Large data volumes may require batch processing, extended migration windows, or data archiving strategies.",
        remediation: [
          "Assess data retention requirements",
          "Consider data archiving before migration",
          "Plan for extended migration windows",
          "Use bulk API or Data Loader for large volumes",
        ],
      });
    }
  }
  
  // Scan for triggers that could block data migration
  const triggersByObject = new Map<string, typeof automation.triggers>();
  automation.triggers.forEach(trigger => {
    const objName = trigger.tableEnumOrId;
    if (objName) {
      if (!triggersByObject.has(objName)) {
        triggersByObject.set(objName, []);
      }
      triggersByObject.get(objName)!.push(trigger);
    }
  });
  
  // Check for objects with active triggers (data migration blockers)
  for (const [objName, triggers] of triggersByObject.entries()) {
    const activeTriggers = triggers.filter(t => t.status === "Active");
    if (activeTriggers.length > 0) {
      const obj = objectMap.get(objName);
      const recordCount = obj?.recordCount || 0;
      
      findings.push({
        id: `TRIGGER_BLOCKER_${objName}`,
        severity: recordCount > 0 ? "HIGH" : "MEDIUM",
        category: "Data Migration - Automation",
        title: `Active triggers detected on ${obj?.label || objName}`,
        description: `${obj?.label || objName} has ${activeTriggers.length} active trigger(s) that will execute during data migration: ${activeTriggers.map(t => t.name).join(", ")}.`,
        objects: [objName],
        impact: "Triggers will fire during data loads, potentially causing performance issues, validation errors, or unintended side effects. This can significantly slow down or block bulk data migration.",
        remediation: [
          "Review all triggers on this object before data migration",
          "Disable triggers during initial data load (recommended)",
          "Test trigger behavior with sample data loads",
          "Consider using Bulk API with trigger bypass if available",
          "Plan for trigger re-enablement after data migration",
          "Document trigger dependencies and downstream impacts",
        ],
      });
    }
    
    // Check for objects with multiple triggers (performance concern)
    if (activeTriggers.length >= 3) {
      const obj = objectMap.get(objName);
      findings.push({
        id: `TRIGGER_DENSE_${objName}`,
        severity: "MEDIUM",
        category: "Data Migration - Automation",
        title: `Multiple triggers on ${obj?.label || objName}`,
        description: `${obj?.label || objName} has ${activeTriggers.length} active triggers, which may cause performance degradation during data migration.`,
        objects: [objName],
        impact: "Multiple triggers firing on each record can significantly slow down data loads and increase the risk of governor limit errors.",
        remediation: [
          "Review trigger execution order and dependencies",
          "Consider consolidating trigger logic where possible",
          "Disable non-critical triggers during bulk data loads",
          "Use bulk API with smaller batch sizes",
          "Monitor governor limits during test loads",
        ],
      });
    }
  }
  
  // Scan for validation rules that could block data migration
  // Handle both array and AutomationCount types for validationRules
  const validationRulesArray = Array.isArray(automation.validationRules) 
    ? automation.validationRules 
    : [];
  
  const vrsByObject = new Map<string, typeof validationRulesArray>();
  validationRulesArray.forEach(vr => {
    const objName = vr.fullName.split(".")[0];
    if (objName) {
      if (!vrsByObject.has(objName)) {
        vrsByObject.set(objName, []);
      }
      vrsByObject.get(objName)!.push(vr);
    }
  });
  
  for (const [objName, vrs] of vrsByObject.entries()) {
    const activeVRs = vrs.filter(vr => vr.active);
    if (activeVRs.length > 0) {
      const obj = objectMap.get(objName);
      const recordCount = obj?.recordCount || 0;
      
      // Check for required fields without defaults (create-time blockers)
      const requiredFieldsWithoutDefault = obj?.fields.filter(f => 
        f.required && !f.nillable && !f.externalId
      ) || [];
      
      if (requiredFieldsWithoutDefault.length > 0 || recordCount > 0) {
        findings.push({
          id: `VALIDATION_BLOCKER_${objName}`,
          severity: recordCount > 0 ? "HIGH" : "MEDIUM",
          category: "Data Migration - Automation",
          title: `Active validation rules on ${obj?.label || objName}`,
          description: `${obj?.label || objName} has ${activeVRs.length} active validation rule(s) that will validate data during migration. ${requiredFieldsWithoutDefault.length > 0 ? `Additionally, ${requiredFieldsWithoutDefault.length} required field(s) without defaults may block record creation.` : ""}`,
          objects: [objName],
          impact: "Validation rules will execute during data loads and may reject records that don't meet criteria. Required fields without defaults can prevent record creation entirely.",
          remediation: [
            "Review all validation rules on this object",
            "Disable validation rules during initial data load (recommended)",
            "Ensure all required fields have values or defaults in source data",
            "Test validation rules with sample data before full migration",
            "Create data quality reports to identify records that will fail validation",
            "Plan for validation rule re-enablement after data migration",
          ],
        });
      }
    }
  }
  
  // Scan for record-triggered flows that could impact data migration
  const recordTriggeredFlows = automation.flows.filter(f => 
    f.status === "Active" && (f.processType === "RecordTriggeredFlow" || f.triggerType)
  );
  
  const flowsByObject = new Map<string, typeof automation.flows>();
  recordTriggeredFlows.forEach(flow => {
    const objName = flow.object;
    if (objName) {
      if (!flowsByObject.has(objName)) {
        flowsByObject.set(objName, []);
      }
      flowsByObject.get(objName)!.push(flow);
    }
  });
  
  for (const [objName, flows] of flowsByObject.entries()) {
    if (flows.length > 0) {
      const obj = objectMap.get(objName);
      const recordCount = obj?.recordCount || 0;
      
      findings.push({
        id: `FLOW_BLOCKER_${objName}`,
        severity: recordCount > 0 ? "MEDIUM" : "LOW",
        category: "Data Migration - Automation",
        title: `Record-triggered flows on ${obj?.label || objName}`,
        description: `${obj?.label || objName} has ${flows.length} active record-triggered flow(s) that will execute during data migration: ${flows.map(f => f.masterLabel || f.developerName).join(", ")}.`,
        objects: [objName],
        impact: "Record-triggered flows will execute during data loads, potentially causing performance issues, governor limit errors, or unintended automation side effects.",
        remediation: [
          "Review all record-triggered flows on this object",
          "Consider deactivating flows during bulk data loads",
          "Test flow behavior with sample data loads",
          "Monitor flow execution and governor limits",
          "Plan for flow re-activation after data migration",
        ],
      });
    }
  }
  
  // Scan for objects with complex automation (triggers + flows + validation rules)
  for (const [objName, triggers] of triggersByObject.entries()) {
    const activeTriggers = triggers.filter(t => t.status === "Active");
    const activeVRs = vrsByObject.get(objName)?.filter(vr => vr.active) || [];
    const activeFlows = flowsByObject.get(objName)?.filter(f => f.status === "Active") || [];
    
    const totalAutomation = activeTriggers.length + activeVRs.length + activeFlows.length;
    
    if (totalAutomation >= 5) {
      const obj = objectMap.get(objName);
      findings.push({
        id: `AUTOMATION_COMPLEX_${objName}`,
        severity: "MEDIUM",
        category: "Data Migration - Automation",
        title: `Complex automation on ${obj?.label || objName}`,
        description: `${obj?.label || objName} has ${totalAutomation} active automation components (${activeTriggers.length} triggers, ${activeFlows.length} flows, ${activeVRs.length} validation rules) that will all execute during data migration.`,
        objects: [objName],
        impact: "Multiple automation components firing on each record can cause significant performance degradation, governor limit errors, and unpredictable behavior during data loads.",
        remediation: [
          "Document all automation components and their execution order",
          "Disable all automation during initial bulk data load",
          "Test automation behavior with sample data after migration",
          "Re-enable automation components incrementally and test",
          "Consider automation optimization to reduce complexity",
        ],
      });
    }
  }
  
  // Scan for required fields without defaults (data migration blockers)
  for (const obj of objects) {
    const requiredFieldsWithoutDefault = obj.fields.filter(f => 
      f.required && !f.nillable && !f.externalId && f.type !== "boolean"
    );
    
    if (requiredFieldsWithoutDefault.length > 0 && obj.recordCount && obj.recordCount > 0) {
      findings.push({
        id: `REQUIRED_FIELDS_${obj.name}`,
        severity: "HIGH",
        category: "Data Migration",
        title: `Required fields without defaults in ${obj.label}`,
        description: `${obj.label} has ${requiredFieldsWithoutDefault.length} required field(s) without default values: ${requiredFieldsWithoutDefault.map(f => f.name).join(", ")}. These fields must have values in source data or migration will fail.`,
        objects: [obj.name],
        impact: "Records cannot be created without values for required fields. Missing data in source will cause migration failures.",
        remediation: [
          "Identify all required fields without defaults",
          "Ensure source data contains values for all required fields",
          "Create data quality checks to identify records with missing required fields",
          "Consider adding default values in target org if appropriate",
          "Plan for data transformation to populate required fields",
        ],
      });
    }
  }
  
  // Scan for objects with master-detail relationships (load order dependency)
  for (const obj of objects) {
    const masterDetailLookups = obj.lookups.filter(l => l.isMasterDetail);
    if (masterDetailLookups.length > 0 && obj.recordCount && obj.recordCount > 0) {
      findings.push({
        id: `MASTER_DETAIL_${obj.name}`,
        severity: "MEDIUM",
        category: "Data Migration",
        title: `Master-detail relationships on ${obj.label}`,
        description: `${obj.label} has ${masterDetailLookups.length} master-detail relationship(s): ${masterDetailLookups.map(l => `${l.field} → ${l.target}`).join(", ")}. Parent records must be loaded before child records.`,
        objects: [obj.name, ...masterDetailLookups.map(l => l.target)],
        impact: "Master-detail relationships require parent records to exist before child records can be created. Incorrect load order will cause migration failures.",
        remediation: [
          "Identify all parent objects in master-detail relationships",
          "Load parent objects before child objects in data migration sequence",
          "Use external IDs to maintain relationships during migration",
          "Verify parent-child relationships after data load",
        ],
      });
    }
  }
  
  // Scan for automation density
  const validationRulesCount = Array.isArray(automation.validationRules) 
    ? automation.validationRules.length 
    : 0;
  const automationCount = automation.flows.length + automation.triggers.length + validationRulesCount;
  const objectCount = objects.length;
  const automationDensity = objectCount > 0 ? automationCount / objectCount : 0;
  
  if (automationDensity > 5) {
    findings.push({
      id: "AUTOMATION_DENSE",
      severity: "MEDIUM",
      category: "Automation Complexity",
      title: "High automation density detected",
      description: `Org has ${automationCount} automation components across ${objectCount} objects (${automationDensity.toFixed(1)} per object).`,
      objects: objects.map((o) => o.name),
      impact: "High automation density may increase migration complexity and testing requirements.",
      remediation: [
        "Document all automation components",
        "Create test scenarios for each automation",
        "Plan for automation testing in target org",
        "Consider automation optimization opportunities",
      ],
    });
  }
  
  // Scan for code coverage issues (non-blocking, only if coverage data exists)
  try {
    if (code?.coverage && code.coverage.byClass && code.coverage.byClass.length > 0) {
      const { orgWidePercent, byClass } = code.coverage;
      
      // Org-wide coverage finding
      if (orgWidePercent !== null && orgWidePercent !== undefined) {
        if (orgWidePercent < 75) {
          findings.push({
            id: "LOW_ORG_COVERAGE",
            severity: orgWidePercent < 50 ? "HIGH" : "MEDIUM",
            category: "Code Quality",
            title: `Low org-wide code coverage: ${orgWidePercent}%`,
            description: `Org-wide Apex code coverage is ${orgWidePercent}%, which is below the recommended 75% threshold. This may impact production deployment requirements.`,
            objects: [],
            impact: "Salesforce requires 75% code coverage for production deployments. Low coverage may block deployments or require additional test development.",
            remediation: [
              "Review and improve test class coverage",
              "Identify classes with low or no coverage",
              "Develop comprehensive test classes for uncovered code",
              "Aim for at least 75% org-wide coverage before production deployment",
              "Consider using test data factories to improve test coverage",
            ],
          });
        }
      }
      
      // Per-class coverage findings
      const classesBelow75 = byClass.filter(c => (c.percent ?? 0) < 75);
      const classesBelow50 = byClass.filter(c => (c.percent ?? 0) < 50);
      
      if (classesBelow50.length > 0) {
        findings.push({
          id: "CRITICAL_COVERAGE_GAP",
          severity: "HIGH",
          category: "Code Quality",
          title: `${classesBelow50.length} Apex classes/triggers below 50% coverage`,
          description: `${classesBelow50.length} Apex classes or triggers have code coverage below 50%, which is critical for production deployment.`,
          objects: classesBelow50.slice(0, 10).map(c => c.name), // Include first 10 class names
          impact: "Classes with very low coverage (<50%) may fail deployment requirements and require immediate attention before migration.",
          remediation: [
            "Prioritize test development for classes below 50% coverage",
            "Review each class to understand why coverage is low",
            "Develop targeted test classes for critical business logic",
            "Consider refactoring untestable code",
            "Use code coverage reports to identify specific uncovered lines",
          ],
        });
      }
      
      if (classesBelow75.length > classesBelow50.length) {
        const classesBetween50And75 = classesBelow75.length - classesBelow50.length;
        findings.push({
          id: "MODERATE_COVERAGE_GAP",
          severity: "MEDIUM",
          category: "Code Quality",
          title: `${classesBetween50And75} Apex classes/triggers between 50-75% coverage`,
          description: `${classesBetween50And75} Apex classes or triggers have code coverage between 50% and 75%, which is below the recommended threshold.`,
          objects: [],
          impact: "Classes below 75% coverage may need additional test development to meet production deployment requirements.",
          remediation: [
            "Review coverage gaps in classes between 50-75%",
            "Add test cases for uncovered code paths",
            "Focus on edge cases and error handling",
            "Ensure all critical business logic is tested",
          ],
        });
      }
    }
  } catch (err: any) {
    logger.debug({ error: err?.message }, "Error processing coverage findings - skipping");
  }
  
  logger.info({ findingsCount: findings.length }, "Findings scan completed");
  return findings;
}

