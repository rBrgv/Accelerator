import { sfGet } from "./rest";
import { createLogger } from "../logger";

/**
 * List metadata components of a given type using Metadata API
 * Returns array of component names or empty array on error
 */
export async function listMetadata(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  metadataType: string,
  requestId?: string
): Promise<{ items: Array<{ fullName: string }>; ok: boolean; error?: string }> {
  const logger = createLogger(requestId);
  
  try {
    // Metadata API list endpoint
    const path = `/services/data/${apiVersion}/tooling/sobjects/${metadataType}/`;
    
    // Try to query the metadata type as a Tooling API object first
    // Some metadata types are queryable via Tooling API
    try {
      const response = await sfGet(instanceUrl, accessToken, path, requestId);
      
      // If it's a describe response, we can't list directly
      // For now, return empty - we'll use a different approach
      if (response.sobjects || response.attributes) {
        return { items: [], ok: false, error: "Metadata type not directly queryable via Tooling API" };
      }
      
      return { items: [], ok: false, error: "Unexpected response format" };
    } catch (error: any) {
      // Tooling API approach failed, try Metadata API list
      // Note: Full Metadata API requires SOAP or special endpoints
      // For now, we'll return empty with error
      const errorMsg = error.response?.data?.message || error.message;
      logger.debug({ metadataType, error: errorMsg }, "Metadata list via Tooling failed");
      return { items: [], ok: false, error: errorMsg };
    }
  } catch (error: any) {
    const errorMsg = error.message || "Unknown error";
    logger.warn({ metadataType, error: errorMsg }, "Failed to list metadata");
    return { items: [], ok: false, error: errorMsg };
  }
}

/**
 * Alternative: Query metadata via Tooling API EntityDefinition relationships
 * This works for some metadata types that are related to objects
 */
export async function listMetadataViaEntityDefinition(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  relationshipName: string,
  requestId?: string
): Promise<{ items: Array<{ fullName: string }>; ok: boolean; error?: string }> {
  const logger = createLogger(requestId);
  
  try {
    // Query EntityDefinition with relationship
    const query = `SELECT QualifiedApiName, (SELECT Id, FullName FROM ${relationshipName}) FROM EntityDefinition WHERE IsCustomizable = true LIMIT 200`;
    
    const { soql } = await import("./rest");
    const result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
    
    const items: Array<{ fullName: string }> = [];
    for (const entity of result.records || []) {
      const related = entity[relationshipName];
      if (related) {
        const records = related.records || (Array.isArray(related) ? related : []);
        for (const item of records) {
          items.push({ fullName: item.FullName || `${entity.QualifiedApiName}.${item.Id}` });
        }
      }
    }
    
    return { items, ok: true };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.debug({ relationshipName, error: errorMsg }, "Metadata list via EntityDefinition failed");
    return { items: [], ok: false, error: errorMsg };
  }
}

