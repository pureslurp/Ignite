import type { DriveImportNode } from "@/lib/drive/import-tree-types";

export type DriveImportFlatRow = {
  id: string;
  name: string;
  /** Path from the configured root folder, for display */
  pathLabel: string;
  modifiedTime?: string;
  mimeType?: string;
};

/** All CSV/Sheet file rows in tree order (folders first at each level, then files). */
export function flattenDriveImportTree(
  nodes: DriveImportNode[],
  pathSegments: string[] = []
): DriveImportFlatRow[] {
  const rows: DriveImportFlatRow[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      const pathLabel =
        pathSegments.length > 0
          ? `${pathSegments.join(" / ")} / ${node.name}`
          : node.name;
      rows.push({
        id: node.id,
        name: node.name,
        pathLabel,
        modifiedTime: node.modifiedTime,
        mimeType: node.mimeType,
      });
    } else {
      rows.push(
        ...flattenDriveImportTree(node.children, [...pathSegments, node.name])
      );
    }
  }
  return rows;
}
