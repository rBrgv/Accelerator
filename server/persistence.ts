import { ScanOutput, ScanRun } from "@/lib/types";
import { createLogger } from "./logger";
import crypto from "crypto";

// Intentionally in-memory only — no Salesforce data is persisted server-side.
// Scan results live in the client browser session only.
// Reports are generated on-demand from the client-supplied scan payload (POST body).
const scanRunsStorage = new Map<string, ScanRun>();

function hashScanSummary(summary: ScanOutput["summary"]): string {
  const str = JSON.stringify({
    objects: summary.objects,
    recordsApprox: summary.recordsApprox,
    flows: summary.flows,
    triggers: summary.triggers,
    vrs: summary.vrs,
  });
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function ensureOrgConnection(
  instanceUrl: string,
  orgId: string,
  edition: string,
  requestId?: string
): Promise<string> {
  createLogger(requestId).info({ instanceUrl, orgId, edition }, "Org connection");
  return instanceUrl;
}

export async function saveScan(
  orgConnectionId: string,
  scanOutput: ScanOutput,
  requestId?: string
): Promise<ScanRun> {
  const logger = createLogger(requestId);
  const scanId = crypto.randomUUID();
  const hash = hashScanSummary(scanOutput.summary);

  const scanRun: ScanRun = {
    id: scanId,
    orgConnectionId,
    scanOutput: { ...scanOutput, summary: { ...scanOutput.summary, hash } },
    createdAt: new Date(),
  };

  scanRunsStorage.set(scanId, scanRun);
  logger.info({ scanId, orgConnectionId }, "Scan saved");
  return scanRun;
}

export async function getScan(scanId: string, requestId?: string): Promise<ScanRun | null> {
  const scan = scanRunsStorage.get(scanId) ?? null;
  if (!scan) createLogger(requestId).warn({ scanId }, "Scan not found (expected after cold start)");
  return scan;
}
