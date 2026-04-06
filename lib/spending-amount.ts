import type { Transaction } from "@/types";

/**
 * Portion of `amount` not counted toward spending (e.g. cash reimbursements after
 * paying a group tab). Only meaningful when `countsTowardSpending` is true.
 */
export function clampSplitExcluded(
  amount: number,
  raw: number | undefined | null
): number {
  if (raw == null || Number.isNaN(raw) || raw <= 0) return 0;
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(Math.max(0, rounded), Math.round(amount * 100) / 100);
}

/** Dollar amount that rolls up into budgets and spending reports for this row. */
export function spendingAmountForTransaction(t: Transaction): number {
  if (!t.countsTowardSpending) return 0;
  const ex = clampSplitExcluded(t.amount, t.splitExcludedAmount);
  return Math.round(Math.max(0, t.amount - ex) * 100) / 100;
}

export function hasActiveSplit(t: Transaction): boolean {
  return (
    t.countsTowardSpending &&
    clampSplitExcluded(t.amount, t.splitExcludedAmount) > 0
  );
}

/** Remove split data (e.g. when the row is fully excluded from spending). */
export function stripSplitFromTransaction(t: Transaction): Transaction {
  if (t.splitExcludedAmount == null) return t;
  const { splitExcludedAmount: _, ...rest } = t;
  return rest;
}
