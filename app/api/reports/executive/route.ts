import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getScan } from "@/server/persistence";
import { generateExecutiveReportMarkdown } from "@/server/reports/executiveReport";
import { createLogger } from "@/server/logger";
import { ScanOutput } from "@/lib/types";
import { marked } from "marked";

// Dynamic import for Puppeteer - use puppeteer-core + @sparticuz/chromium on Vercel
async function getPuppeteer() {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) {
    return require("puppeteer-core");
  } else {
    return require("puppeteer");
  }
}

async function generateReport(scanOutput: ScanOutput, requestId: string) {
  const logger = createLogger(requestId);
  
  let browser: any = null;
  
  try {
    // Generate markdown
    const markdown = generateExecutiveReportMarkdown(scanOutput);

    // Convert to HTML
    const html = await marked(markdown, { breaks: true, gfm: true });

    // Generate PDF with timeout protection
    // Vercel has function timeout limits: 10s (Hobby) or 60s (Pro/Enterprise)
    const isVercel = !!process.env.VERCEL;
    const pdfTimeout = isVercel ? 25000 : 30000; // 25s on Vercel, 30s locally
    
    const pdfPromise = (async () => {
      // Get the right Puppeteer instance
      const puppeteer = await getPuppeteer();
      
      // Configure launch options based on environment
      let launchOptions: any;
      
      if (isVercel) {
        // On Vercel, use @sparticuz/chromium with its recommended configuration
        const chromium = require("@sparticuz/chromium");
        launchOptions = {
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        };
      } else {
        // Local development - use standard Puppeteer configuration
        launchOptions = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
          ],
        };
      }

      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      
      // Set a shorter timeout for page operations on Vercel
      if (isVercel) {
        page.setDefaultTimeout(20000); // 20 seconds
      }
  
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

      // Use a shorter wait on Vercel to avoid timeouts
      await page.setContent(fullHtml, { 
        waitUntil: isVercel ? 'domcontentloaded' : 'networkidle0',
        timeout: isVercel ? 15000 : 30000 
      });
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
      browser = null;

      const filename = `executive-readiness-summary-${new Date().toISOString().split('T')[0]}.pdf`;
      return new NextResponse(pdfBuffer as any, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    })();

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("PDF generation timed out after 30 seconds")), pdfTimeout)
    );

    return await Promise.race([pdfPromise, timeoutPromise]);
  } catch (error: any) {
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate PDF");
    throw error; // Re-throw to be handled by the route handler
  }
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
    
    // Try to parse JSON body with better error handling
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
    
    return generateReport(scanOutput, requestId);
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Failed to generate executive report");
    // Always return valid JSON, even on error
    return NextResponse.json(
      { error: error.message || "Failed to generate report", traceId: requestId },
      { status: 500 }
    );
  }
}

