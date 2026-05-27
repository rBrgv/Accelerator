import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  accessToken?: string;
  instanceUrl?: string;
  apiVersion?: string;
  oauthState?: string;
}

function getSessionOptions() {
  const secret = process.env.SESSION_SECRET || process.env.SESSION_PASSWORD;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required (min 32 characters)");
  }
  return {
    password: secret,
    cookieName: "sf-org-analyzer-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 8, // 8 hours — align with typical Salesforce token lifetime
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session.accessToken || !session.instanceUrl) {
    throw new Error("Not authenticated");
  }
  return session;
}
