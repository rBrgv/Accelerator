import { ScanOutput, ScanRun } from "@/lib/types";
import { createLogger } from "./logger";
import crypto from "crypto";

// In-memory storage (ready for Supabase migration)
const scanRunsStorage = new Map<string, ScanRun>();

function hashScanSummary(summary: ScanOutput["summary"]): string {
  const str = JSON.stringify({
    objects: summary.objects,
    recordsApprox: summary.recordsApprox,
    flows: summary.flows,
    triggers: summary.triggers,
    vrs: summary.vrs,
  });
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function ensureOrgConnection(
  instanceUrl: string,
  orgId: string,
  edition: string,
  requestId?: string
): Promise<string> {
  const logger = createLogger(requestId);
  // For in-memory, just return instanceUrl as connection ID
  // In Supabase, this would create/retrieve org_connection record
  logger.info({ instanceUrl, orgId, edition }, "Ensuring org connection");
  return instanceUrl;
}

export async function saveScan(
  orgConnectionId: string,
  scanOutput: ScanOutput,
  requestId?: string
): Promise<ScanRun> {
  const logger = createLogger(requestId);
  
  const scanId = crypto.randomUUID();
  const hash = hashScanSummary(scanOutput.summary);
  
  const scanRun: ScanRun = {
    id: scanId,
    orgConnectionId,
    scanOutput: {
      ...scanOutput,
      summary: { ...scanOutput.summary, hash },
    },
    createdAt: new Date(),
  };
  
  scanRunsStorage.set(scanId, scanRun);
  logger.info({ scanId, orgConnectionId, hash }, "Scan saved");
  
  return scanRun;
}

export async function getScan(scanId: string, requestId?: string): Promise<ScanRun | null> {
  const logger = createLogger(requestId);
  const scan = scanRunsStorage.get(scanId) || null;
  if (!scan) {
    logger.warn({ scanId }, "Scan not found");
  }
  return scan;
}

export async function listScans(
  orgConnectionId: string,
  requestId?: string
): Promise<Array<{ id: string; createdAt: Date; summary: ScanOutput["summary"] }>> {
  const logger = createLogger(requestId);
  const scans = Array.from(scanRunsStorage.values())
    .filter((scan) => scan.orgConnectionId === orgConnectionId)
    .map((scan) => ({
      id: scan.id,
      createdAt: scan.createdAt,
      summary: scan.scanOutput.summary,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  logger.info({ orgConnectionId, count: scans.length }, "Scans listed");
  return scans;
}

export interface ScanDiff {
  fromScanId: string;
  toScanId: string;
  hasChanges: boolean;
  added: {
    objects: string[];
    flows: string[];
    triggers: string[];
    validationRules: string[];
  };
  removed: {
    objects: string[];
    flows: string[];
    triggers: string[];
    validationRules: string[];
  };
  changed: {
    objects: Array<{ name: string; from: number; to: number }>;
    flows: Array<{ name: string; from: "Active" | "Inactive"; to: "Active" | "Inactive" }>;
    triggers: Array<{ name: string; from: "Active" | "Inactive"; to: "Active" | "Inactive" }>;
    findings: Array<{ id: string; from: "HIGH" | "MEDIUM" | "LOW"; to: "HIGH" | "MEDIUM" | "LOW" }>;
  };
}

export async function diffScan(
  fromScan: ScanOutput,
  toScan: ScanOutput,
  requestId?: string
): Promise<ScanDiff> {
  const logger = createLogger(requestId);
  
  // Quick check using hash
  const fromHash = fromScan.summary.hash || hashScanSummary(fromScan.summary);
  const toHash = toScan.summary.hash || hashScanSummary(toScan.summary);
  
  if (fromHash === toHash) {
    logger.info("No changes detected (hash match)");
    return {
      fromScanId: "",
      toScanId: "",
      hasChanges: false,
      added: { objects: [], flows: [], triggers: [], validationRules: [] },
      removed: { objects: [], flows: [], triggers: [], validationRules: [] },
      changed: { objects: [], flows: [], triggers: [], findings: [] },
    };
  }
  
  // Compare objects
  const fromObjectNames = new Set(fromScan.inventory.sourceObjects.map((o) => o.name));
  const toObjectNames = new Set(toScan.inventory.sourceObjects.map((o) => o.name));
  
  const addedObjects = Array.from(toObjectNames).filter((n) => !fromObjectNames.has(n));
  const removedObjects = Array.from(fromObjectNames).filter((n) => !toObjectNames.has(n));
  
  const changedObjects: Array<{ name: string; from: number; to: number }> = [];
  for (const obj of toScan.inventory.sourceObjects) {
    const fromObj = fromScan.inventory.sourceObjects.find((o) => o.name === obj.name);
    if (fromObj && fromObj.recordCount !== obj.recordCount) {
      changedObjects.push({
        name: obj.name,
        from: fromObj.recordCount || 0,
        to: obj.recordCount || 0,
      });
    }
  }
  
  // Compare flows
  const fromFlowNames = new Set(fromScan.inventory.automation.flows.map((f) => f.developerName));
  const toFlowNames = new Set(toScan.inventory.automation.flows.map((f) => f.developerName));
  
  const addedFlows = Array.from(toFlowNames).filter((n) => !fromFlowNames.has(n));
  const removedFlows = Array.from(fromFlowNames).filter((n) => !toFlowNames.has(n));
  
  const changedFlows: Array<{ name: string; from: "Active" | "Inactive"; to: "Active" | "Inactive" }> = [];
  for (const flow of toScan.inventory.automation.flows) {
    const fromFlow = fromScan.inventory.automation.flows.find((f) => f.developerName === flow.developerName);
    if (fromFlow && fromFlow.status !== flow.status) {
      changedFlows.push({
        name: flow.developerName,
        from: fromFlow.status === "Active" ? "Active" : "Inactive",
        to: flow.status === "Active" ? "Active" : "Inactive",
      });
    }
  }
  
  // Compare triggers
  const fromTriggerNames = new Set(fromScan.inventory.automation.triggers.map((t) => t.name));
  const toTriggerNames = new Set(toScan.inventory.automation.triggers.map((t) => t.name));
  
  const addedTriggers = Array.from(toTriggerNames).filter((n) => !fromTriggerNames.has(n));
  const removedTriggers = Array.from(fromTriggerNames).filter((n) => !toTriggerNames.has(n));
  
  const changedTriggers: Array<{ name: string; from: "Active" | "Inactive"; to: "Active" | "Inactive" }> = [];
  for (const trigger of toScan.inventory.automation.triggers) {
    const fromTrigger = fromScan.inventory.automation.triggers.find((t) => t.name === trigger.name);
    if (fromTrigger && fromTrigger.status !== trigger.status) {
      changedTriggers.push({
        name: trigger.name,
        from: fromTrigger.status === "Active" ? "Active" : "Inactive",
        to: trigger.status === "Active" ? "Active" : "Inactive",
      });
    }
  }
  
  // Compare validation rules
  const fromVrArray = Array.isArray(fromScan.inventory.automation.validationRules)
    ? fromScan.inventory.automation.validationRules
    : [];
  const toVrArray = Array.isArray(toScan.inventory.automation.validationRules)
    ? toScan.inventory.automation.validationRules
    : [];
  const fromVrNames = new Set(fromVrArray.map((vr) => vr.fullName));
  const toVrNames = new Set(toVrArray.map((vr) => vr.fullName));
  
  const addedValidationRules = Array.from(toVrNames).filter((n) => !fromVrNames.has(n));
  const removedValidationRules = Array.from(fromVrNames).filter((n) => !toVrNames.has(n));
  
  // Compare findings
  const fromFindingIds = new Set(fromScan.findings.map((f) => f.id));
  const toFindingIds = new Set(toScan.findings.map((f) => f.id));
  
  const changedFindings: Array<{ id: string; from: "HIGH" | "MEDIUM" | "LOW"; to: "HIGH" | "MEDIUM" | "LOW" }> = [];
  for (const finding of toScan.findings) {
    const fromFinding = fromScan.findings.find((f) => f.id === finding.id);
    if (fromFinding && fromFinding.severity !== finding.severity) {
      changedFindings.push({
        id: finding.id,
        from: fromFinding.severity,
        to: finding.severity,
      });
    }
  }
  
  const hasChanges =
    addedObjects.length > 0 ||
    removedObjects.length > 0 ||
    changedObjects.length > 0 ||
    addedFlows.length > 0 ||
    removedFlows.length > 0 ||
    changedFlows.length > 0 ||
    addedTriggers.length > 0 ||
    removedTriggers.length > 0 ||
    changedTriggers.length > 0 ||
    addedValidationRules.length > 0 ||
    removedValidationRules.length > 0 ||
    changedFindings.length > 0;
  
  logger.info({ hasChanges }, "Scan diff completed");
  
  return {
    fromScanId: "",
    toScanId: "",
    hasChanges,
    added: {
      objects: addedObjects,
      flows: addedFlows,
      triggers: addedTriggers,
      validationRules: addedValidationRules,
    },
    removed: {
      objects: removedObjects,
      flows: removedFlows,
      triggers: removedTriggers,
      validationRules: removedValidationRules,
    },
    changed: {
      objects: changedObjects,
      flows: changedFlows,
      triggers: changedTriggers,
      findings: changedFindings,
    },
  };
}

