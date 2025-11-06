import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.accessToken || !session.instanceUrl) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ connected: true, instanceUrl: session.instanceUrl });
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}

