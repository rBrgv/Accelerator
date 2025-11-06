import { CodeIndex, ReportingIndex } from "@/lib/types";
import { soql } from "../salesforce/rest";
import { createLogger } from "../logger";

export async function fetchCodeIndex(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  requestId?: string
): Promise<CodeIndex> {
  const logger = createLogger(requestId);
  
  try {
    const [classesResult, triggersResult] = await Promise.all([
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name, ApiVersion FROM ApexClass",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
      soql(
        instanceUrl,
        accessToken,
        apiVersion,
        "SELECT Id, Name, ApiVersion FROM ApexTrigger",
        requestId,
        { tooling: true }
      ).catch(() => ({ records: [] })),
    ]);
    
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
    
    logger.info({ classes: apexClasses.length, triggers: apexTriggers.length }, "Code index fetched");
    
    return { apexClasses, apexTriggers };
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
