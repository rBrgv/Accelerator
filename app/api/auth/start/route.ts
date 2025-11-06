import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/server/salesforce/auth";

export async function GET(request: NextRequest) {
  const clientId = process.env.SF_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({ error: "SF_CLIENT_ID not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const environment = (searchParams.get("env") || "prod") as "prod" | "sandbox" | "custom";
  const customDomain = searchParams.get("domain") || undefined;
  
  const authUrl = await getAuthUrl(environment, customDomain);
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "api id web refresh_token",
  });

  // Add env and domain to callback URL for proper token exchange
  if (environment !== "prod") {
    params.append("env", environment);
  }
  if (customDomain) {
    params.append("domain", customDomain);
  }

  return NextResponse.redirect(`${authUrl}?${params.toString()}`);
}

