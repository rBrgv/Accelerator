import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCode } from "@/server/salesforce/auth";

const SF_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Access was denied. Please authorise the connected app and try again.",
  invalid_client: "Connected App configuration error. Please contact your administrator.",
  invalid_grant: "Authorisation code expired. Please try connecting again.",
  redirect_uri_mismatch: "Redirect URI mismatch in Connected App settings. Please contact your administrator.",
  ip_restricted: "Your IP address is not permitted to access this org.",
  user_is_locked: "This Salesforce user account is locked.",
};

function safeError(sfCode: string, fallback: string): string {
  return SF_ERROR_MESSAGES[sfCode] ?? fallback;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const errorCode = request.nextUrl.searchParams.get("error");
  const returnedState = request.nextUrl.searchParams.get("state");

  if (errorCode) {
    const msg = safeError(errorCode, "Salesforce authentication failed. Please try again.");
    return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(msg)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard?error=no_authorization_code", origin));
  }

  // Validate state to prevent OAuth CSRF
  const session = await getSession();
  if (!returnedState || !session.oauthState || returnedState !== session.oauthState) {
    session.oauthState = undefined;
    await session.save();
    return NextResponse.redirect(new URL("/dashboard?error=invalid_state", origin));
  }

  // Decode env and domain from the state payload: "<nonce>|<env>|<domain>"
  const [, env = "prod", domain = ""] = returnedState.split("|");
  const environment = (["prod", "sandbox", "custom"].includes(env) ? env : "prod") as "prod" | "sandbox" | "custom";
  const customDomain = domain || undefined;

  try {
    const redirectUri = `${origin}/api/auth/callback`;
    const tokens = await exchangeCode(code, redirectUri, environment, customDomain);

    session.accessToken = tokens.accessToken;
    session.instanceUrl = tokens.instanceUrl;
    session.apiVersion = tokens.apiVersion;
    session.oauthState = undefined;
    await session.save();

    return NextResponse.redirect(new URL("/dashboard?success=true", origin));
  } catch (err: any) {
    session.oauthState = undefined;
    await session.save();
    const msg = safeError(err.message, "Authentication failed. Please try again.");
    return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(msg)}`, origin));
  }
}
