import type { Category } from "@/types";

export const UNCATEGORIZED_ID = "uncategorized";

export const DEFAULT_CATEGORY_SEED: Omit<
  Category,
  "id" | "createdAt" | "updatedAt"
>[] = [
  { name: "Groceries", color: "#22c55e", sortOrder: 0, countsTowardSpending: true },
  { name: "Dining", color: "#f97316", sortOrder: 1, countsTowardSpending: true },
  { name: "Gas", color: "#eab308", sortOrder: 2, countsTowardSpending: true },
  { name: "Bills", color: "#3b82f6", sortOrder: 3, countsTowardSpending: true },
  { name: "Shopping", color: "#a855f7", sortOrder: 4, countsTowardSpending: true },
  { name: "Entertainment", color: "#ec4899", sortOrder: 5, countsTowardSpending: true },
  { name: "Investment", color: "#64748b", sortOrder: 6, countsTowardSpending: false },
  { name: "Transfer", color: "#94a3b8", sortOrder: 7, countsTowardSpending: false },
];

export const BRAND = {
  navy: "#0B1219",
  orangeStart: "#FFB800",
  orangeEnd: "#FF4500",
} as const;
