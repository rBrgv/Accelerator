import { OwnershipIndex } from "@/lib/types";
import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export async function fetchOwnershipIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<OwnershipIndex> {
  const logger = createLogger(requestId);
  
  try {
    const [usersResult, queuesResult] = await Promise.all([
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, ProfileId, UserLicenseId FROM User WHERE IsActive = true LIMIT 10000",
        requestId
      ).catch(() => {
        logger.warn("User query failed - may require different fields or permissions");
        return { records: [] };
      }),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name FROM Group WHERE Type = 'Queue'",
        requestId
      ).catch(() => ({ records: [] })),
    ]);
    
    // Get license names
    const licenseMap = new Map<string, string>();
    try {
      const licensesResult = await soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name FROM UserLicense",
        requestId
      );
      for (const lic of licensesResult.records || []) {
        licenseMap.set(lic.Id, lic.Name);
      }
    } catch {
      // Ignore license fetch errors
    }
    
    const users = (usersResult.records || []).map((u: any) => ({
      id: u.Id,
      name: `User-${u.Id.substring(0, 8)}`, // Fallback name if Name field not accessible
      license: licenseMap.get(u.UserLicenseId) || "Unknown",
      active: true, // All users in this query are active
    }));
    
    const queues = (queuesResult.records || []).map((q: any) => ({
      id: q.Id,
      name: q.Name,
    }));
    
    logger.info({ users: users.length, queues: queues.length }, "Ownership index fetched");
    
    return { users, queues };
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch ownership index");
    return { users: [], queues: [] };
  }
}
