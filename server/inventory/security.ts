import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export interface ProfileInfo {
  id: string;
  name: string;
  userLicense: string;
  userCount: number;
}

export interface PermissionSetInfo {
  id: string;
  name: string;
  label: string;
  userLicense: string;
  assignmentCount: number;
}

export interface SecurityIndex {
  profiles: ProfileInfo[];
  permissionSets: PermissionSetInfo[];
  totalProfiles: number;
  totalPermissionSets: number;
  totalUsers: number;
  licenseDistribution: Record<string, { total: number; used: number; available: number }>;
}

export async function fetchSecurityIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<SecurityIndex> {
  const logger = createLogger(requestId);
  
  try {
    // Fetch profiles
    const profilesResult = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT Id, Name, UserLicenseId FROM Profile",
      requestId
    ).catch(() => ({ records: [] }));

    // Fetch permission sets - try multiple approaches
    let permSetsResult: { records: any[] } = { records: [] };
    const permSetAttempts = [
      // Attempt 1: Simple REST query with minimal fields
      {
        query: "SELECT Id, Name FROM PermissionSet",
        tooling: false,
        name: "REST - basic fields",
      },
      // Attempt 2: REST with Label
      {
        query: "SELECT Id, Name, Label FROM PermissionSet",
        tooling: false,
        name: "REST - with Label",
      },
      // Attempt 3: REST with UserLicenseId
      {
        query: "SELECT Id, Name, UserLicenseId FROM PermissionSet",
        tooling: false,
        name: "REST - with UserLicenseId",
      },
      // Attempt 4: REST with WHERE IsCustom
      {
        query: "SELECT Id, Name, Label, UserLicenseId FROM PermissionSet WHERE IsCustom = true",
        tooling: false,
        name: "REST - with IsCustom filter",
      },
      // Attempt 5: Tooling API basic
      {
        query: "SELECT Id, Name FROM PermissionSet",
        tooling: true,
        name: "Tooling - basic fields",
      },
      // Attempt 6: Tooling with all fields
      {
        query: "SELECT Id, Name, Label, UserLicenseId FROM PermissionSet",
        tooling: true,
        name: "Tooling - all fields",
      },
    ];

    for (const attempt of permSetAttempts) {
      try {
        logger.debug({ query: attempt.query, api: attempt.tooling ? "Tooling" : "REST" }, `Trying PermissionSet query: ${attempt.name}`);
        permSetsResult = await soql(
          instanceUrl,
          accessToken,
          apiVersion,
          attempt.query,
          requestId,
          attempt.tooling ? { tooling: true } : undefined
        );
        if (permSetsResult.records && permSetsResult.records.length > 0) {
          logger.info({ count: permSetsResult.records.length, method: attempt.name }, "PermissionSet query succeeded");
          break;
        }
      } catch (error: any) {
        logger.debug({ error: error.message, method: attempt.name }, `PermissionSet query attempt failed`);
        continue;
      }
    }

    if (permSetsResult.records.length === 0) {
      logger.warn("All PermissionSet query attempts failed or returned no results");
      // Last resort: try to get permission sets via PermissionSetAssignment
      try {
        logger.debug("Attempting to fetch PermissionSet via PermissionSetAssignment");
        const assignmentResult = await soql(
          instanceUrl,
          accessToken,
          apiVersion,
          "SELECT PermissionSetId, PermissionSet.Name, PermissionSet.Label, PermissionSet.UserLicenseId FROM PermissionSetAssignment LIMIT 1000",
          requestId
        ).catch(() => ({ records: [] }));
        
        if (assignmentResult.records && assignmentResult.records.length > 0) {
          // Extract unique permission sets from assignments
          const permSetMap = new Map();
          for (const assignment of assignmentResult.records) {
            if (assignment.PermissionSet && assignment.PermissionSetId) {
              permSetMap.set(assignment.PermissionSetId, {
                Id: assignment.PermissionSetId,
                Name: assignment.PermissionSet.Name,
                Label: assignment.PermissionSet.Label,
                UserLicenseId: assignment.PermissionSet.UserLicenseId,
              });
            }
          }
          permSetsResult = { records: Array.from(permSetMap.values()) };
          logger.info({ count: permSetsResult.records.length }, "PermissionSet fetched via PermissionSetAssignment");
        }
      } catch (assignmentError: any) {
        logger.warn({ error: assignmentError.message }, "PermissionSetAssignment query also failed");
      }
    }

    // User queries are restricted by field-level security - skip for now
    // We'll use license data instead to show distribution
    const usersResult = { records: [] };

    // Fetch license details
    const licensesResult = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT Id, Name, LicenseDefinitionKey, UsedLicenses, TotalLicenses FROM UserLicense",
      requestId
    ).catch(() => ({ records: [] }));

    // Build license map
    const licenseMap = new Map<string, { name: string; total: number; used: number }>();
    for (const lic of licensesResult.records || []) {
      licenseMap.set(lic.Id, {
        name: lic.Name || lic.LicenseDefinitionKey || "Unknown",
        total: lic.TotalLicenses || 0,
        used: lic.UsedLicenses || 0,
      });
    }

    // Build profiles (user counts unavailable due to User query restrictions)
    const profiles: ProfileInfo[] = (profilesResult.records || []).map((p: any) => ({
      id: p.Id,
      name: p.Name,
      userLicense: licenseMap.get(p.UserLicenseId)?.name || "Unknown",
      userCount: 0, // User queries restricted - cannot get user counts per profile
    }));

    // Count permission set assignments (simplified - would need PermissionSetAssignment query)
    const permSetAssignments = new Map<string, number>();
    // For now, we'll set a placeholder - in production, query PermissionSetAssignment
    for (const ps of permSetsResult.records || []) {
      permSetAssignments.set(ps.Id, 0); // Placeholder
    }

    // Process permission sets - filter out system ones if IsCustom is available
    const permissionSets: PermissionSetInfo[] = (permSetsResult.records || [])
      .filter((ps: any) => {
        // If IsCustom field exists and is false, exclude it
        if (ps.IsCustom !== undefined && ps.IsCustom === false) {
          return false;
        }
        // Include all others (if IsCustom is true or undefined)
        return ps.Id && ps.Name;
      })
      .map((ps: any) => ({
        id: ps.Id,
        name: ps.Name,
        label: ps.Label || ps.Name,
        userLicense: ps.UserLicenseId ? (licenseMap.get(ps.UserLicenseId)?.name || "Unknown") : "Unknown",
        assignmentCount: permSetAssignments.get(ps.Id) || 0,
      }));

    logger.info({ 
      totalRecords: permSetsResult.records?.length || 0,
      filteredCount: permissionSets.length,
      sampleNames: permissionSets.slice(0, 3).map(ps => ps.name)
    }, "PermissionSet processing complete");

    // Build license distribution
    const licenseDistribution: Record<string, { total: number; used: number; available: number }> = {};
    for (const [licId, licInfo] of licenseMap.entries()) {
      licenseDistribution[licInfo.name] = {
        total: licInfo.total,
        used: licInfo.used,
        available: licInfo.total - licInfo.used,
      };
    }

    logger.info(
      {
        profiles: profiles.length,
        permissionSets: permissionSets.length,
        users: usersResult.records?.length || 0,
        licenses: Object.keys(licenseDistribution).length,
      },
      "Security index fetched"
    );

    return {
      profiles,
      permissionSets,
      totalProfiles: profiles.length,
      totalPermissionSets: permissionSets.length,
      totalUsers: Array.from(licenseMap.values()).reduce((sum, lic) => sum + lic.used, 0), // Sum of used licenses
      licenseDistribution,
    };
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch security index");
    return {
      profiles: [],
      permissionSets: [],
      totalProfiles: 0,
      totalPermissionSets: 0,
      totalUsers: 0,
      licenseDistribution: {},
    };
  }
}

