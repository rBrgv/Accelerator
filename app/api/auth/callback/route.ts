import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCode } from "@/server/salesforce/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const env = (request.nextUrl.searchParams.get("env") || "prod") as "prod" | "sandbox" | "custom";
  const customDomain = request.nextUrl.searchParams.get("domain") || undefined;

  if (error) {
    return NextResponse.redirect(`/dashboard?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect("/dashboard?error=no_code");
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
    const tokens = await exchangeCode(code, redirectUri, env, customDomain);

    const session = await getSession();
    session.accessToken = tokens.accessToken;
    session.instanceUrl = tokens.instanceUrl;
    session.apiVersion = tokens.apiVersion;
    await session.save();

    return NextResponse.redirect("/dashboard?success=true");
  } catch (err: any) {
    return NextResponse.redirect(`/dashboard?error=${encodeURIComponent(err.message || "auth_failed")}`);
  }
}

