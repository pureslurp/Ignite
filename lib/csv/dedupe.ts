import { getDexie } from "@/lib/db/dexie";
import type { Transaction } from "@/types";

async function sha256Hex(message: string): Promise<string> {
  const enc = new TextEncoder().encode(message);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable identity for a bank row: same date, amount, and description matches
 * across CSV files and imports (source file name is not part of the hash).
 */
export async function buildDedupeHash(parts: {
  date: string;
  amount: number;
  description: string;
}): Promise<string> {
  const base = [
    parts.date,
    Math.round(parts.amount * 100) / 100,
    parts.description.trim().toLowerCase(),
  ].join("|");
  return sha256Hex(base);
}

/**
 * Returns an existing transaction if this row is already stored — by
 * `dedupeHash` or by legacy identity (date + amount + description) for rows
 * imported before the hash excluded the file name.
 */
export async function findExistingDuplicateTransaction(
  date: string,
  amount: number,
  description: string,
  dedupeHash: string
): Promise<Transaction | undefined> {
  const db = getDexie();
  const byHash = await db.transactions
    .where("dedupeHash")
    .equals(dedupeHash)
    .first();
  if (byHash) return byHash;

  const norm = description.trim().toLowerCase();
  const amt = Math.round(amount * 100) / 100;
  const sameDay = await db.transactions.where("date").equals(date).toArray();
  return sameDay.find(
    (t) =>
      Math.abs(t.amount - amt) < 0.005 &&
      t.description.trim().toLowerCase() === norm
  );
}
