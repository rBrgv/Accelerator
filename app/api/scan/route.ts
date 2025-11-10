import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { runScan } from "@/server/composeScan";
import { ensureOrgConnection, saveScan } from "@/server/persistence";
import { createLogger } from "@/server/logger";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    if (process.env.MODE === "demo") {
      // Return demo data
      return NextResponse.json({
        source: { instanceUrl: "https://demo.salesforce.com", apiVersion: "v60.0", orgId: "demo", edition: "Enterprise" },
        inventory: { sourceObjects: [], automation: { flows: [], triggers: [], validationRules: [], workflowRules: [], approvalProcesses: [] }, code: { apexClasses: [], apexTriggers: [] }, reporting: { reports: [], dashboards: [], emailTemplates: [], reportTypes: [] }, ownership: { users: [], queues: [] }, packages: [] },
        findings: [],
        dependencyGraph: { nodes: [], edges: [], order: [] },
        summary: { objects: 0, recordsApprox: 0, flows: 0, triggers: 0, vrs: 0, findingsHigh: 0, findingsMedium: 0, findingsLow: 0 },
        scanDuration: 2500,
        scanDurationSeconds: 2.5,
      });
    }

    const session = await requireSession();
    const scanStartTime = Date.now();

    const scanOutput = await runScan(
      session.accessToken!,
      session.instanceUrl!,
      session.apiVersion || "v60.0",
      requestId
    );

    // Check if scan returned meaningful data
    // Only fail if we have NO data at all (not even standard objects)
    // Some orgs may legitimately have 0 custom objects or 0 automation
    const hasAnyData = 
      scanOutput.inventory.sourceObjects.length > 0 ||
      scanOutput.inventory.automation.flows.length > 0 ||
      scanOutput.inventory.automation.triggers.length > 0 ||
      scanOutput.inventory.code.apexClasses.length > 0 ||
      scanOutput.inventory.code.apexTriggers.length > 0 ||
      scanOutput.inventory.reporting.reports.length > 0;
    
    if (!hasAnyData) {
      logger.warn("Scan returned no data at all - possible auth or permissions issue");
      return NextResponse.json(
        { error: "Scan completed but no data was retrieved. This may indicate an authentication issue or insufficient API permissions. Please check your Salesforce connection and permissions.", traceId: requestId },
        { status: 401 }
      );
    }
    
    // Log summary for debugging
    logger.info({
      objects: scanOutput.summary.objects,
      flows: scanOutput.summary.flows,
      triggers: scanOutput.summary.triggers,
      vrs: scanOutput.summary.vrs,
      apexClasses: scanOutput.inventory.code.apexClasses.length,
      apexTriggers: scanOutput.inventory.code.apexTriggers.length,
      reports: scanOutput.inventory.reporting.reports.length,
    }, "Scan data summary");

    // Save scan
    const orgConnectionId = await ensureOrgConnection(
      session.instanceUrl!,
      scanOutput.source.orgId,
      scanOutput.source.edition || "Unknown",
      requestId
    );
    const savedScan = await saveScan(orgConnectionId, scanOutput, requestId);

    const scanEndTime = Date.now();
    const scanDuration = scanEndTime - scanStartTime;
    const scanDurationSeconds = parseFloat((scanDuration / 1000).toFixed(1));

    logger.info({ duration: scanDurationSeconds, durationMs: scanDuration, scanId: savedScan.id }, "Scan completed");

    return NextResponse.json({
      ...scanOutput,
      scanId: savedScan.id,
      scanDuration,
      scanDurationSeconds,
    });
  } catch (error: any) {
    logger.error({ error, stack: error.stack }, "Scan failed");
    return NextResponse.json(
      { error: error.message || "Scan failed", traceId: requestId },
      { status: error.statusCode || 500 }
    );
  }
}

