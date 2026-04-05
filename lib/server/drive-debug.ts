/**
 * Verbose Drive API diagnostics (JSON bodies, extra fields).
 * Enable with DRIVE_DEBUG=1 in .env.local (server) or NODE_ENV=development.
 */
export function isDriveDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.DRIVE_DEBUG === "1" || process.env.DRIVE_DEBUG === "true";
}
