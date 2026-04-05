/** Google Drive MIME types we list and import */
export const DRIVE_MIME_CSV = "text/csv";
export const DRIVE_MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";

/** Query fragment: CSV files and native Google Sheets in a folder */
export function driveListQueryForFolder(folderId: string): string {
  return `'${folderId}' in parents and trashed = false and (mimeType = '${DRIVE_MIME_CSV}' or mimeType = '${DRIVE_MIME_GOOGLE_SHEET}')`;
}

export function isGoogleSheetMime(mime: string | null | undefined): boolean {
  return mime === DRIVE_MIME_GOOGLE_SHEET;
}

/** Open in browser: Sheets editor vs Drive file preview */
export function driveFileOpenUrl(
  fileId: string,
  mime?: string | null
): string {
  return isGoogleSheetMime(mime)
    ? `https://docs.google.com/spreadsheets/d/${fileId}/edit`
    : `https://drive.google.com/file/d/${fileId}/view`;
}
