import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuth,
  getServiceAccountProjectDiagnostics,
  isAdminConfigured,
} from "@/lib/firebase/admin";
import { isDriveDebugEnabled } from "@/lib/server/drive-debug";

function firebaseErrorFields(err: unknown): { code?: string; message: string } {
  if (err && typeof err === "object") {
    const o = err as { code?: string; message?: string };
    return {
      code: typeof o.code === "string" ? o.code : undefined,
      message: typeof o.message === "string" ? o.message : String(err),
    };
  }
  return { message: String(err) };
}

export async function GET(req: NextRequest) {
  const debug = isDriveDebugEnabled();
  const publicProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;

  if (!isAdminConfigured()) {
    const body = {
      error: "Server credentials not configured",
      hint: "Set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local (service account JSON from Firebase Console).",
      ...(debug && {
        debug: {
          hasServiceAccountEnv: Boolean(
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
          ),
          ...getServiceAccountProjectDiagnostics(),
          nextPublicFirebaseProjectId: publicProjectId,
        },
      }),
    };
    console.error("[ignite][api/drive/auth] 503", body);
    return NextResponse.json(body, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    const body = {
      error: "Missing Authorization header",
      hint: "Expected Authorization: Bearer <Firebase ID token>. Ensure you are signed in and try again.",
      ...(debug && {
        debug: {
          authorizationHeaderPresent: Boolean(authHeader),
          headerPrefix: authHeader?.slice(0, 20) ?? null,
        },
      }),
    };
    console.error("[ignite][api/drive/auth] 401 missing bearer", body.debug);
    return NextResponse.json(body, { status: 401 });
  }

  const sa = getServiceAccountProjectDiagnostics();

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/drive/callback`;
    if (!clientId) {
      const body = {
        error: "GOOGLE_CLIENT_ID not set",
        hint: "Add GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET) from Google Cloud Console → Credentials → OAuth client.",
        ...(debug && {
          debug: {
            hasGoogleClientId: false,
            redirectUriExpected: redirectUri,
          },
        }),
      };
      console.error("[ignite][api/drive/auth] 503 no client id");
      return NextResponse.json(body, { status: 503 });
    }
    const scopes = [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ].join(" ");
    const state = Buffer.from(
      JSON.stringify({ uid: decoded.uid, ts: Date.now() }),
      "utf-8"
    ).toString("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    if (debug) {
      console.log("[ignite][api/drive/auth] ok", {
        uid: decoded.uid,
        redirectUri,
        googleClientIdPrefix: clientId.slice(0, 12) + "…",
      });
    }

    return NextResponse.json({
      url: url.toString(),
      ...(debug && {
        debug: {
          verifiedUid: decoded.uid,
          tokenIssuer: decoded.iss ?? null,
          tokenAudience: decoded.aud ?? null,
          serviceAccountProjectId: sa.projectId,
          nextPublicFirebaseProjectId: publicProjectId,
          projectsMatch:
            Boolean(sa.projectId && publicProjectId) &&
            sa.projectId === publicProjectId,
        },
      }),
    });
  } catch (err) {
    const { code, message } = firebaseErrorFields(err);
    const body = {
      error: "Invalid or unverifiable ID token",
      hint:
        sa.projectId && publicProjectId && sa.projectId !== publicProjectId
          ? `Service account project_id (${sa.projectId}) does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID (${publicProjectId}). Download the key from the same Firebase project as your web app.`
          : sa.jsonParseFailed
            ? "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Fix quoting in .env.local (single line JSON)."
            : "Use a service account JSON from the same Firebase project as NEXT_PUBLIC_FIREBASE_*.",
      ...(debug && {
        debug: {
          firebaseErrorCode: code ?? null,
          firebaseErrorMessage: message,
          tokenLength: token.length,
          tokenPrefix: token.slice(0, 12) + "…",
          ...sa,
          nextPublicFirebaseProjectId: publicProjectId,
          projectsMatch:
            Boolean(sa.projectId && publicProjectId) &&
            sa.projectId === publicProjectId,
        },
      }),
    };
    console.error("[ignite][api/drive/auth] verifyIdToken failed", {
      code,
      message,
      saProjectId: sa.projectId,
      publicProjectId,
    });
    return NextResponse.json(body, { status: 401 });
  }
}
