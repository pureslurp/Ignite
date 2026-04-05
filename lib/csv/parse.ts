import Papa from "papaparse";
import type { ImportRule, Category, ExclusionReason, ImportRuleAction } from "@/types";

export interface ParsedRow {
  raw: Record<string, string>;
  date: string;
  amount: number;
  description: string;
  merchant?: string;
  memo?: string;
  issuerCategory?: string;
}

export function parseCsvText(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });
  if (result.errors.length) {
    console.warn("CSV parse warnings", result.errors);
  }
  return result.data.filter((row) => Object.keys(row).some((k) => row[k]?.trim()));
}

/**
 * Parse a currency cell. Supports accounting negatives in parentheses (common in Sheets).
 */
export function normalizeAmount(raw: string | number, invert?: boolean): number {
  if (typeof raw === "number") {
    if (Number.isNaN(raw)) return 0;
    return invert ? -raw : raw;
  }
  let s = String(raw).trim().replace(/^"|"$/g, "");
  let negParen = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negParen = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  const signed = negParen ? -Math.abs(n) : n;
  return invert ? -signed : signed;
}

/**
 * Chase-style payoff lines and similar — not merchant names that merely contain "payment".
 */
function isLikelyCardPayoffDescription(description: string): boolean {
  const d = description.toLowerCase();
  return (
    /\bautomatic\s+payment\b/.test(d) ||
    /\bautopay\b/.test(d) ||
    /\bauto\s+pay\b/.test(d) ||
    /\bpayment\s*-\s*thank\b/.test(d) ||
    /\bpayment\s+thank\s+you\b/.test(d) ||
    /\bpayment\s+received\b/.test(d) ||
    /\bonline\s+payment\s+to\b/.test(d)
  );
}

/** Map row using column keys; produce spending-positive amount for card-style negatives = spend */
export function rowFromMapping(
  raw: Record<string, string>,
  mapping: {
    dateCol: string;
    amountCol: string;
    descriptionCol: string;
    merchantCol?: string;
    memoCol?: string;
    issuerCategoryCol?: string;
    /** bank export: use Details DEBIT/CREDIT */
    detailsCol?: string;
    dateFormat?: "us" | "iso";
  }
): ParsedRow | null {
  const dateRaw = raw[mapping.dateCol]?.trim();
  const amountRaw = raw[mapping.amountCol];
  const description = raw[mapping.descriptionCol]?.trim() ?? "";
  if (!dateRaw || amountRaw === undefined || amountRaw === "") return null;

  const amount = normalizeAmount(amountRaw);
  const details = mapping.detailsCol
    ? raw[mapping.detailsCol]?.trim().toUpperCase()
    : undefined;

  // Chase bank: debits negative → spending positive
  // Card: purchases often negative → spending positive
  let spendingAmount = Math.abs(amount);
  if (details === "CREDIT" && amount > 0) {
    /* credit to account — treat as non-spending */
    spendingAmount = -Math.abs(amount);
  }
  if (details === "DEBIT" && amount < 0) {
    spendingAmount = Math.abs(amount);
  }
  // Card: negative = purchase outflow
  if (!details && amount < 0) {
    spendingAmount = Math.abs(amount);
  }
  // Card payoff / autopay (positive amount paying down the card) — income-like.
  // Do NOT match bare "payment" (e.g. "BILL PAYMENT", "ATT*BILL PAYMENT") or imports
  // from Sheets with positive purchase amounts get wrongly excluded.
  if (!details && amount > 0 && isLikelyCardPayoffDescription(description)) {
    spendingAmount = -amount;
  }

  const date = parseDateToIso(dateRaw, mapping.dateFormat ?? "us");
  if (!date) return null;

  return {
    raw,
    date,
    amount: spendingAmount,
    description,
    merchant: mapping.merchantCol ? raw[mapping.merchantCol]?.trim() : undefined,
    memo: mapping.memoCol ? raw[mapping.memoCol]?.trim() : undefined,
    issuerCategory: mapping.issuerCategoryCol
      ? raw[mapping.issuerCategoryCol]?.trim()
      : undefined,
  };
}

function parseDateToIso(s: string, fmt: "us" | "iso"): string | null {
  const t = s.trim();
  if (fmt === "iso" || /^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1]!.padStart(2, "0");
    const dd = m[2]!.padStart(2, "0");
    const yyyy = m[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function matchRule(text: string, rule: ImportRule): boolean {
  const hay = text.toLowerCase();
  const pat = rule.pattern.toLowerCase();
  if (rule.matchType === "regex") {
    try {
      const r = new RegExp(pat, "i");
      return r.test(text);
    } catch {
      return false;
    }
  }
  if (rule.matchType === "starts_with") {
    return hay.startsWith(pat);
  }
  return hay.includes(pat);
}

/** Escape a string for use inside a RegExp (e.g. exact description match). */
export function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether an import rule matches a single transaction description (import blob = description only). */
export function importRuleMatchesDescription(
  rule: ImportRule,
  description: string
): boolean {
  return matchRule(description, rule);
}

export function applyImportRules(
  description: string,
  merchant: string | undefined,
  memo: string | undefined,
  rules: ImportRule[],
  categories: Category[],
  issuerCategory?: string,
  issuerMap?: Record<string, string>
): {
  categoryId: string | null;
  countsTowardSpending: boolean;
  exclusionReason: ExclusionReason;
} {
  const catById = new Map(categories.map((c) => [c.id, c]));
  let categoryId: string | null = null;
  let countsTowardSpending = true;
  let exclusionReason: ExclusionReason = null;

  if (issuerCategory && issuerMap?.[issuerCategory]) {
    categoryId = issuerMap[issuerCategory] ?? null;
    const cat = categoryId ? catById.get(categoryId) : undefined;
    if (cat && !cat.countsTowardSpending) {
      countsTowardSpending = false;
      exclusionReason = "investment";
    }
  }

  const blob = [description, merchant ?? "", memo ?? ""].join(" ");
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (!matchRule(blob, rule)) continue;
    const a: ImportRuleAction = rule.action;
    if (a.type === "set_category") {
      categoryId = a.categoryId;
      const cat = catById.get(a.categoryId);
      countsTowardSpending = cat?.countsTowardSpending ?? true;
    } else if (a.type === "exclude_spending") {
      countsTowardSpending = false;
      exclusionReason = a.reason === "investment" ? "investment" : "transfer";
    } else if (a.type === "set_category_and_exclude") {
      categoryId = a.categoryId;
      countsTowardSpending = !a.exclude;
      if (!countsTowardSpending) exclusionReason = "investment";
    }
  }

  return { categoryId, countsTowardSpending, exclusionReason };
}
