import { CodeIndex, ReportingIndex } from "@/lib/types";
import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

/**
 * Fetches Apex code coverage data with timeout protection
 * Uses a shorter timeout to prevent blocking the scan
 */
async function fetchCoverageData(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  apexClasses: Array<{ id: string; name: string }>,
  apexTriggers: Array<{ id: string; name: string }>,
  requestId: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<CodeIndex["coverage"] | undefined> {
  const COVERAGE_TIMEOUT_MS = 9000; // 9 seconds - increased to allow more time for coverage queries
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Coverage query timeout")), COVERAGE_TIMEOUT_MS)
    );
    
    const coveragePromise = fetchCoverageDataInternal(
      instanceUrl,
      accessToken,
      apiVersion,
      apexClasses,
      apexTriggers,
      requestId,
      logger
    );
    
    return await Promise.race([coveragePromise, timeoutPromise]);
  } catch (err: any) {
    logger.warn({ error: err?.message }, "Coverage fetch failed or timed out - continuing without coverage");
    return undefined;
  }
}

/**
 * Internal function to fetch coverage data from Salesforce Tooling API
 */
async function fetchCoverageDataInternal(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  apexClasses: Array<{ id: string; name: string }>,
  apexTriggers: Array<{ id: string; name: string }>,
  requestId: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<CodeIndex["coverage"]> {
  // Build map of both classes and triggers (coverage includes both)
  const classMap = new Map<string, string>();
  apexClasses.forEach((c) => classMap.set(c.id, c.name));
  apexTriggers.forEach((t) => classMap.set(t.id, t.name));
  
  // Fetch org-wide coverage
  const orgWideData = await fetchOrgWideCoverage(
    instanceUrl,
    accessToken,
    apiVersion,
    requestId,
    logger
  );
  
  // Fetch per-class coverage
  const byClass = await fetchPerClassCoverage(
    instanceUrl,
    accessToken,
    apiVersion,
    classMap,
    requestId,
    logger
  );
  
  const note = (!orgWideData.orgWidePercent && byClass.length === 0)
    ? "No coverage data found. Run any tests in this org to populate Tooling coverage tables."
    : undefined;
  
  return {
    orgWidePercent: orgWideData.orgWidePercent,
    byClass,
    lastComputedAt: orgWideData.lastComputedAt,
    note,
  };
}

/**
 * Fetches org-wide coverage percentage
 */
async function fetchOrgWideCoverage(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<{ orgWidePercent: number | null; lastComputedAt: string | null }> {
  try {
    const orgRes = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT PercentCovered, CalculatedAt FROM ApexOrgWideCoverage",
      requestId,
      { tooling: true }
    ).catch(() => ({ records: [] }));
    
    if (orgRes.records?.length) {
      return {
        orgWidePercent: orgRes.records[0].PercentCovered ?? null,
        lastComputedAt: orgRes.records[0].CalculatedAt ?? null,
      };
    }
    
    return { orgWidePercent: null, lastComputedAt: null };
  } catch (err: any) {
    logger.debug({ error: err?.message }, "Failed to fetch org-wide coverage");
    return { orgWidePercent: null, lastComputedAt: null };
  }
}

/**
 * Fetches per-class coverage data
 */
async function fetchPerClassCoverage(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  classMap: Map<string, string>,
  requestId: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<Array<{
  id: string;
  name: string;
  numLinesCovered: number;
  numLinesUncovered: number;
  percent?: number;
}>> {
  try {
    const covRes = await soql(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate",
      requestId,
      { tooling: true }
    ).catch(() => ({ records: [] }));
    
    return (covRes.records || []).map((r: any) => {
      const covered = Number(r.NumLinesCovered || 0);
      const uncovered = Number(r.NumLinesUncovered || 0);
      const total = covered + uncovered;
      
      return {
        id: r.ApexClassOrTriggerId,
        name: classMap.get(r.ApexClassOrTriggerId) ?? r.ApexClassOrTriggerId,
        numLinesCovered: covered,
        numLinesUncovered: uncovered,
        percent: total > 0 ? Math.round((covered / total) * 100) : undefined,
      };
    });
  } catch (err: any) {
    logger.debug({ error: err?.message }, "Failed to fetch per-class coverage");
    return [];
  }
}

export async function fetchCodeIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<CodeIndex> {
  const logger = createLogger(requestId);
  
  try {
    console.log(`[fetchCodeIndex] Executing ApexClass and ApexTrigger queries...`);
    let classesResult, triggersResult;
    
    try {
      classesResult = await soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name, ApiVersion FROM ApexClass",
        requestId,
        { tooling: true }
      );
      console.log(`[fetchCodeIndex] ApexClass query SUCCESS: ${classesResult.records?.length || 0} records`);
    } catch (err: any) {
      const errorMsg = `ApexClass query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[fetchCodeIndex] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[fetchCodeIndex] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status }, "ApexClass query failed");
      classesResult = { records: [] };
    }
    
    try {
      triggersResult = await soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name, ApiVersion FROM ApexTrigger",
        requestId,
        { tooling: true }
      );
      console.log(`[fetchCodeIndex] ApexTrigger query SUCCESS: ${triggersResult.records?.length || 0} records`);
    } catch (err: any) {
      const errorMsg = `ApexTrigger query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[fetchCodeIndex] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[fetchCodeIndex] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status }, "ApexTrigger query failed");
      triggersResult = { records: [] };
    }
    logger.info({ 
      apexClasses: classesResult.records?.length || 0, 
      apexTriggers: triggersResult.records?.length || 0 
    }, "Apex queries result");
    
    const apexClasses = (classesResult.records || []).map((c: any) => ({
      id: c.Id,
      name: c.Name,
      apiVersion: c.ApiVersion || apiVersion,
    }));
    
    const apexTriggers = (triggersResult.records || []).map((t: any) => ({
      id: t.Id,
      name: t.Name,
      apiVersion: t.ApiVersion || apiVersion,
    }));
    
    // Fetch coverage data (non-blocking, optional, with timeout)
    // Use Promise.race with timeout to prevent blocking scan
    let coverage: CodeIndex["coverage"] | undefined;
    try {
      coverage = await Promise.race([
        fetchCoverageData(
          instanceUrl,
          accessToken,
          apiVersion,
          apexClasses,
          apexTriggers,
          requestId,
          logger
        ),
        new Promise<undefined>((resolve) => 
          setTimeout(() => {
            logger.warn({}, "Coverage fetch timed out after 10 seconds - continuing without coverage data");
            resolve(undefined);
          }, 10000) // 10 second max wait (increased from 6s)
        )
      ]);
    } catch (err: any) {
      logger.warn({ error: err?.message }, "Coverage fetch failed - continuing without coverage data");
      coverage = undefined;
    }
    
    logger.info({ 
      classes: apexClasses.length, 
      triggers: apexTriggers.length,
      coverageAvailable: !!coverage,
      orgWidePercent: coverage?.orgWidePercent,
      classesWithCoverage: coverage?.byClass.length || 0
    }, "Code index fetched");
    
    return { 
      apexClasses, 
      apexTriggers,
      ...(coverage ? { coverage } : {})
    };
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch code index");
    return { apexClasses: [], apexTriggers: [] };
  }
}

export async function fetchReportingIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<ReportingIndex> {
  const logger = createLogger(requestId);
  
  try {
    const [reportsResult, dashboardsResult, templatesResult, reportTypesResult] = await Promise.all([
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name FROM Report",
        requestId
      ).catch(() => ({ records: [] })),
      // Dashboard is not directly queryable via SOQL - skip for now
      Promise.resolve({ records: [] }),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name FROM EmailTemplate",
        requestId
      ).catch(() => ({ records: [] })),
      // ReportType is not directly queryable via SOQL - skip for now
      Promise.resolve({ records: [] }),
    ]);
    
    const reports = (reportsResult.records || []).map((r: any) => ({ id: r.Id, name: r.Name }));
    const dashboards = (dashboardsResult.records || []).map((d: any) => ({ id: d.Id, name: d.Name }));
    const emailTemplates = (templatesResult.records || []).map((t: any) => ({ id: t.Id, name: t.Name }));
    const reportTypes = (reportTypesResult.records || []).map((rt: any) => ({ id: rt.Id, name: rt.Name }));
    
    logger.info(
      { reports: reports.length, dashboards: dashboards.length, templates: emailTemplates.length, reportTypes: reportTypes.length },
      "Reporting index fetched"
    );
    
    return { reports, dashboards, emailTemplates, reportTypes };
  } catch (error: any) {
    logger.error({ error }, "Failed to fetch reporting index");
    return { reports: [], dashboards: [], emailTemplates: [], reportTypes: [] };
  }
}
