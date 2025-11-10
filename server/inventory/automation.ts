import { AutomationIndex, AutomationCount, Flow, Trigger, ValidationRule } from "@/lib/types";
import { soql, sfGet } from "../salesforce/rest";
import { createLogger } from "../logger";
import { listMetadata, listMetadataViaEntityDefinition } from "../salesforce/metadata";

// Helper: Safe Tooling API count query
async function safeToolingCount(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  query: string,
  requestId?: string
): Promise<{ count: number | null; ok: boolean; error?: string }> {
  try {
    const result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
    return { count: result.totalSize || 0, ok: true };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.[0]?.errorCode || error.response?.status;
    return { count: null, ok: false, error: `${errorMsg} (${errorCode || 'unknown'})` };
  }
}

export async function fetchAutomationIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<AutomationIndex> {
  const logger = createLogger(requestId);
  
  try {
    // Run flows and triggers in parallel
    const [flows, triggers] = await Promise.all([
      getFlows(instanceUrl, accessToken, apiVersion, requestId),
      getTriggers(instanceUrl, accessToken, apiVersion, requestId),
    ]);
    
    // Get Validation Rules count via Tooling API
    console.log(`[fetchAutomationIndex] Fetching Validation Rules counts...`);
    const vrTotalResult = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM ValidationRule",
      requestId
    );
    const vrActiveResult = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM ValidationRule WHERE Active = true",
      requestId
    );
    
    const validationRulesCount: AutomationCount = {
      total: vrTotalResult.ok ? vrTotalResult.count : null,
      active: vrActiveResult.ok ? vrActiveResult.count : null,
      available: vrTotalResult.ok || vrActiveResult.ok,
      note: !vrTotalResult.ok && !vrActiveResult.ok 
        ? `ValidationRule not accessible: ${vrTotalResult.error || vrActiveResult.error}`
        : undefined,
    };
    
    // Get Validation Rules details (for backward compatibility)
    let validationRules: ValidationRule[] = [];
    if (validationRulesCount.available) {
      try {
        validationRules = await Promise.race([
          getValidationRules(instanceUrl, accessToken, apiVersion, requestId).catch(() => []),
          new Promise<ValidationRule[]>((resolve) => 
            setTimeout(() => resolve([]), 2000)
          )
        ]);
      } catch {
        validationRules = [];
      }
    }
    
    // Get Workflow Rules via Tooling API first
    console.log(`[fetchAutomationIndex] Fetching Workflow Rules counts...`);
    const wrTotalResult = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM WorkflowRule",
      requestId
    );
    const wrActiveResult = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM WorkflowRule WHERE Active = true",
      requestId
    );
    
    let workflowRulesCount: AutomationCount;
    if (wrTotalResult.ok || wrActiveResult.ok) {
      workflowRulesCount = {
        total: wrTotalResult.ok ? wrTotalResult.count : null,
        active: wrActiveResult.ok ? wrActiveResult.count : null,
        available: true,
      };
    } else {
      // Fallback to Metadata API via EntityDefinition
      console.log(`[fetchAutomationIndex] WorkflowRule Tooling failed, trying EntityDefinition...`);
      const metadataResult = await listMetadataViaEntityDefinition(
        instanceUrl,
        accessToken,
        apiVersion,
        "WorkflowRules",
        requestId
      );
      
      workflowRulesCount = {
        total: metadataResult.ok ? metadataResult.items.length : null,
        active: null, // Cannot determine active status from listMetadata
        available: metadataResult.ok,
        note: metadataResult.ok 
          ? "Active status unavailable via listMetadata; run retrieve for details"
          : `WorkflowRule not accessible: ${wrTotalResult.error || metadataResult.error}`,
      };
    }
    
    // Get Approval Processes via Metadata API
    console.log(`[fetchAutomationIndex] Fetching Approval Processes counts...`);
    const apMetadataResult = await listMetadata(
      instanceUrl,
      accessToken,
      apiVersion,
      "ApprovalProcess",
      requestId
    );
    
    // Try EntityDefinition approach for ApprovalProcess
    const apEntityResult = await listMetadataViaEntityDefinition(
      instanceUrl,
      accessToken,
      apiVersion,
      "ApprovalProcesses",
      requestId
    );
    
    const approvalProcessesCount: AutomationCount = {
      total: apEntityResult.ok ? apEntityResult.items.length : (apMetadataResult.ok ? apMetadataResult.items.length : null),
      active: null, // Cannot determine active status from listMetadata
      available: apEntityResult.ok || apMetadataResult.ok,
      note: !apEntityResult.ok && !apMetadataResult.ok
        ? `ApprovalProcess not accessible: ${apMetadataResult.error || 'unknown'}`
        : undefined,
    };
    
    logger.info(
      { 
        flows: flows.length, 
        triggers: triggers.length,
        validationRules: validationRules.length,
        validationRulesCount: validationRulesCount.total,
        workflowRulesCount: workflowRulesCount.total,
        approvalProcessesCount: approvalProcessesCount.total,
      },
      "Automation index fetched"
    );
    
    return {
      flows,
      triggers,
      validationRules: validationRules.length > 0 ? validationRules : validationRulesCount,
      workflowRules: workflowRulesCount,
      approvalProcesses: approvalProcessesCount,
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
    console.log(`[getFlows] Executing FlowDefinition query...`);
    let defResult;
    try {
      defResult = await soql(instanceUrl, accessToken, apiVersion, defQuery, requestId, { tooling: true });
      console.log(`[getFlows] FlowDefinition query SUCCESS: ${defResult.records?.length || 0} records`);
    } catch (err: any) {
      const errorMsg = `FlowDefinition query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[getFlows] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[getFlows] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status, query: defQuery }, "FlowDefinition query failed");
      defResult = { records: [] };
    }
    
    logger.info({ defRecords: defResult.records?.length || 0 }, "FlowDefinition query result");
    
    // Query Flow for status (simplified - remove fields that may not be accessible)
    const flowQuery = `SELECT Id, ApiVersion, Status, DeveloperName, ProcessType, TriggerType, TableEnumOrId, VersionNumber FROM Flow`;
    console.log(`[getFlows] Executing Flow query...`);
    let flowResult;
    try {
      flowResult = await soql(instanceUrl, accessToken, apiVersion, flowQuery, requestId, { tooling: true });
      console.log(`[getFlows] Flow query SUCCESS: ${flowResult.records?.length || 0} records`);
    } catch (err: any) {
      const errorMsg = `Flow query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[getFlows] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[getFlows] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status, query: flowQuery }, "Flow query failed");
      flowResult = { records: [] };
    }
    
    logger.info({ flowRecords: flowResult.records?.length || 0 }, "Flow query result");
    
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
    console.log(`[getTriggers] Executing ApexTrigger query...`);
    let result;
    try {
      result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
      console.log(`[getTriggers] ApexTrigger query SUCCESS: ${result.records?.length || 0} records`);
    } catch (err: any) {
      const errorMsg = `ApexTrigger query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[getTriggers] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[getTriggers] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status, query }, "ApexTrigger query failed");
      result = { records: [] };
    }
    
    logger.info({ triggerRecords: result.records?.length || 0 }, "ApexTrigger query result");
    
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
  const VALIDATION_RULES_TIMEOUT_MS = 10000; // 10 seconds timeout
  
  // Try multiple approaches to query ValidationRule
  const attempts = [
    {
      query: "SELECT Id, FullName, Active, ErrorConditionFormula, ErrorDisplayField, ErrorMessage FROM ValidationRule",
      tooling: true,
      name: "Tooling API - all fields",
    },
    {
      query: "SELECT Id, FullName, Active FROM ValidationRule",
      tooling: true,
      name: "Tooling API - basic fields",
    },
    {
      query: "SELECT Id, FullName, Active, ErrorConditionFormula, ErrorDisplayField, ErrorMessage FROM ValidationRule",
      tooling: false,
      name: "REST API - all fields",
    },
    {
      query: "SELECT Id, FullName, Active FROM ValidationRule",
      tooling: false,
      name: "REST API - basic fields",
    },
  ];
  
  for (const attempt of attempts) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Validation rules query timeout")), VALIDATION_RULES_TIMEOUT_MS)
      );
      
      const queryPromise = soql(instanceUrl, accessToken, apiVersion, attempt.query, requestId, { tooling: attempt.tooling });
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      logger.info({ 
        method: attempt.name, 
        recordCount: result.records?.length || 0,
        hasRecords: !!result.records,
        sampleRecord: result.records?.[0] ? Object.keys(result.records[0]) : null
      }, "Validation rules query result");
      
      if (result.records && result.records.length > 0) {
        const validationRules: ValidationRule[] = result.records.map((vr: any) => ({
          id: vr.Id,
          fullName: vr.FullName || "",
          active: vr.Active === true,
          errorConditionFormula: vr.ErrorConditionFormula || undefined,
          errorDisplayField: vr.ErrorDisplayField || undefined,
          errorMessage: vr.ErrorMessage || undefined,
        }));
        
        logger.info({ count: validationRules.length, method: attempt.name, sampleFullName: validationRules[0]?.fullName }, "Validation rules fetched successfully");
        return validationRules;
      } else {
        logger.debug({ method: attempt.name, recordCount: result.records?.length || 0 }, "Validation rules query returned no records - trying next method");
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || "Unknown error";
      const errorCode = error.response?.data?.[0]?.errorCode || error.response?.status;
      
      if (error.message?.includes("timeout")) {
        logger.debug({ method: attempt.name }, "Validation rules query timed out - trying next method");
        continue;
      } else {
        logger.debug({ 
          method: attempt.name, 
          error: errorMsg,
          errorCode,
          status: error.response?.status
        }, "Validation rules query failed - trying next method");
        continue;
      }
    }
  }
  
  // If all attempts failed, try querying through EntityDefinition
  // ValidationRule might be accessible through EntityDefinition.ValidationRules relationship
  try {
    logger.info("Attempting to fetch validation rules via EntityDefinition");
    const entityQuery = `SELECT QualifiedApiName, (SELECT Id, FullName, Active, ErrorConditionFormula, ErrorDisplayField, ErrorMessage FROM ValidationRules) FROM EntityDefinition WHERE IsCustomizable = true LIMIT 200`;
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("EntityDefinition validation rules query timeout")), VALIDATION_RULES_TIMEOUT_MS)
    );
    
    const queryPromise = soql(instanceUrl, accessToken, apiVersion, entityQuery, requestId, { tooling: true });
    const entityResult = await Promise.race([queryPromise, timeoutPromise]);
    
    logger.info({ 
      entityCount: entityResult.records?.length || 0,
      sampleEntity: entityResult.records?.[0] ? Object.keys(entityResult.records[0]) : null
    }, "EntityDefinition query result");
    
    if (entityResult.records && entityResult.records.length > 0) {
      const allValidationRules: ValidationRule[] = [];
      
      for (const entity of entityResult.records) {
        // Check if ValidationRules exists and has records
        const vrs = entity.ValidationRules;
        if (vrs) {
          // It might be a relationship query result with .records, or direct array
          const vrRecords = vrs.records || (Array.isArray(vrs) ? vrs : []);
          
          if (vrRecords.length > 0) {
            logger.debug({ 
              object: entity.QualifiedApiName, 
              vrCount: vrRecords.length 
            }, "Found validation rules for object");
            
            for (const vr of vrRecords) {
              allValidationRules.push({
                id: vr.Id || `${entity.QualifiedApiName}_${vr.FullName || 'unknown'}`,
                fullName: `${entity.QualifiedApiName}.${vr.FullName || vr.Id || 'unknown'}`,
                active: vr.Active === true,
                errorConditionFormula: vr.ErrorConditionFormula || undefined,
                errorDisplayField: vr.ErrorDisplayField || undefined,
                errorMessage: vr.ErrorMessage || undefined,
              });
            }
          }
        }
      }
      
      if (allValidationRules.length > 0) {
        logger.info({ count: allValidationRules.length }, "Validation rules fetched via EntityDefinition");
        return allValidationRules;
      } else {
        logger.warn("EntityDefinition query returned objects but no validation rules found");
      }
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || "Unknown error";
    logger.warn({ error: errorMsg }, "EntityDefinition validation rules query failed");
  }
  
  // Final fallback: Try to get validation rules from object describe calls
  // This uses the same discovery logic as the object scan to get ALL objects
  // SKIP THIS FOR NOW - it's too slow and blocks the scan
  // Validation rules will show as 0, which is acceptable
  logger.warn("Skipping describe-based validation rules fetch to avoid blocking scan");
  return [];
  
  /* DISABLED - Too slow, blocks scan
  try {
    logger.info("Attempting to fetch validation rules via object describe calls for all objects");
    
    // Add timeout for the entire describe-based approach - keep it short to not block scan
    const DESCRIBE_TIMEOUT_MS = 10000; // 10 seconds max for all describe calls
    
    // Use the same discovery logic as object scan to get all customizable objects
    let allObjectNames: string[] = [];
    
    try {
      // Try REST API /sobjects/ endpoint first (same as object discovery)
      const sobjects = await sfGet(instanceUrl, accessToken, `/services/data/${apiVersion}/sobjects/`, requestId);
      const allObjects = sobjects.sobjects || [];
      
      // Get all custom objects and key standard objects
      const customObjects = allObjects
        .filter((obj: any) => obj.custom === true)
        .map((obj: any) => obj.name);
      
      const standardObjects = allObjects
        .filter((obj: any) => !obj.custom && ['Account', 'Contact', 'Case', 'Opportunity', 'Lead', 'Contract', 'Order', 'Product2'].includes(obj.name))
        .map((obj: any) => obj.name);
      
      allObjectNames = [...new Set([...standardObjects, ...customObjects])];
      logger.info({ count: allObjectNames.length }, "Discovered objects for validation rules via REST API");
    } catch (error) {
      // Fallback to Tooling API (same as object discovery)
      logger.debug("REST API discovery failed, trying Tooling API for validation rules");
      
      let allObjects: string[] = [];
      let done = false;
      let nextRecordsUrl = "";
      
      while (!done) {
        let result;
        if (nextRecordsUrl) {
          // Use nextRecordsUrl directly via GET request
          result = await sfGet(instanceUrl, accessToken, nextRecordsUrl, requestId).catch(() => ({ done: true, records: [] }));
        } else {
          // First query
          const query = `SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true LIMIT 200`;
          result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
        }
        
        allObjects.push(...(result.records || []).map((r: any) => r.QualifiedApiName));
        
        if (result.done || !result.nextRecordsUrl) {
          done = true;
        } else {
          nextRecordsUrl = result.nextRecordsUrl;
        }
      }
      
      allObjectNames = [...new Set(['Account', 'Contact', 'Case', 'Opportunity', 'Lead', 'Contract', 'Order', 'Product2', ...allObjects])];
      logger.info({ count: allObjectNames.length }, "Discovered objects for validation rules via Tooling API");
    }
    
    if (allObjectNames.length === 0) {
      logger.warn("No objects discovered for validation rules query");
      return [];
    }
    
    const allValidationRules: ValidationRule[] = [];
    const CONCURRENCY_LIMIT = 10; // Increase concurrency to speed things up
    const MAX_OBJECTS_TO_CHECK = 100; // Limit to first 100 objects to avoid long waits
    
    // Limit objects to check to avoid long waits
    const objectsToCheck = allObjectNames.slice(0, MAX_OBJECTS_TO_CHECK);
    logger.info({ totalObjects: allObjectNames.length, checkingObjects: objectsToCheck.length }, "Limiting validation rules check to first 100 objects for performance");
    
    // Wrap the entire describe process in a timeout
    const describePromise = (async () => {
      // Process objects in batches with concurrency limit
      for (let i = 0; i < objectsToCheck.length; i += CONCURRENCY_LIMIT) {
        const batch = objectsToCheck.slice(i, i + CONCURRENCY_LIMIT);
        
        await Promise.all(
          batch.map(async (objName) => {
            try {
              const describe = await sfGet(
                instanceUrl,
                accessToken,
                `/services/data/${apiVersion}/sobjects/${objName}/describe/`,
                requestId
              ).catch(() => null);
              
              if (describe?.validationRules && Array.isArray(describe.validationRules)) {
                for (const vr of describe.validationRules) {
                  allValidationRules.push({
                    id: vr.id || `${objName}_${vr.name || 'unknown'}`,
                    fullName: `${objName}.${vr.name || vr.id || 'unknown'}`,
                    active: vr.active === true,
                    errorConditionFormula: vr.errorConditionFormula || undefined,
                    errorDisplayField: vr.errorDisplayField || undefined,
                    errorMessage: vr.errorMessage || undefined,
                  });
                }
              }
            } catch (err: any) {
              // Skip objects that fail to describe
              logger.debug({ objectName: objName, error: err.message }, "Failed to describe object for validation rules");
            }
          })
        );
      }
    })();
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Describe-based validation rules fetch timeout")), DESCRIBE_TIMEOUT_MS)
    );
    
    try {
      await Promise.race([describePromise, timeoutPromise]);
    } catch (timeoutError: any) {
      if (timeoutError.message?.includes("timeout")) {
        logger.warn({ objectsProcessed: allValidationRules.length, totalObjects: allObjectNames.length }, "Describe-based validation rules fetch timed out - returning partial results");
        // Return what we have so far
        if (allValidationRules.length > 0) {
          return allValidationRules;
        }
      }
      throw timeoutError;
    }
    
    if (allValidationRules.length > 0) {
      logger.info({ count: allValidationRules.length, objectsChecked: allObjectNames.length }, "Validation rules fetched via describe calls");
      return allValidationRules;
    } else {
      logger.info({ objectsChecked: allObjectNames.length }, "No validation rules found in any objects");
    }
  } catch (error: any) {
    logger.warn({ error: error.message, stack: error.stack }, "Describe-based validation rules fetch failed");
    // Don't throw - return empty array so scan can continue
  }
  
  // If all attempts failed, log and return empty array
  logger.warn("All validation rules query attempts failed - ValidationRule is not queryable via SOQL in this org. Validation rules are metadata components and require Metadata API or describe calls.");
  return [];
  */ // END DISABLED
}
