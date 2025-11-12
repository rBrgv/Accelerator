import { ScanOutput } from "@/lib/types";
import { fetchOrgProfile } from "./inventory/org";
import { getObjectsSchemaAndCounts } from "./inventory/schema";
import { fetchAutomationIndex } from "./inventory/automation";
import { fetchCodeIndex, fetchReportingIndex } from "./inventory/reporting";
import { fetchOwnershipIndex } from "./inventory/ownership";
import { fetchPackageNamespaces } from "./inventory/packages";
import { fetchSecurityIndex } from "./inventory/security";
import { fetchIntegrationIndex } from "./inventory/integrations";
import { buildGraph } from "./graph/dependencies";
import { scanFindings } from "./scanners/findings";
import { migrationPrerequisites } from "./inventory/prerequisites";
import { createLogger } from "./logger";
import { computeHealth } from "./analyzers/healthCheck";

export async function runScan(
  accessToken: string,
  instanceUrl: string,
  apiVersion: string,
  requestId?: string
): Promise<ScanOutput> {
  const logger = createLogger(requestId);
  
  try {
    logger.info({ instanceUrl, apiVersion }, "Starting scan");
    
    // First, verify token is valid
    let source;
    try {
      source = await fetchOrgProfile(instanceUrl, accessToken, apiVersion, requestId);
    } catch (error: any) {
      const is401 =
        error?.response?.status === 401 ||
        error?.status === 401 ||
        error?.statusCode === 401 ||
        error?.isAuthError ||
        error?.message?.includes("401") ||
        error?.message?.includes("Unauthorized") ||
        error?.message?.includes("expired") ||
        error?.message?.includes("invalid");
      
      if (is401) {
        logger.error({ error }, "Access token expired or invalid");
        const authError = new Error("Access token expired or invalid. Please reconnect to Salesforce.");
        (authError as any).statusCode = 401;
        (authError as any).isAuthError = true;
        throw authError;
      }
      throw error;
    }
    
    // Fetch all inventory data in parallel
    const inventoryResults = await Promise.allSettled([
      getObjectsSchemaAndCounts(instanceUrl, accessToken, apiVersion, undefined, requestId),
      fetchAutomationIndex(instanceUrl, accessToken, apiVersion, requestId),
      fetchCodeIndex(instanceUrl, accessToken, apiVersion, requestId),
      fetchReportingIndex(instanceUrl, accessToken, apiVersion, requestId),
      fetchOwnershipIndex(instanceUrl, accessToken, apiVersion, requestId),
      fetchPackageNamespaces(instanceUrl, accessToken, apiVersion, requestId),
      fetchSecurityIndex(instanceUrl, accessToken, apiVersion, requestId),
      fetchIntegrationIndex(instanceUrl, accessToken, apiVersion, requestId),
    ]);
    
    // Check for auth errors
    let hasAuthError = false;
    for (const result of inventoryResults) {
      if (result.status === "rejected") {
        const error = result.reason;
        const is401 =
          error?.statusCode === 401 ||
          error?.isAuthError ||
          error?.response?.status === 401 ||
          error?.status === 401 ||
          error?.message?.includes("401") ||
          error?.message?.includes("Unauthorized") ||
          error?.message?.includes("expired");
        
        if (is401) {
          hasAuthError = true;
          logger.error({ error }, "Authentication failed during inventory fetch");
          break;
        }
      }
    }
    
    if (hasAuthError) {
      const authError = new Error("Access token expired or invalid. Please reconnect to Salesforce.");
      (authError as any).statusCode = 401;
      (authError as any).isAuthError = true;
      throw authError;
    }
    
    // Extract results
    const sourceObjects = inventoryResults[0].status === "fulfilled" ? inventoryResults[0].value : [];
    const automation = inventoryResults[1].status === "fulfilled" ? inventoryResults[1].value : {
      flows: [],
      triggers: [],
      validationRules: [],
      workflowRules: [],
      approvalProcesses: [],
    };
    const code = inventoryResults[2].status === "fulfilled" ? inventoryResults[2].value : { apexClasses: [], apexTriggers: [] };
    const reporting = inventoryResults[3].status === "fulfilled" ? inventoryResults[3].value : {
      reports: [],
      dashboards: [],
      emailTemplates: [],
      reportTypes: [],
    };
    const ownership = inventoryResults[4].status === "fulfilled" ? inventoryResults[4].value : { users: [], queues: [] };
    const packages = inventoryResults[5].status === "fulfilled" ? inventoryResults[5].value : [];
    const security = inventoryResults[6].status === "fulfilled" ? inventoryResults[6].value : undefined;
    const integrations = inventoryResults[7].status === "fulfilled" ? inventoryResults[7].value : undefined;
    
    // Build dependency graph
    const dependencyGraph = buildGraph(sourceObjects);
    
    // Scan for findings
    const findings = scanFindings(sourceObjects, automation, code, reporting, requestId);
    
    // Calculate summary - handle both array and AutomationCount types
    const validationRulesCount = Array.isArray(automation.validationRules) 
      ? automation.validationRules.length 
      : (automation.validationRules?.total ?? 0);
    const workflowRulesCount = Array.isArray(automation.workflowRules)
      ? automation.workflowRules.length
      : (automation.workflowRules?.total ?? 0);
    const approvalProcessesCount = Array.isArray(automation.approvalProcesses)
      ? automation.approvalProcesses.length
      : (automation.approvalProcesses?.total ?? 0);
    
    const summary = {
      objects: sourceObjects.length,
      recordsApprox: sourceObjects.reduce((sum, obj) => sum + (obj.recordCount || 0), 0),
      flows: automation.flows.length,
      triggers: automation.triggers.length,
      vrs: validationRulesCount,
      findingsHigh: findings.filter((f) => f.severity === "HIGH").length,
      findingsMedium: findings.filter((f) => f.severity === "MEDIUM").length,
      findingsLow: findings.filter((f) => f.severity === "LOW").length,
    };
    
    // Add storage KPIs to summary if available
    if (source.storage && !source.storage.note) {
      (summary as any).storage = {
        dataUsedPct: source.storage.data.usedPct,
        fileUsedPct: source.storage.file.usedPct,
      };
    }
    
    // Log summary
    logger.info({ summary }, "Scan completed successfully");
    
    const scanOutput: ScanOutput = {
      source,
      inventory: {
        sourceObjects,
        automation,
        code,
        reporting,
        ownership,
        packages,
        security,
        integrations,
      },
      findings,
      dependencyGraph,
      summary,
    };
    
    // Compute health check (non-blocking, optional)
    try {
      const health = await computeHealth(scanOutput, {
        instanceUrl,
        token: accessToken,
        apiVersion,
      });
      scanOutput.health = health;
      logger.info({ overallScore: health.overallScore }, "Health check computed");
    } catch (error: any) {
      // Silently fail - health check is optional
      logger.warn({ error: error.message }, "Health check computation failed, continuing without it");
    }
    
    return scanOutput;
  } catch (error: any) {
    logger.error({ error, stack: error.stack }, "Scan failed");
    throw error;
  }
}

// Export prerequisites for use in UI
export { migrationPrerequisites };
