import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  accessToken?: string;
  instanceUrl?: string;
  apiVersion?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || "change-me-to-a-random-string-min-32-chars-long",
  cookieName: "sf-org-analyzer-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session.accessToken || !session.instanceUrl) {
    throw new Error("Not authenticated");
  }
  return session;
}

