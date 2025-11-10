import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getScan } from "@/server/persistence";
import { generateExecutiveReportMarkdown } from "@/server/reports/executiveReport";
import { createLogger } from "@/server/logger";
import { ScanOutput } from "@/lib/types";
import { marked } from "marked";
import puppeteer from "puppeteer";

async function generateReport(scanOutput: ScanOutput, requestId: string) {
  const logger = createLogger(requestId);
  
  // Generate markdown
  const markdown = generateExecutiveReportMarkdown(scanOutput);

  // Convert to HTML
  const html = await marked(markdown, { breaks: true, gfm: true });

  // Generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 { 
            color: #1a56db; 
            border-bottom: 3px solid #1a56db; 
            padding-bottom: 10px;
            font-size: 28px;
            margin-bottom: 20px;
          }
          h2 { 
            color: #2563eb; 
            margin-top: 30px; 
            border-bottom: 2px solid #e5e7eb; 
            padding-bottom: 5px;
            font-size: 22px;
          }
          h3 { 
            color: #3b82f6; 
            margin-top: 20px;
            font-size: 18px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 14px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 10px 12px;
            text-align: left;
          }
          th {
            background-color: #f3f4f6;
            font-weight: 600;
            color: #1f2937;
          }
          tr:nth-child(even) {
            background-color: #f9fafb;
          }
          code {
            background-color: #f3f4f6;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            letter-spacing: 1px;
          }
          ul, ol {
            margin: 15px 0;
            padding-left: 30px;
          }
          li {
            margin: 8px 0;
            line-height: 1.8;
          }
          .page-break {
            page-break-after: always;
          }
          strong {
            color: #1f2937;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '15mm',
      bottom: '20mm',
      left: '15mm',
    },
  });

  await browser.close();

  const filename = `executive-readiness-summary-${new Date().toISOString().split('T')[0]}.pdf`;
  return new NextResponse(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

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

    // Try to get scan from storage
    const scanRun = await getScan(scanId, requestId);
    if (!scanRun) {
      return NextResponse.json(
        { error: "Scan not found. Please run a new scan or use POST with scan data." },
        { status: 404 }
      );
    }

    return generateReport(scanRun.scanOutput, requestId);
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate executive report");
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
    const body = await request.json();

    if (!body || !body.source || !body.inventory) {
      return NextResponse.json(
        { error: "Invalid scan data. Please provide a valid ScanOutput object." },
        { status: 400 }
      );
    }

    const scanOutput = body as ScanOutput;
    logger.info("Using scan data from request body");
    
    return generateReport(scanOutput, requestId);
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate executive report");
    return NextResponse.json(
      { error: "Failed to generate report", traceId: requestId },
      { status: 500 }
    );
  }
}

