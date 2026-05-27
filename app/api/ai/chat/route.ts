import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import type { ScanOutput } from "@/lib/types";

function buildSystemPrompt(scanData: Partial<ScanOutput>): string {
  const src = scanData.source;
  const inv = scanData.inventory;
  const sum = scanData.summary;
  const health = scanData.health;
  const findings = scanData.findings || [];

  const orgName = src?.organizationName || src?.instanceUrl || "this org";
  const edition = src?.edition || "Unknown";
  const customObjects = inv?.sourceObjects?.filter((o) => o.isCustom).length ?? 0;
  const totalObjects = inv?.sourceObjects?.length ?? 0;
  const activeFLows = inv?.automation?.flows?.filter((f) => f.status === "Active").length ?? sum?.flows ?? 0;
  const apexClasses = inv?.code?.apexClasses?.length ?? 0;
  const coverage = inv?.code?.coverage?.orgWidePercent;
  const packages = inv?.packages?.length ?? 0;

  const findingsSummary = findings
    .slice(0, 8)
    .map((f) => `  - [${f.severity}] ${f.title}`)
    .join("\n");

  const healthSummary = health?.categories
    ?.map((c) => `  ${c.label}: ${c.score ?? "n/a"}%`)
    .join("\n") ?? "";

  return `You are a senior Salesforce migration consultant with 15+ years of experience in org-to-org migrations, data model analysis, Apex development, and enterprise change management.

You are advising the team on migrating "${orgName}" (${edition} Edition). A technical scan has just completed. Here is the data:

ORG PROFILE
  Instance: ${src?.instanceUrl ?? "unknown"}
  API Version: ${src?.apiVersion ?? "v60.0"}
  Storage: Data ${scanData.summary?.storage?.dataUsedPct ?? "?"}% used, File ${scanData.summary?.storage?.fileUsedPct ?? "?"}% used

OBJECT INVENTORY
  Total objects: ${totalObjects} (${customObjects} custom)
  Total records: ~${(sum?.recordsApprox ?? 0).toLocaleString()}
  Master-detail relationships: ${inv?.sourceObjects?.reduce((n, o) => n + o.lookups.filter((l) => l.isMasterDetail).length, 0) ?? 0}

AUTOMATION
  Active flows: ${activeFLows}
  Apex triggers: ${sum?.triggers ?? 0}
  Validation rules: ${sum?.vrs ?? 0}
  Workflow rules (legacy): ${Array.isArray(inv?.automation?.workflowRules) ? (inv.automation.workflowRules as any[]).filter((w: any) => w.active).length : 0}
  Approval processes: ${Array.isArray(inv?.automation?.approvalProcesses) ? (inv.automation.approvalProcesses as any[]).filter((a: any) => a.active).length : 0}

CODE
  Apex classes: ${apexClasses}
  Org-wide test coverage: ${coverage != null ? `${coverage}%` : "unknown"}

PACKAGES
  Managed packages installed: ${packages}

HEALTH SCORE: ${health?.overallScore ?? "n/a"}/100
${healthSummary}

FINDINGS (${findings.filter((f) => f.severity === "HIGH").length} HIGH, ${findings.filter((f) => f.severity === "MEDIUM").length} MEDIUM, ${findings.filter((f) => f.severity === "LOW").length} LOW)
${findingsSummary || "  No findings recorded."}

INSTRUCTIONS
- Answer questions about this specific org's migration readiness, risks, timeline, and next steps.
- Be specific and reference the actual scan data above.
- Prioritise actionable recommendations over general advice.
- Use concise, executive-friendly language — this may be shared with stakeholders.
- Format responses with clear structure: use short paragraphs, bullet points, or numbered steps as appropriate.
- If asked about timeline, provide a realistic range based on the org complexity above.
- Do not invent data not present in the scan summary.`;
}

export async function POST(request: NextRequest) {
  await requireSession();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI advisor not configured. Set ANTHROPIC_API_KEY in your environment." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const question: string = body.question;
  const scanData: Partial<ScanOutput> = body.context ?? {};

  if (!question?.trim()) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: buildSystemPrompt(scanData),
    messages: [{ role: "user", content: question.trim() }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
