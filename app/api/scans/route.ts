import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listScans, ensureOrgConnection } from "@/server/persistence";
import { createLogger } from "@/server/logger";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const session = await requireSession();
    const instanceUrl = request.nextUrl.searchParams.get("instanceUrl") || session.instanceUrl;
    
    if (!instanceUrl) {
      return NextResponse.json({ error: "instanceUrl required" }, { status: 400 });
    }

    const orgConnectionId = await ensureOrgConnection(
      instanceUrl,
      session.instanceUrl || "",
      "Unknown",
      requestId
    );

    const scans = await listScans(orgConnectionId, requestId);

    return NextResponse.json(scans);
  } catch (error: any) {
    logger.error({ error }, "Failed to list scans");
    return NextResponse.json(
      { error: error.message || "Failed to list scans", traceId: requestId },
      { status: error.statusCode || 500 }
    );
  }
}

