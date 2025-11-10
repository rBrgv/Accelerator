import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { soql } from "@/server/salesforce/rest";
import { listMetadata, listMetadataViaEntityDefinition } from "@/server/salesforce/metadata";
import { createLogger } from "@/server/logger";

// Helper: Safe Tooling API count query
async function safeToolingCount(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string,
  query: string,
  requestId?: string
): Promise<{ count: number | null; ok: boolean; error?: string }> {
  try {
    const result = await soql(instanceUrl, accessToken, apiVersion, query, requestId, { tooling: true });
    return { count: result.totalSize || 0, ok: true };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    const errorCode = error.response?.data?.[0]?.errorCode || error.response?.status;
    return { count: null, ok: false, error: `${errorMsg} (${errorCode || 'unknown'})` };
  }
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const session = await requireSession();
    const instanceUrl = session.instanceUrl!;
    const accessToken = session.accessToken!;
    const apiVersion = session.apiVersion || "v60.0";

    // Validation Rules via Tooling API
    console.log(`[diag/automation] Testing ValidationRule queries...`);
    const vrTotal = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM ValidationRule",
      requestId
    );
    const vrActive = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM ValidationRule WHERE Active = true",
      requestId
    );

    // Workflow Rules via Tooling API
    console.log(`[diag/automation] Testing WorkflowRule queries...`);
    const wrTotalTooling = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM WorkflowRule",
      requestId
    );
    const wrActiveTooling = await safeToolingCount(
      instanceUrl,
      accessToken,
      apiVersion,
      "SELECT COUNT() FROM WorkflowRule WHERE Active = true",
      requestId
    );

    // Workflow Rules via Metadata API (fallback)
    console.log(`[diag/automation] Testing WorkflowRule via EntityDefinition...`);
    const wrMetadata = await listMetadataViaEntityDefinition(
      instanceUrl,
      accessToken,
      apiVersion,
      "WorkflowRules",
      requestId
    );

    // Approval Processes via Metadata API
    console.log(`[diag/automation] Testing ApprovalProcess via Metadata API...`);
    const apMetadata = await listMetadata(
      instanceUrl,
      accessToken,
      apiVersion,
      "ApprovalProcess",
      requestId
    );
    const apEntity = await listMetadataViaEntityDefinition(
      instanceUrl,
      accessToken,
      apiVersion,
      "ApprovalProcesses",
      requestId
    );

    return NextResponse.json({
      validationRule: {
        total: vrTotal.count,
        active: vrActive.count,
        ok: vrTotal.ok || vrActive.ok,
        error: !vrTotal.ok && !vrActive.ok ? (vrTotal.error || vrActive.error) : undefined,
      },
      workflowRule: {
        totalTooling: wrTotalTooling.count,
        activeTooling: wrActiveTooling.count,
        totalMetadata: wrMetadata.items.length,
        okTooling: wrTotalTooling.ok || wrActiveTooling.ok,
        okMetadata: wrMetadata.ok,
        errorTooling: !wrTotalTooling.ok && !wrActiveTooling.ok 
          ? (wrTotalTooling.error || wrActiveTooling.error) 
          : undefined,
        errorMetadata: !wrMetadata.ok ? wrMetadata.error : undefined,
      },
      approvalProcess: {
        totalMetadata: apMetadata.items.length,
        totalEntity: apEntity.items.length,
        okMetadata: apMetadata.ok,
        okEntity: apEntity.ok,
        errorMetadata: !apMetadata.ok ? apMetadata.error : undefined,
        errorEntity: !apEntity.ok ? apEntity.error : undefined,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Diagnostic endpoint failed");
    return NextResponse.json(
      { error: error.message || "Diagnostic failed", traceId: requestId },
      { status: 500 }
    );
  }
}

