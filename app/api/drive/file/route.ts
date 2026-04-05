import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore, isAdminConfigured } from "@/lib/firebase/admin";
import { isGoogleSheetMime } from "@/lib/drive/constants";
import { getDriveClient } from "@/lib/drive/google-client";

export async function GET(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await getAdminAuth().verifyIdToken(token);
  const fileId = req.nextUrl.searchParams.get("id");
  if (!fileId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const snap = await getAdminFirestore()
    .doc(`users/${decoded.uid}/integrations/googleDrive`)
    .get();
  const refresh = snap.data()?.refreshToken as string | undefined;
  if (!refresh) {
    return NextResponse.json({ error: "Drive not connected" }, { status: 400 });
  }

  const drive = await getDriveClient(refresh);

  const meta = await drive.files.get({
    fileId,
    fields: "mimeType",
  });
  const mime = meta.data.mimeType ?? "";

  let buf: ArrayBuffer;
  if (isGoogleSheetMime(mime)) {
    const exported = await drive.files.export(
      { fileId, mimeType: "text/csv" },
      { responseType: "arraybuffer" }
    );
    buf = exported.data as ArrayBuffer;
  } else {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    buf = res.data as ArrayBuffer;
  }

  const text = new TextDecoder().decode(buf);
  return NextResponse.json({ text });
}
