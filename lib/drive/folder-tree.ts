import type { drive_v3 } from "googleapis";
import {
  DRIVE_MIME_CSV,
  DRIVE_MIME_GOOGLE_SHEET,
} from "@/lib/drive/constants";
import type {
  DriveImportFileNode,
  DriveImportNode,
} from "@/lib/drive/import-tree-types";

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function listImmediateChildren(
  drive: drive_v3.Drive,
  folderId: string
): Promise<{
  folders: { id: string; name: string }[];
  files: DriveImportFileNode[];
}> {
  const folders: { id: string; name: string }[] = [];
  const files: DriveImportFileNode[] = [];
  let pageToken: string | undefined;

  const q = `'${folderId}' in parents and trashed = false and (mimeType = '${FOLDER_MIME}' or mimeType = '${DRIVE_MIME_CSV}' or mimeType = '${DRIVE_MIME_GOOGLE_SHEET}')`;

  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, modifiedTime, mimeType)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue;
      if (f.mimeType === FOLDER_MIME) {
        folders.push({ id: f.id, name: f.name });
      } else {
        files.push({
          kind: "file",
          id: f.id,
          name: f.name,
          modifiedTime: f.modifiedTime ?? undefined,
          mimeType: f.mimeType ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return { folders, files };
}

/**
 * Lists CSV + Google Sheets under `folderId`, recursively including subfolders.
 * Folders are listed first (alphabetically), then files (alphabetically), at each level.
 */
export async function buildDriveImportTree(
  drive: drive_v3.Drive,
  folderId: string,
  options?: { maxDepth?: number }
): Promise<DriveImportNode[]> {
  const maxDepth = options?.maxDepth ?? 64;
  if (maxDepth <= 0) return [];

  const { folders, files } = await listImmediateChildren(drive, folderId);
  const nodes: DriveImportNode[] = [];

  for (const folder of folders) {
    const children = await buildDriveImportTree(drive, folder.id, {
      maxDepth: maxDepth - 1,
    });
    nodes.push({
      kind: "folder",
      id: folder.id,
      name: folder.name,
      children,
    });
  }

  for (const file of files) {
    nodes.push(file);
  }

  return nodes;
}
