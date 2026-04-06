import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore, isAdminConfigured } from "@/lib/firebase/admin";
import { buildDriveImportTree } from "@/lib/drive/folder-tree";
import { getDriveClient } from "@/lib/drive/google-client";

export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const body = (await req.json()) as { folderId?: string };
    const folderId = body.folderId?.trim();
    if (!folderId) {
      return NextResponse.json({ error: "folderId required" }, { status: 400 });
    }

    const snap = await getAdminFirestore()
      .doc(`users/${decoded.uid}/integrations/googleDrive`)
      .get();
    const data = snap.data();
    const refresh = data?.refreshToken as string | undefined;
    if (!refresh) {
      return NextResponse.json({ error: "Drive not connected" }, { status: 400 });
    }

    const drive = await getDriveClient(refresh);
    const tree = await buildDriveImportTree(drive, folderId);

    return NextResponse.json({ tree });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Drive list failed";
    console.error("[ignite][api/drive/list]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
