import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import admin from "firebase-admin";

/**
 * Prefer `FIREBASE_SERVICE_ACCOUNT_PATH` (path to JSON file) to avoid .env quoting issues.
 * Otherwise set `FIREBASE_SERVICE_ACCOUNT_JSON` as a single-line JSON string.
 */
function loadServiceAccountRaw(): string | null {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (pathEnv) {
    const p = resolve(process.cwd(), pathEnv);
    if (existsSync(p)) {
      return readFileSync(p, "utf-8");
    }
    // Path from local .env but file missing on the host (e.g. Vercel) — use inline JSON.
    if (jsonEnv) return jsonEnv;
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_PATH file not found: ${p}. On Vercel set FIREBASE_SERVICE_ACCOUNT_JSON (single-line service account JSON) and remove or omit the path.`
    );
  }
  return jsonEnv || null;
}

function init() {
  if (admin.apps.length) return admin;
  const raw = loadServiceAccountRaw();
  if (!raw) {
    throw new Error(
      "Set FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file) or FIREBASE_SERVICE_ACCOUNT_JSON"
    );
  }
  let cred: Record<string, unknown>;
  try {
    cred = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Invalid service account JSON: ${msg}. Use FIREBASE_SERVICE_ACCOUNT_PATH pointing to the downloaded .json file, or one line of minified JSON in FIREBASE_SERVICE_ACCOUNT_JSON.`
    );
  }
  admin.initializeApp({
    credential: admin.credential.cert(cred as admin.ServiceAccount),
  });
  return admin;
}

export function getAdminAuth() {
  return init().auth();
}

export function getAdminFirestore() {
  return init().firestore();
}

export function isAdminConfigured(): boolean {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonEnv) return true;
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (pathEnv) {
    const p = resolve(process.cwd(), pathEnv);
    return existsSync(p);
  }
  return false;
}

/** For diagnostics only — never log the full service account. */
export function getServiceAccountProjectDiagnostics(): {
  projectId: string | null;
  jsonParseFailed: boolean;
  hasEnvVar: boolean;
  source: "path" | "env" | "none";
} {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const rawFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  let raw: string | null = null;
  let source: "path" | "env" | "none" = "none";

  if (pathEnv) {
    source = "path";
    try {
      const p = resolve(process.cwd(), pathEnv);
      if (existsSync(p)) raw = readFileSync(p, "utf-8");
    } catch {
      raw = null;
    }
  } else if (rawFromEnv) {
    source = "env";
    raw = rawFromEnv;
  }

  if (!raw) {
    return { projectId: null, jsonParseFailed: false, hasEnvVar: false, source };
  }
  try {
    const o = JSON.parse(raw) as { project_id?: string };
    return {
      projectId: typeof o.project_id === "string" ? o.project_id : null,
      jsonParseFailed: false,
      hasEnvVar: true,
      source,
    };
  } catch {
    return { projectId: null, jsonParseFailed: true, hasEnvVar: true, source };
  }
}
