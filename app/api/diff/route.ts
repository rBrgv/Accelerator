import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getScan, diffScan } from "@/server/persistence";
import { createLogger } from "@/server/logger";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    await requireSession(); // Ensure authenticated
    
    const fromScanId = request.nextUrl.searchParams.get("from");
    const toScanId = request.nextUrl.searchParams.get("to");

    if (!fromScanId || !toScanId) {
      return NextResponse.json({ error: "from and to scan IDs required" }, { status: 400 });
    }

    const [fromScan, toScan] = await Promise.all([
      getScan(fromScanId, requestId),
      getScan(toScanId, requestId),
    ]);

    if (!fromScan || !toScan) {
      return NextResponse.json({ error: "One or both scans not found" }, { status: 404 });
    }

    const diff = await diffScan(fromScan.scanOutput, toScan.scanOutput, requestId);

    return NextResponse.json({
      ...diff,
      fromScanId,
      toScanId,
      fromCreatedAt: fromScan.createdAt,
      toCreatedAt: toScan.createdAt,
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to diff scans");
    return NextResponse.json(
      { error: error.message || "Failed to diff scans", traceId: requestId },
      { status: error.statusCode || 500 }
    );
  }
}

