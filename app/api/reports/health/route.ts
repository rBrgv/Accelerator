import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getScan } from "@/server/persistence";
import { generateHealthAuditHTML } from "@/server/reports/healthReport";
import { createLogger } from "@/server/logger";
import { ScanOutput } from "@/lib/types";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const session = await requireSession();
    const scanId = request.nextUrl.searchParams.get("scanId");

    if (!scanId) {
      return NextResponse.json(
        { error: "scanId parameter is required for GET requests" },
        { status: 400 }
      );
    }

    // Get scan from storage
    const scanRun = await getScan(scanId, requestId);
    if (!scanRun) {
      return NextResponse.json(
        { error: "Scan not found. Please run a new scan or use POST with scan data." },
        { status: 404 }
      );
    }

    const health = scanRun.scanOutput.health;
    if (!health) {
      const note = "Health computation is not available for this scan.";
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Health Audit Report</title>
</head>
<body style="max-width: 900px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <h1>Salesforce Org Health Audit Report</h1>
  <p>${note}</p>
</body>
</html>`;
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `health-audit-${new Date().toISOString().split("T")[0]}.html`
          )}`,
        },
      });
    }

    const orgInfo = {
      name: scanRun.scanOutput.source.organizationName,
      edition: scanRun.scanOutput.source.edition,
      instanceUrl: scanRun.scanOutput.source.instanceUrl,
    };

    const htmlContent = generateHealthAuditHTML(health, orgInfo);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Health Audit Report</title>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
    const filename = `health-audit-${new Date().toISOString().split("T")[0]}.html`;

    return new NextResponse(fullHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate health audit report");
    return NextResponse.json(
      { error: "Failed to generate report", traceId: requestId },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const session = await requireSession();

    let body: any;
    try {
      const text = await request.text();
      if (!text || text.trim().length === 0) {
        return NextResponse.json(
          { error: "Request body is empty. Please provide scan data." },
          { status: 400 }
        );
      }
      body = JSON.parse(text);
    } catch (parseError: any) {
      logger.error({ error: parseError.message }, "Failed to parse request body as JSON");
      return NextResponse.json(
        { error: "Invalid JSON in request body. Please provide valid scan data." },
        { status: 400 }
      );
    }

    if (!body || !body.source || !body.inventory) {
      return NextResponse.json(
        { error: "Invalid scan data. Please provide a valid ScanOutput object with 'source' and 'inventory' properties." },
        { status: 400 }
      );
    }

    const scanOutput = body as ScanOutput;
    logger.info("Using scan data from request body");

    const health = scanOutput.health;
    if (!health) {
      const note = "Health computation is not available for this scan.";
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Health Audit Report</title>
</head>
<body style="max-width: 900px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <h1>Salesforce Org Health Audit Report</h1>
  <p>${note}</p>
</body>
</html>`;
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `health-audit-${new Date().toISOString().split("T")[0]}.html`
          )}`,
        },
      });
    }

    const orgInfo = {
      name: scanOutput.source.organizationName,
      edition: scanOutput.source.edition,
      instanceUrl: scanOutput.source.instanceUrl,
    };

    const htmlContent = generateHealthAuditHTML(health, orgInfo);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Health Audit Report</title>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
    const filename = `health-audit-${new Date().toISOString().split("T")[0]}.html`;

    return new NextResponse(fullHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate health audit report");
    return NextResponse.json(
      { error: error.message || "Failed to generate report", traceId: requestId },
      { status: 500 }
    );
  }
}

