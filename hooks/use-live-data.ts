"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDexie } from "@/lib/db/dexie";
import type {
  Transaction,
  Category,
  ImportRule,
  BudgetMonth,
  UserSettings,
} from "@/types";

export function useTransactions() {
  return useLiveQuery(
    () => getDexie().transactions.orderBy("date").reverse().toArray(),
    []
  );
}

export function useCategories() {
  const raw = useLiveQuery(() => getDexie().categories.toArray(), []);
  return useMemo(() => {
    if (raw === undefined) return undefined;
    return [...raw].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [raw]);
}

export function useImportRules() {
  return useLiveQuery(
    () => getDexie().importRules.orderBy("priority").toArray(),
    []
  );
}

export function useBudgets() {
  return useLiveQuery(() => getDexie().budgets.toArray(), []);
}

/** Settings row from Dexie (`key` + UserSettings fields). */
export function useUserSettingsRow():
  | ({ key: string } & UserSettings)
  | undefined {
  return useLiveQuery(() => getDexie().settings.get("default"), []);
}

export function useSpendingTotals(transactions: Transaction[] | undefined) {
  if (!transactions) return { total: 0, byCategory: {} as Record<string, number> };
  let total = 0;
  const byCategory: Record<string, number> = {};
  for (const t of transactions) {
    if (!t.countsTowardSpending) continue;
    total += t.amount;
    const k = t.categoryId ?? "none";
    byCategory[k] = (byCategory[k] ?? 0) + t.amount;
  }
  return { total, byCategory };
}
