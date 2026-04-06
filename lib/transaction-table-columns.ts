import type { TransactionTableColumnId, UserSettings } from "@/types";

/** Togglable data columns (checkbox column is always shown). */
export const TRANSACTION_TABLE_COLUMN_IDS: TransactionTableColumnId[] = [
  "date",
  "description",
  "source",
  "category",
  "amount",
  "actions",
];

export const TRANSACTION_TABLE_COLUMN_LABELS: Record<
  TransactionTableColumnId,
  string
> = {
  date: "Date",
  description: "Description",
  source: "Source",
  category: "Category",
  amount: "Amount",
  actions: "Actions",
};

/** Default visibility: Source off; everything else on (matches prior single layout). */
export const DEFAULT_TRANSACTION_TABLE_COLUMNS: Record<
  TransactionTableColumnId,
  boolean
> = {
  date: true,
  description: true,
  source: false,
  category: true,
  amount: true,
  actions: true,
};

export function mergeTransactionTableColumns(
  partial?: UserSettings["transactionTableColumns"]
): Record<TransactionTableColumnId, boolean> {
  return {
    ...DEFAULT_TRANSACTION_TABLE_COLUMNS,
    ...partial,
  };
}

export function countVisibleTransactionColumns(
  cols: Record<TransactionTableColumnId, boolean>
): number {
  return TRANSACTION_TABLE_COLUMN_IDS.filter((id) => cols[id]).length;
}
