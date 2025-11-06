import { sfGet, soql } from "../salesforce/rest";
import { OrgProfile } from "@/lib/types";
import { createLogger } from "../logger";

export async function fetchOrgProfile(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<OrgProfile> {
  const logger = createLogger(requestId);
  
  try {
    const [limits, orgDescribe, licensesResult, identityInfo] = await Promise.all([
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
        logger.info({ orgId, edition, isSandbox }, "Fetched Organization record via REST API");
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
          logger.info({ orgId: identityInfo.organization_id, edition, isSandbox }, "Fetched Organization from identity orgId");
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
    
    logger.info({ 
      orgId, 
      edition, 
      isSandbox,
      instanceName,
      licenses: licensesResult.records?.length 
    }, "Org profile fetched");

    return {
      instanceUrl,
      apiVersion,
      orgId,
      edition,
      limits,
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

