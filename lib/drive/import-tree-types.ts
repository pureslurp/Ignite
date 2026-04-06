/** JSON shape returned by POST /api/drive/list (recursive folder listing). */

export type DriveImportFileNode = {
  kind: "file";
  id: string;
  name: string;
  modifiedTime?: string;
  mimeType?: string;
};

export type DriveImportFolderNode = {
  kind: "folder";
  id: string;
  name: string;
  children: DriveImportNode[];
};

export type DriveImportNode = DriveImportFileNode | DriveImportFolderNode;
