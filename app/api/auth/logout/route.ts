import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createLogger } from "@/server/logger";

/**
 * Logout endpoint - clears session data
 * Returns success even if clearing fails to allow UI to proceed
 */
export async function POST() {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);
  
  try {
    const session = await getSession();
    clearSession(session);
    await session.save();
    
    logger.info({}, "User logged out successfully");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Return success even if session clearing fails to allow UI to proceed
    logger.warn({ error: error?.message }, "Logout encountered error but proceeding");
    return NextResponse.json({ success: true });
  }
}

/**
 * Clears all session data
 */
function clearSession(session: Awaited<ReturnType<typeof getSession>>): void {
  session.accessToken = undefined;
  session.instanceUrl = undefined;
  session.apiVersion = undefined;
}

