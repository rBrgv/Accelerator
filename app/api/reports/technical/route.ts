import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getScan } from "@/server/persistence";
import { generateTechnicalReportMarkdown, generateTechnicalReportHTML } from "@/server/reports/technicalReport";
import { createLogger } from "@/server/logger";
import { ScanOutput } from "@/lib/types";
import { marked } from "marked";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const session = await requireSession();
    const scanId = request.nextUrl.searchParams.get("scanId");
    const format = (request.nextUrl.searchParams.get("format") || "html").toLowerCase();

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

    const scanOutput = scanRun.scanOutput;
    const orgInfo = {
      name: scanOutput.source.organizationName,
      edition: scanOutput.source.edition,
      instanceUrl: scanOutput.source.instanceUrl,
    };

    if (format === "json") {
      return NextResponse.json(scanOutput, {
        headers: {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `technical-report-${new Date().toISOString().split("T")[0]}.json`
          )}`,
        },
      });
    }

    if (format === "md") {
      const md = generateTechnicalReportMarkdown(scanOutput, orgInfo);
      const filename = `technical-report-${new Date().toISOString().split("T")[0]}.md`;
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // Default: HTML
    const htmlContent = generateTechnicalReportHTML(scanOutput, orgInfo);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Technical Report</title>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
    const filename = `technical-report-${new Date().toISOString().split("T")[0]}.html`;

    return new NextResponse(fullHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate technical report");
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
    const format = (request.nextUrl.searchParams.get("format") || "html").toLowerCase();

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

    const orgInfo = {
      name: scanOutput.source.organizationName,
      edition: scanOutput.source.edition,
      instanceUrl: scanOutput.source.instanceUrl,
    };

    if (format === "json") {
      return NextResponse.json(scanOutput, {
        headers: {
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `technical-report-${new Date().toISOString().split("T")[0]}.json`
          )}`,
        },
      });
    }

    if (format === "md") {
      const md = generateTechnicalReportMarkdown(scanOutput, orgInfo);
      const filename = `technical-report-${new Date().toISOString().split("T")[0]}.md`;
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // Default: HTML
    const htmlContent = generateTechnicalReportHTML(scanOutput, orgInfo);
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Technical Report</title>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
    const filename = `technical-report-${new Date().toISOString().split("T")[0]}.html`;

    return new NextResponse(fullHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate technical report");
    return NextResponse.json(
      { error: error.message || "Failed to generate report", traceId: requestId },
      { status: 500 }
    );
  }
}

