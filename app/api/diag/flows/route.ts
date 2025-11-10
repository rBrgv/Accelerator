import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { soql } from "@/server/salesforce/rest";

// Flow counting helpers (same as in automation.ts)
async function countFlowsViaFDV(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string
): Promise<{ ok: boolean; total: number; active: number; error?: string; sample?: any[] }> {
  try {
    // Get full count first
    const countQ = `SELECT COUNT() FROM FlowDefinitionView`;
    const countR = await soql(instanceUrl, accessToken, apiVersion, countQ, undefined, { tooling: true });
    const total = countR.totalSize ?? 0;
    
    // Get sample with status info
    const q = `
      SELECT DeveloperName, ActiveVersionId, ActiveVersion.Status, LatestVersion.Status
      FROM FlowDefinitionView
      LIMIT 5
    `;
    const r = await soql(instanceUrl, accessToken, apiVersion, q, undefined, { tooling: true });
    const rows = r.records ?? [];
    
    // For active count, we need to query all or use a WHERE clause
    const activeQ = `SELECT COUNT() FROM FlowDefinitionView WHERE ActiveVersion.Status = 'Active'`;
    let active = 0;
    try {
      const activeR = await soql(instanceUrl, accessToken, apiVersion, activeQ, undefined, { tooling: true });
      active = activeR.totalSize ?? 0;
    } catch {
      // Fallback: count from sample (not accurate but better than nothing)
      active = rows.filter((x: any) => x.ActiveVersionId && x.ActiveVersion?.Status === "Active").length;
    }
    
    return { ok: true, total, active, sample: rows.slice(0, 5) };
  } catch (e: any) {
    return {
      ok: false,
      total: 0,
      active: 0,
      error: e.response?.data?.message || e.message || "unknown error",
    };
  }
}

async function countFlowsViaFD(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string
): Promise<{ ok: boolean; total: number; active: number; error?: string; sample?: any[] }> {
  try {
    // Get full count
    const countQ = `SELECT COUNT() FROM FlowDefinition`;
    const countR = await soql(instanceUrl, accessToken, apiVersion, countQ, undefined, { tooling: true });
    const total = countR.totalSize ?? 0;
    
    // Get active count
    const activeQ = `SELECT COUNT() FROM FlowDefinition WHERE ActiveVersionId != null`;
    let active = 0;
    try {
      const activeR = await soql(instanceUrl, accessToken, apiVersion, activeQ, undefined, { tooling: true });
      active = activeR.totalSize ?? 0;
    } catch {
      // Fallback: query all and count
      const allQ = `SELECT DeveloperName, ActiveVersionId, LatestVersionId FROM FlowDefinition`;
      const allR = await soql(instanceUrl, accessToken, apiVersion, allQ, undefined, { tooling: true });
      const allRows = allR.records ?? [];
      active = allRows.filter((x: any) => !!x.ActiveVersionId).length;
    }
    
    // Get sample
    const q = `
      SELECT DeveloperName, ActiveVersionId, LatestVersionId
      FROM FlowDefinition
      LIMIT 5
    `;
    const r = await soql(instanceUrl, accessToken, apiVersion, q, undefined, { tooling: true });
    const rows = r.records ?? [];
    
    return { ok: true, total, active, sample: rows.slice(0, 5) };
  } catch (e: any) {
    return {
      ok: false,
      total: 0,
      active: 0,
      error: e.response?.data?.message || e.message || "unknown error",
    };
  }
}

async function countFlowsViaFlow(
  instanceUrl: string,
  accessToken: string,
  apiVersion: string
): Promise<{ ok: boolean; total: number; active: number; error?: string; sample?: any[] }> {
  try {
    const q = `
      SELECT Id, Status, Definition.DeveloperName
      FROM Flow
      LIMIT 5
    `;
    const r = await soql(instanceUrl, accessToken, apiVersion, q, undefined, { tooling: true });
    const rows = r.records ?? [];
    const names = new Set<string>();
    let active = 0;
    for (const x of rows) {
      if (x?.Definition?.DeveloperName) names.add(x.Definition.DeveloperName);
      if (x?.Status === "Active" && x?.Definition?.DeveloperName) active++;
    }
    const total = (r.totalSize ?? names.size) || rows.length;
    return { ok: true, total, active, sample: rows.slice(0, 5) };
  } catch (e: any) {
    return {
      ok: false,
      total: 0,
      active: 0,
      error: e.response?.data?.message || e.message || "unknown error",
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const instanceUrl = session.instanceUrl!;
    const accessToken = session.accessToken!;
    const apiVersion = session.apiVersion || "v60.0";

    // Run all three methods in parallel
    const [fdv, fd, flow] = await Promise.all([
      countFlowsViaFDV(instanceUrl, accessToken, apiVersion),
      countFlowsViaFD(instanceUrl, accessToken, apiVersion),
      countFlowsViaFlow(instanceUrl, accessToken, apiVersion),
    ]);

    return NextResponse.json({
      fdv,
      fd,
      flow,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

