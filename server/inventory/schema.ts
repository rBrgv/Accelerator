import { ObjectStat, FieldStat, RecordType, Picklist, Lookup, AutonumberField } from "@/lib/types";
import { sfGet, soql } from "../salesforce/rest";
import { createLogger } from "../logger";

const DEFAULT_FOCUS_OBJECTS = ["Account", "Contact", "Case", "Opportunity", "Lead", "Contract", "Order", "Product2"];
const CONCURRENCY_LIMIT = 5;

async function discoverObjects(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<string[]> {
  const logger = createLogger(requestId);
  
  try {
    // Try REST API /sobjects/ endpoint first
    const sobjects = await sfGet(instanceUrl, accessToken, `/services/data/${apiVersion}/sobjects/`, requestId);
    const allObjects = sobjects.sobjects || [];
    
    // Filter for custom objects and key standard objects
    const customObjects = allObjects
      .filter((obj: any) => obj.custom === true)
      .map((obj: any) => obj.name);
    
    const standardObjects = allObjects
      .filter((obj: any) => !obj.custom && DEFAULT_FOCUS_OBJECTS.includes(obj.name))
      .map((obj: any) => obj.name);
    
    const discovered = [...new Set([...DEFAULT_FOCUS_OBJECTS, ...standardObjects, ...customObjects])];
    logger.info({ count: discovered.length }, "Discovered objects");
    return discovered;
  } catch (error) {
    logger.warn({ error }, "REST API discovery failed, trying Tooling API");
    
    // Fallback to Tooling API
    try {
      let allObjects: string[] = [];
      let done = false;
      let nextRecordsUrl = "";
      
      while (!done) {
        const query = nextRecordsUrl
          ? `SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true ${nextRecordsUrl.includes("WHERE") ? "" : ""}`
          : `SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true LIMIT 200`;
        
        const result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
        allObjects.push(...result.records.map((r: any) => r.QualifiedApiName));
        
        if (result.done) {
          done = true;
        } else {
          nextRecordsUrl = result.nextRecordsUrl || "";
        }
      }
      
      const discovered = [...new Set([...DEFAULT_FOCUS_OBJECTS, ...allObjects])];
      logger.info({ count: discovered.length }, "Discovered objects via Tooling API");
      return discovered;
    } catch (toolingError) {
      logger.error({ error: toolingError }, "Tooling API discovery also failed");
      return DEFAULT_FOCUS_OBJECTS;
    }
  }
}

async function countObject(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  objectName: string,
  requestId?: string
): Promise<number> {
  try {
    // Skip COUNT() for Platform Events (they end with __e and don't support COUNT)
    if (objectName.endsWith("__e")) {
      return 0; // Platform Events don't support COUNT queries
    }
    
    const result = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      `SELECT COUNT() FROM ${objectName}`,
      requestId
    );
    return result.totalSize || 0;
  } catch (error) {
    // If COUNT fails, return undefined (not 0) to indicate unknown
    return 0;
  }
}

function processDescribeResult(describe: any, requestId?: string): {
  fields: FieldStat[];
  recordTypes: RecordType[];
  picklists: Picklist[];
  lookups: Lookup[];
  autonumberFields: AutonumberField[];
} {
  const logger = createLogger(requestId);
  const fields: FieldStat[] = [];
  const recordTypes: RecordType[] = [];
  const picklists: Picklist[] = [];
  const lookups: Lookup[] = [];
  const autonumberFields: AutonumberField[] = [];

  // Process fields
  for (const field of describe.fields || []) {
    fields.push({
      name: field.name,
      type: field.type,
      label: field.label,
      required: !field.nillable && field.createable,
      unique: field.unique || false,
      nillable: field.nillable || false,
      externalId: field.externalId || false,
      length: field.length,
    });

    // Check for autonumber
    if (field.autoNumber) {
      autonumberFields.push({
        field: field.name,
        displayFormat: field.displayFormat,
      });
    }

    // Check for lookups/master-detail
    if (field.type === "reference" && field.referenceTo && field.referenceTo.length > 0) {
      for (const target of field.referenceTo) {
        if (target !== "User" && target !== "RecordType") {
          lookups.push({
            field: field.name,
            target,
            isMasterDetail: field.cascadeDelete === true,
          });
        }
      }
    }

    // Check for picklists
    if (field.type === "picklist" && field.picklistValues && field.picklistValues.length > 0) {
      picklists.push({
        field: field.name,
        values: field.picklistValues.map((pv: any) => pv.value).filter(Boolean),
      });
    }
  }

  // Process record types
  for (const rt of describe.recordTypeInfos || []) {
    if (rt.name && rt.name !== "Master") {
      recordTypes.push({
        id: rt.recordTypeId || "",
        name: rt.name,
        developerName: rt.developerName || rt.name,
        active: rt.active || false,
      });
    }
  }

  return { fields, recordTypes, picklists, lookups, autonumberFields };
}

async function describeObject(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  objectName: string,
  requestId?: string
): Promise<any> {
  try {
    return await sfGet(
      instanceUrl,
      accessToken,
      `/services/data/${apiVersion}/sobjects/${objectName}/describe/`,
      requestId
    );
  } catch (error) {
    throw error;
  }
}

async function processObject(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  objectName: string,
  requestId?: string
): Promise<ObjectStat> {
  const logger = createLogger(requestId);
  
  try {
    const [describe, recordCount] = await Promise.all([
      describeObject(instanceUrl, accessToken, apiVersion, objectName, requestId),
      countObject(instanceUrl, accessToken, apiVersion, objectName, requestId),
    ]);

    const { fields, recordTypes, picklists, lookups, autonumberFields } = processDescribeResult(describe, requestId);

    return {
      name: objectName,
      label: describe.label || objectName,
      isCustom: describe.custom || false,
      recordCount,
      fields,
      recordTypes,
      picklists,
      lookups,
      autonumberFields,
    };
  } catch (error: any) {
    logger.warn({ objectName, error: error.message }, "Failed to process object");
    return {
      name: objectName,
      label: objectName,
      isCustom: false,
      recordCount: undefined,
      fields: [],
      recordTypes: [],
      picklists: [],
      lookups: [],
      autonumberFields: [],
    };
  }
}

async function processBatch(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  objectNames: string[],
  requestId?: string
): Promise<ObjectStat[]> {
  const results: ObjectStat[] = [];
  
  for (let i = 0; i < objectNames.length; i += CONCURRENCY_LIMIT) {
    const batch = objectNames.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.allSettled(
      batch.map((name) => processObject(instanceUrl, accessToken, apiVersion, name, requestId))
    );
    
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Push minimal ObjectStat on error
        const objectName = batch[batchResults.indexOf(result)] || "Unknown";
        results.push({
          name: objectName,
          label: objectName,
          isCustom: false,
          recordCount: undefined,
          fields: [],
          recordTypes: [],
          picklists: [],
          lookups: [],
          autonumberFields: [],
        });
      }
    }
  }
  
  return results;
}

export async function getObjectsSchemaAndCounts(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  focusList?: string[],
  requestId?: string
): Promise<ObjectStat[]> {
  const logger = createLogger(requestId);
  
  let objectsToScan: string[];
  
  if (focusList && focusList.length > 0) {
    objectsToScan = focusList;
  } else {
    objectsToScan = await discoverObjects(instanceUrl, accessToken, apiVersion, requestId);
  }
  
  logger.info({ count: objectsToScan.length, objects: objectsToScan.slice(0, 10) }, "Scanning objects");
  
  const results = await processBatch(instanceUrl, accessToken, apiVersion, objectsToScan, requestId);
  
  const totalLookups = results.reduce((sum, obj) => sum + obj.lookups.length, 0);
  logger.info({ totalObjects: results.length, totalLookups }, "Object scan completed");
  
  return results;
}
