import { sfGet, soql } from "../salesforce/rest";
import { OrgProfile, StorageUsage } from "@/lib/types";
import { createLogger } from "../logger";

function pct(used: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.round((used / max) * 100);
}

export async function fetchOrgProfile(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<OrgProfile> {
  const logger = createLogger(requestId);
  
  try {
    const [limitsData, orgDescribe, licensesResult, identityInfo] = await Promise.all([
      sfGet(instanceUrl, accessToken, `/services/data/${apiVersion}/limits`, requestId).catch(() => ({})),
      sfGet(instanceUrl, accessToken, `/services/data/${apiVersion}/sobjects/Organization/describe`, requestId).catch(() => ({})),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name, LicenseDefinitionKey, UsedLicenses, TotalLicenses FROM UserLicense",
        requestId
      ).catch(() => ({ records: [] })),
      // Try identity endpoint to get org info (correct path is /id or /services/oauth2/userinfo)
      sfGet(instanceUrl, accessToken, `/id`, requestId).catch(() => 
        sfGet(instanceUrl, accessToken, `/services/oauth2/userinfo`, requestId).catch(() => ({}))
      ),
    ]);

    // Get org ID from identity endpoint or describe
    const orgId = identityInfo.organization_id || orgDescribe.organizationId || "";
    
    logger.debug({ 
      identityOrgId: identityInfo.organization_id,
      describeOrgId: orgDescribe.organizationId,
      finalOrgId: orgId,
      identityKeys: Object.keys(identityInfo || {})
    }, "Org ID resolution");
    
    let edition = "Unknown";
    let isSandbox = false;
    let instanceName = "";
    let orgName = "";
    let dataSpaceUsed: number | undefined;
    let dataSpaceTotal: number | undefined;
    let fileSpaceUsed: number | undefined;
    let fileSpaceTotal: number | undefined;
    
    // Try to get Organization record directly via REST API using orgId from identity
    if (orgId) {
      try {
        const orgRecord = await sfGet(
          instanceUrl,
          accessToken,
          `/services/data/${apiVersion}/sobjects/Organization/${orgId}`,
          requestId
        );
        edition = orgRecord.Edition || orgRecord.OrganizationType || edition;
        isSandbox = orgRecord.IsSandbox === true;
        instanceName = orgRecord.InstanceName || "";
        orgName = orgRecord.Name || "";
        // Data and File Space fields (in bytes)
        dataSpaceUsed = orgRecord.UsedDataSpace ? Number(orgRecord.UsedDataSpace) : undefined;
        dataSpaceTotal = orgRecord.DataStorage ? Number(orgRecord.DataStorage) : (orgRecord.TotalDataSpace ? Number(orgRecord.TotalDataSpace) : undefined);
        fileSpaceUsed = orgRecord.UsedFileSpace ? Number(orgRecord.UsedFileSpace) : undefined;
        fileSpaceTotal = orgRecord.FileStorage ? Number(orgRecord.FileStorage) : (orgRecord.TotalFileSpace ? Number(orgRecord.TotalFileSpace) : undefined);
        logger.info({ orgId, edition, isSandbox, orgName, dataSpaceUsed, fileSpaceUsed }, "Fetched Organization record via REST API");
      } catch (err: any) {
        logger.warn({ error: err.message, orgId }, "Could not fetch Organization record via REST API");
      }
    }
    
    // Fallback: Try to infer from instance URL or identity endpoint
    if (edition === "Unknown") {
      // Check if it's a sandbox from instance URL
      if (instanceUrl.includes("--") || instanceUrl.includes(".sandbox.") || instanceUrl.includes("test.")) {
        isSandbox = true;
      }
      // If we still don't have orgId, try from identity endpoint
      if (!orgId && identityInfo.organization_id) {
        try {
          const orgRecord = await sfGet(
            instanceUrl,
            accessToken,
            `/services/data/${apiVersion}/sobjects/Organization/${identityInfo.organization_id}`,
            requestId
          );
          edition = orgRecord.Edition || orgRecord.OrganizationType || edition;
          isSandbox = orgRecord.IsSandbox === true;
          instanceName = orgRecord.InstanceName || instanceName;
          orgName = orgRecord.Name || orgName;
          // Data and File Space fields (in bytes)
          if (!dataSpaceUsed && orgRecord.UsedDataSpace) dataSpaceUsed = Number(orgRecord.UsedDataSpace);
          if (!dataSpaceTotal) {
            dataSpaceTotal = orgRecord.DataStorage ? Number(orgRecord.DataStorage) : (orgRecord.TotalDataSpace ? Number(orgRecord.TotalDataSpace) : undefined);
          }
          if (!fileSpaceUsed && orgRecord.UsedFileSpace) fileSpaceUsed = Number(orgRecord.UsedFileSpace);
          if (!fileSpaceTotal) {
            fileSpaceTotal = orgRecord.FileStorage ? Number(orgRecord.FileStorage) : (orgRecord.TotalFileSpace ? Number(orgRecord.TotalFileSpace) : undefined);
          }
          logger.info({ orgId: identityInfo.organization_id, edition, isSandbox, orgName }, "Fetched Organization from identity orgId");
        } catch (err: any) {
          logger.warn({ error: err.message }, "Could not fetch Organization from identity orgId");
        }
      }
      
      // Last resort: Try to infer from license types
      if (edition === "Unknown" && licensesResult.records && licensesResult.records.length > 0) {
        const licenseKeys = licensesResult.records.map((l: any) => l.LicenseDefinitionKey || "").join(",").toLowerCase();
        if (licenseKeys.includes("salesforce")) {
          // Check for specific edition indicators in license names
          const licenseNames = licensesResult.records.map((l: any) => l.Name || "").join(" ").toLowerCase();
          if (licenseNames.includes("unlimited") || licenseNames.includes("performance")) {
            edition = "Unlimited Edition";
          } else if (licenseNames.includes("enterprise")) {
            edition = "Enterprise Edition";
          } else if (licenseNames.includes("professional")) {
            edition = "Professional Edition";
          } else if (licenseNames.includes("group")) {
            edition = "Group Edition";
          } else if (licenseNames.includes("contact manager")) {
            edition = "Contact Manager Edition";
          } else if (licenseNames.includes("developer")) {
            edition = "Developer Edition";
          }
        }
      }
    }
    
    // Compute storage from limits (use the data we already fetched)
    let storage: StorageUsage | undefined;
    try {
      const lim = limitsData || {};
      
      const dataMax = lim?.DataStorage?.Max ?? lim?.DataStorageMB?.Max ?? null;
      const dataRem = lim?.DataStorage?.Remaining ?? lim?.DataStorageMB?.Remaining ?? null;
      const fileMax = lim?.FileStorage?.Max ?? lim?.FileStorageMB?.Max ?? null;
      const fileRem = lim?.FileStorage?.Remaining ?? lim?.FileStorageMB?.Remaining ?? null;
      
      if (dataMax != null && dataRem != null && fileMax != null && fileRem != null) {
        const dataUsed = Math.max(0, Number(dataMax) - Number(dataRem));
        const fileUsed = Math.max(0, Number(fileMax) - Number(fileRem));
        storage = {
          data: { 
            usedMb: dataUsed, 
            maxMb: Number(dataMax), 
            remainingMb: Number(dataRem), 
            usedPct: pct(dataUsed, Number(dataMax)) 
          },
          file: { 
            usedMb: fileUsed, 
            maxMb: Number(fileMax), 
            remainingMb: Number(fileRem), 
            usedPct: pct(fileUsed, Number(fileMax)) 
          }
        };
        logger.info({ dataUsed, dataMax, fileUsed, fileMax }, "Storage computed from limits");
      } else {
        storage = {
          data: { usedMb: 0, maxMb: 0, remainingMb: 0, usedPct: 0 },
          file: { usedMb: 0, maxMb: 0, remainingMb: 0, usedPct: 0 },
          note: "Storage limits not available for this org/API version"
        };
        logger.warn("Storage limits not available in /limits response");
      }
    } catch (e: any) {
      storage = {
        data: { usedMb: 0, maxMb: 0, remainingMb: 0, usedPct: 0 },
        file: { usedMb: 0, maxMb: 0, remainingMb: 0, usedPct: 0 },
        note: `Failed to fetch /limits: ${e?.message ?? "unknown error"}`
      };
      logger.warn({ error: e?.message }, "Failed to fetch limits for storage calculation");
    }

    logger.info({ 
      orgId, 
      edition, 
      isSandbox,
      instanceName,
      licenses: licensesResult.records?.length,
      storageAvailable: !!storage && !storage.note
    }, "Org profile fetched");

    return {
      instanceUrl,
      apiVersion,
      orgId,
      edition,
      organizationName: orgName,
      dataSpaceUsed,
      dataSpaceTotal,
      fileSpaceUsed,
      fileSpaceTotal,
      storage,
      limits: limitsData,
      organization: {
        ...orgDescribe,
        isSandbox,
        instanceName,
        organizationId: orgId,
      },
      userLicenses: licensesResult.records || [],
    };
  } catch (error: any) {
    if (error.response?.status === 401 || error.statusCode === 401 || error.isAuthError) {
      logger.error({ error }, "Authentication failed");
      const authError = new Error("Access token expired or invalid");
      (authError as any).statusCode = 401;
      (authError as any).isAuthError = true;
      throw authError;
    }
    throw error;
  }
}

