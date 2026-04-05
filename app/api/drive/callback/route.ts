import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, isAdminConfigured } from "@/lib/firebase/admin";
import { isDriveDebugEnabled } from "@/lib/server/drive-debug";

function settingsRedirect(req: NextRequest, query: Record<string, string>) {
  const u = new URL("/settings", req.url);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  if (!isAdminConfigured()) {
    return settingsRedirect(req, { driveError: "server" });
  }
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err || !code || !state) {
    console.error("[ignite][api/drive/callback] oauth missing params", {
      err,
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    return settingsRedirect(req, { driveError: "oauth" });
  }
  let uid: string;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8")
    ) as { uid: string };
    uid = parsed.uid;
  } catch (e) {
    console.error("[ignite][api/drive/callback] state parse failed", e);
    return settingsRedirect(req, { driveError: "state" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/drive/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    const snippet = errText.slice(0, 500);
    console.error("[ignite][api/drive/callback] token exchange failed", {
      status: tokenRes.status,
      statusText: tokenRes.statusText,
      bodySnippet: snippet,
    });
    const q: Record<string, string> = { driveError: "token" };
    if (isDriveDebugEnabled()) {
      q.driveDebug = Buffer.from(
        `${tokenRes.status} ${tokenRes.statusText}: ${snippet}`,
        "utf-8"
      ).toString("base64url");
    }
    return settingsRedirect(req, q);
  }
  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token: string;
    expiry_date?: number;
  };

  const db = getAdminFirestore();
  await db.doc(`users/${uid}/integrations/googleDrive`).set(
    {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token,
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return settingsRedirect(req, { driveConnected: "1" });
}
