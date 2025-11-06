import { AutomationIndex, Flow, Trigger, ValidationRule } from "@/lib/types";
import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export async function fetchAutomationIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<AutomationIndex> {
  const logger = createLogger(requestId);
  
  try {
    const [flows, triggers, validationRules] = await Promise.all([
      getFlows(instanceUrl, accessToken, apiVersion, requestId),
      getTriggers(instanceUrl, accessToken, apiVersion, requestId),
      getValidationRules(instanceUrl, accessToken, apiVersion, requestId),
    ]);
    
    logger.info(
      { flows: flows.length, triggers: triggers.length, validationRules: validationRules.length },
      "Automation index fetched"
    );
    
    return {
      flows,
      triggers,
      validationRules,
      workflowRules: [],
      approvalProcesses: [],
    };
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch automation index");
    throw error;
  }
}

async function getFlows(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<Flow[]> {
  const logger = createLogger(requestId);
  
  try {
    // Query FlowDefinition for metadata (simplified query)
    const defQuery = `SELECT DeveloperName, LatestVersionId, MasterLabel, NamespacePrefix FROM FlowDefinition`;
    const defResult = await soql(instanceUrl, accessToken, apiVersion, defQuery, requestId, { tooling: true }).catch(() => ({ records: [] }));
    
    // Query Flow for status (simplified - remove fields that may not be accessible)
    const flowQuery = `SELECT Id, ApiVersion, Status, DeveloperName, ProcessType, TriggerType, TableEnumOrId, VersionNumber FROM Flow`;
    const flowResult = await soql(instanceUrl, accessToken, apiVersion, flowQuery, requestId, { tooling: true }).catch(() => ({ records: [] }));
    
    // Build map of flows by DeveloperName
    const flowMap = new Map<string, Flow>();
    
    // Process FlowDefinition records
    for (const def of defResult.records || []) {
      const developerName = def.DeveloperName || def.NamespacePrefix
        ? `${def.NamespacePrefix}__${def.DeveloperName}`
        : "";
      
      if (!developerName) continue;
      
      // Find matching Flow record (match by DeveloperName since DefinitionId may not be in query)
      const flowRecord = (flowResult.records || []).find(
        (f: any) => f.DeveloperName === def.DeveloperName || f.DeveloperName === (def.NamespacePrefix ? `${def.NamespacePrefix}__${def.DeveloperName}` : def.DeveloperName)
      );
      
      const status = flowRecord?.Status === "Active" ? "Active" : 
                     flowRecord?.Status === "Draft" ? "Draft" :
                     flowRecord?.Status === "Obsolete" ? "Obsolete" :
                     flowRecord?.Status === "InvalidDraft" ? "InvalidDraft" : "Inactive";
      
      flowMap.set(developerName, {
        id: flowRecord?.Id || def.LatestVersionId || "",
        developerName,
        masterLabel: def.MasterLabel || developerName,
        status,
        apiVersion: flowRecord?.ApiVersion || apiVersion,
        processType: flowRecord?.ProcessType || undefined,
        triggerType: flowRecord?.TriggerType || undefined,
        object: flowRecord?.TableEnumOrId || undefined,
      });
    }
    
    // Add any flows not in definitions
    for (const flowRecord of flowResult.records || []) {
      const developerName = flowRecord.DeveloperName || "";
      if (developerName && !flowMap.has(developerName)) {
        const status = flowRecord.Status === "Active" ? "Active" :
                       flowRecord.Status === "Draft" ? "Draft" :
                       flowRecord.Status === "Obsolete" ? "Obsolete" :
                       flowRecord.Status === "InvalidDraft" ? "InvalidDraft" : "Inactive";
        
        flowMap.set(developerName, {
          id: flowRecord.Id,
          developerName,
          masterLabel: developerName,
          status,
          apiVersion: flowRecord.ApiVersion || apiVersion,
          processType: flowRecord.ProcessType,
          triggerType: flowRecord.TriggerType,
          object: flowRecord.TableEnumOrId,
        });
      }
    }
    
    const flows = Array.from(flowMap.values());
    logger.info({ count: flows.length }, "Flows fetched");
    return flows;
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to fetch flows");
    return [];
  }
}

async function getTriggers(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<Trigger[]> {
  const logger = createLogger(requestId);
  
  try {
    const query = `SELECT Id, Name, TableEnumOrId, Status, ApiVersion FROM ApexTrigger`;
    const result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
    
    const triggers: Trigger[] = (result.records || []).map((t: any) => ({
      id: t.Id,
      name: t.Name,
      tableEnumOrId: t.TableEnumOrId || "",
      status: t.Status === "Active" ? "Active" : "Inactive",
      apiVersion: t.ApiVersion || apiVersion,
    }));
    
    logger.info({ count: triggers.length }, "Triggers fetched");
    return triggers;
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to fetch triggers");
    return [];
  }
}

async function getValidationRules(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<ValidationRule[]> {
  const logger = createLogger(requestId);
  
  try {
    // ValidationRule is not directly queryable via Tooling API SOQL
    // We need to query EntityDefinition and get ValidationRules from there
    // For now, return empty array - this would require Metadata API or describe calls
    logger.warn("ValidationRule query not supported via Tooling API SOQL - skipping");
    return [];
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to fetch validation rules");
    return [];
  }
}
