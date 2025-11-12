import { CodeIndex, ReportingIndex } from "@/lib/types";
import { soql, sfGet } from "../salesforce/rest";
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
    let allClasses: any[] = [];
    let allTriggers: any[] = [];
    
    // Fetch Apex Classes with pagination
    try {
      let classesResult;
      let nextUrl: string | undefined;
      let pageCount = 0;
      
      do {
        if (nextUrl) {
          // Fetch next page - nextRecordsUrl from Salesforce is typically a full path like /services/data/v60.0/tooling/query/01g8c000002B88bAAC-2000
          // or just the query ID like 01g8c000002B88bAAC-2000
          let path: string;
          if (nextUrl.startsWith('/')) {
            path = nextUrl;
          } else {
            // If it's just the query ID, construct the full path
            path = `/services/data/${apiVersion}/tooling/query/${nextUrl}`;
          }
          console.log(`[fetchCodeIndex] ApexClass pagination: fetching page ${pageCount + 1}, nextUrl: ${nextUrl}`);
          classesResult = await sfGet(instanceUrl, accessToken, path, requestId);
        } else {
          // First page
          classesResult = await soql(
            instanceUrl,
            accessToken,
            apiVersion,
            "SELECT Id, Name, ApiVersion FROM ApexClass",
            requestId,
            { tooling: true }
          );
        }
        
        allClasses.push(...(classesResult.records || []));
        // Get nextRecordsUrl - Salesforce returns this when there are more records
        nextUrl = classesResult.nextRecordsUrl;
        pageCount++;
        
        const totalSize = classesResult.totalSize;
        const recordsThisPage = classesResult.records?.length || 0;
        
        if (pageCount === 1) {
          console.log(`[fetchCodeIndex] ApexClass query SUCCESS: ${recordsThisPage} records (first page), totalSize: ${totalSize || 'unknown'}, hasMore: ${!!nextUrl}`);
          console.log(`[fetchCodeIndex] ApexClass response keys: ${Object.keys(classesResult).join(', ')}`);
          if (nextUrl) {
            console.log(`[fetchCodeIndex] ApexClass nextRecordsUrl: ${nextUrl}`);
          }
          if (totalSize && totalSize > 2000 && !nextUrl) {
            console.warn(`[fetchCodeIndex] WARNING: totalSize (${totalSize}) > 2000 but no nextRecordsUrl! Pagination may be broken.`);
            console.warn(`[fetchCodeIndex] Full response structure:`, JSON.stringify(Object.keys(classesResult), null, 2));
          }
        } else {
          console.log(`[fetchCodeIndex] ApexClass page ${pageCount}: ${recordsThisPage} records, hasMore: ${!!nextUrl}`);
        }
        
        // Safety check: if we have exactly 2000 records and totalSize > 2000, but no nextUrl, log a warning
        if (allClasses.length === 2000 && totalSize && totalSize > 2000 && !nextUrl) {
          console.error(`[fetchCodeIndex] ERROR: Stopped at exactly 2000 records but totalSize is ${totalSize}. Pagination failed!`);
          console.error(`[fetchCodeIndex] Response structure:`, JSON.stringify({ 
            hasNextRecordsUrl: !!classesResult.nextRecordsUrl,
            keys: Object.keys(classesResult),
            totalSize,
            recordCount: allClasses.length
          }, null, 2));
        }
      } while (nextUrl && pageCount < 100); // Safety limit of 100 pages (200k records max)
      
      console.log(`[fetchCodeIndex] ApexClass total: ${allClasses.length} records (${pageCount} pages)`);
      if (allClasses.length === 2000) {
        console.warn(`[fetchCodeIndex] WARNING: Stopped at exactly 2000 records. This may indicate pagination is not working. Check if there are more records.`);
      }
    } catch (err: any) {
      const errorMsg = `ApexClass query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[fetchCodeIndex] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[fetchCodeIndex] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status }, "ApexClass query failed");
      allClasses = [];
    }
    
    // Fetch Apex Triggers with pagination
    try {
      let triggersResult;
      let nextUrl: string | undefined;
      let pageCount = 0;
      
      do {
        if (nextUrl) {
          // Fetch next page - nextRecordsUrl from Salesforce is typically a full path like /services/data/v60.0/tooling/query/01g8c000002B88bAAC-2000
          // or just the query ID like 01g8c000002B88bAAC-2000
          let path: string;
          if (nextUrl.startsWith('/')) {
            path = nextUrl;
          } else {
            // If it's just the query ID, construct the full path
            path = `/services/data/${apiVersion}/tooling/query/${nextUrl}`;
          }
          console.log(`[fetchCodeIndex] ApexTrigger pagination: fetching page ${pageCount + 1}, nextUrl: ${nextUrl}`);
          triggersResult = await sfGet(instanceUrl, accessToken, path, requestId);
        } else {
          // First page
          triggersResult = await soql(
            instanceUrl,
            accessToken,
            apiVersion,
            "SELECT Id, Name, ApiVersion FROM ApexTrigger",
            requestId,
            { tooling: true }
          );
        }
        
        allTriggers.push(...(triggersResult.records || []));
        nextUrl = triggersResult.nextRecordsUrl;
        pageCount++;
        
        const totalSize = triggersResult.totalSize;
        const recordsThisPage = triggersResult.records?.length || 0;
        
        if (pageCount === 1) {
          console.log(`[fetchCodeIndex] ApexTrigger query SUCCESS: ${recordsThisPage} records (first page), totalSize: ${totalSize || 'unknown'}, hasMore: ${!!nextUrl}`);
          if (totalSize && totalSize > 2000 && !nextUrl) {
            console.warn(`[fetchCodeIndex] WARNING: totalSize (${totalSize}) > 2000 but no nextRecordsUrl! Pagination may be broken.`);
          }
        } else {
          console.log(`[fetchCodeIndex] ApexTrigger page ${pageCount}: ${recordsThisPage} records, hasMore: ${!!nextUrl}`);
        }
        
        // Safety check: if we have exactly 2000 records and totalSize > 2000, but no nextUrl, log a warning
        if (allTriggers.length === 2000 && totalSize && totalSize > 2000 && !nextUrl) {
          console.error(`[fetchCodeIndex] ERROR: Stopped at exactly 2000 records but totalSize is ${totalSize}. Pagination failed!`);
        }
      } while (nextUrl && pageCount < 100); // Safety limit of 100 pages
      
      console.log(`[fetchCodeIndex] ApexTrigger total: ${allTriggers.length} records (${pageCount} pages)`);
      if (allTriggers.length === 2000) {
        console.warn(`[fetchCodeIndex] WARNING: Stopped at exactly 2000 records. This may indicate pagination is not working. Check if there are more records.`);
      }
    } catch (err: any) {
      const errorMsg = `ApexTrigger query failed: ${err.message} (Status: ${err.response?.status || 'unknown'})`;
      console.error(`[fetchCodeIndex] ${errorMsg}`);
      if (err.response?.data) {
        console.error(`[fetchCodeIndex] Error details:`, JSON.stringify(err.response.data, null, 2));
      }
      logger.error({ error: err.message, status: err.response?.status }, "ApexTrigger query failed");
      allTriggers = [];
    }
    logger.info({ 
      apexClasses: allClasses.length, 
      apexTriggers: allTriggers.length 
    }, "Apex queries result");
    
    const apexClasses = allClasses.map((c: any) => ({
      id: c.Id,
      name: c.Name,
      apiVersion: c.ApiVersion || apiVersion,
    }));
    
    const apexTriggers = allTriggers.map((t: any) => ({
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
    // Fetch Reports with pagination
    let allReports: any[] = [];
    try {
      let reportsResult;
      let nextUrl: string | undefined;
      let pageCount = 0;
      
      do {
        if (nextUrl) {
          let path: string;
          if (nextUrl.startsWith('/')) {
            path = nextUrl;
          } else {
            path = `/services/data/${apiVersion}/query/${nextUrl}`;
          }
          console.log(`[fetchReportingIndex] Reports pagination: fetching page ${pageCount + 1}, nextUrl: ${nextUrl}`);
          reportsResult = await sfGet(instanceUrl, accessToken, path, requestId);
        } else {
          reportsResult = await soql(
            instanceUrl,
            accessToken,
            apiVersion,
            "SELECT Id, Name FROM Report",
            requestId
          );
        }
        
        allReports.push(...(reportsResult.records || []));
        nextUrl = reportsResult.nextRecordsUrl;
        pageCount++;
        
        const totalSize = reportsResult.totalSize;
        const recordsThisPage = reportsResult.records?.length || 0;
        
        if (pageCount === 1) {
          console.log(`[fetchReportingIndex] Reports query SUCCESS: ${recordsThisPage} records (first page), totalSize: ${totalSize || 'unknown'}, hasMore: ${!!nextUrl}`);
        } else {
          console.log(`[fetchReportingIndex] Reports page ${pageCount}: ${recordsThisPage} records, hasMore: ${!!nextUrl}`);
        }
        
        if (allReports.length === 2000 && totalSize && totalSize > 2000 && !nextUrl) {
          console.error(`[fetchReportingIndex] ERROR: Stopped at exactly 2000 records but totalSize is ${totalSize}. Pagination failed!`);
        }
      } while (nextUrl && pageCount < 100);
      
      console.log(`[fetchReportingIndex] Reports total: ${allReports.length} records (${pageCount} pages)`);
      if (allReports.length === 2000) {
        console.warn(`[fetchReportingIndex] WARNING: Stopped at exactly 2000 records. This may indicate pagination is not working. Check if there are more records.`);
      }
    } catch (err: any) {
      console.error(`[fetchReportingIndex] Reports query failed: ${err.message}`);
      logger.error({ error: err.message }, "Reports query failed");
      allReports = [];
    }
    
    // Fetch Email Templates with pagination
    let allTemplates: any[] = [];
    try {
      let templatesResult;
      let nextUrl: string | undefined;
      let pageCount = 0;
      
      do {
        if (nextUrl) {
          let path: string;
          if (nextUrl.startsWith('/')) {
            path = nextUrl;
          } else {
            path = `/services/data/${apiVersion}/query/${nextUrl}`;
          }
          console.log(`[fetchReportingIndex] EmailTemplates pagination: fetching page ${pageCount + 1}, nextUrl: ${nextUrl}`);
          templatesResult = await sfGet(instanceUrl, accessToken, path, requestId);
        } else {
          templatesResult = await soql(
            instanceUrl,
            accessToken,
            apiVersion,
            "SELECT Id, Name FROM EmailTemplate",
            requestId
          );
        }
        
        allTemplates.push(...(templatesResult.records || []));
        nextUrl = templatesResult.nextRecordsUrl;
        pageCount++;
        
        const totalSize = templatesResult.totalSize;
        const recordsThisPage = templatesResult.records?.length || 0;
        
        if (pageCount === 1) {
          console.log(`[fetchReportingIndex] EmailTemplates query SUCCESS: ${recordsThisPage} records (first page), totalSize: ${totalSize || 'unknown'}, hasMore: ${!!nextUrl}`);
        } else {
          console.log(`[fetchReportingIndex] EmailTemplates page ${pageCount}: ${recordsThisPage} records, hasMore: ${!!nextUrl}`);
        }
        
        if (allTemplates.length === 2000 && totalSize && totalSize > 2000 && !nextUrl) {
          console.error(`[fetchReportingIndex] ERROR: Stopped at exactly 2000 records but totalSize is ${totalSize}. Pagination failed!`);
        }
      } while (nextUrl && pageCount < 100);
      
      console.log(`[fetchReportingIndex] EmailTemplates total: ${allTemplates.length} records (${pageCount} pages)`);
      if (allTemplates.length === 2000) {
        console.warn(`[fetchReportingIndex] WARNING: Stopped at exactly 2000 records. This may indicate pagination is not working. Check if there are more records.`);
      }
    } catch (err: any) {
      console.error(`[fetchReportingIndex] EmailTemplates query failed: ${err.message}`);
      logger.error({ error: err.message }, "EmailTemplates query failed");
      allTemplates = [];
    }
    
    const reports = allReports.map((r: any) => ({ id: r.Id, name: r.Name }));
    const dashboards: any[] = []; // Dashboard is not directly queryable via SOQL - skip for now
    const emailTemplates = allTemplates.map((t: any) => ({ id: t.Id, name: t.Name }));
    const reportTypes: any[] = []; // ReportType is not directly queryable via SOQL - skip for now
    
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
