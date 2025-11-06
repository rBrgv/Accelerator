import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { authenticateWithSoapLogin } from "@/server/salesforce/auth";
import { createLogger } from "@/server/logger";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(requestId);

  try {
    const { username, password, securityToken, environment, customDomain } = await request.json();

    if (!username || !password || !securityToken) {
      return NextResponse.json({ error: "Username, password, and security token are required" }, { status: 400 });
    }

    let loginUrl = "https://login.salesforce.com/services/Soap/u/60.0";
    if (environment === "sandbox") {
      loginUrl = "https://test.salesforce.com/services/Soap/u/60.0";
    } else if (environment === "custom" && customDomain) {
      loginUrl = `https://${customDomain}/services/Soap/u/60.0`;
    }

    const tokens = await authenticateWithSoapLogin(username, password, securityToken, loginUrl);

    const session = await getSession();
    session.accessToken = tokens.accessToken;
    session.instanceUrl = tokens.instanceUrl;
    session.apiVersion = tokens.apiVersion;
    await session.save();

    logger.info({ instanceUrl: tokens.instanceUrl }, "Password authentication successful");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, "Password authentication failed");
    return NextResponse.json(
      { error: error.message || "Authentication failed" },
      { status: 401 }
    );
  }
}

