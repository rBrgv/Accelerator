import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAuthUrl } from "@/server/salesforce/auth";

// Only allow known Salesforce domain patterns for custom domains
const CUSTOM_DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:my\.salesforce\.com|salesforce\.com|force\.com)$/i;

export async function GET(request: NextRequest) {
  const clientId = process.env.SF_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: "SF_CLIENT_ID not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const environment = (searchParams.get("env") || "prod") as "prod" | "sandbox" | "custom";
  const customDomain = searchParams.get("domain") || undefined;

  if (environment === "custom") {
    if (!customDomain || !CUSTOM_DOMAIN_RE.test(customDomain)) {
      return NextResponse.json(
        { error: "Invalid custom domain. Must be a valid Salesforce domain (e.g. yourdomain.my.salesforce.com)." },
        { status: 400 }
      );
    }
  }

  const authUrl = await getAuthUrl(environment, customDomain);
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;

  // Generate a random nonce and encode env/domain into state so the callback
  // can recover them without relying on Salesforce echoing back custom params.
  const nonce = crypto.randomUUID();
  const statePayload = `${nonce}|${environment}|${customDomain ?? ""}`;

  const session = await getSession();
  session.oauthState = statePayload;
  await session.save();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "api id web refresh_token",
    state: statePayload,
  });

  return NextResponse.redirect(`${authUrl}?${params.toString()}`);
}
