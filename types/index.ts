export type ExclusionReason =
  | "investment"
  | "income_credit"
  | "transfer"
  | "user_excluded"
  | null;

export interface Transaction {
  id: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Positive magnitude for spending that counts; sign per row type */
  amount: number;
  description: string;
  categoryId: string | null;
  account: string;
  countsTowardSpending: boolean;
  exclusionReason: ExclusionReason;
  originalCsvName?: string;
  dedupeHash?: string;
  /** User-written note for this transaction */
  notes?: string;
  /**
   * Dollars not counted as your spending (e.g. reimbursed in cash). Only used when
   * `countsTowardSpending` is true; counted amount is `amount` minus this (min 0).
   */
  splitExcludedAmount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  countsTowardSpending: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ImportRuleAction =
  | { type: "set_category"; categoryId: string }
  | { type: "exclude_spending"; reason: "investment" | "transfer" }
  | {
      type: "set_category_and_exclude";
      categoryId: string;
      exclude: boolean;
    };

export interface ImportRule {
  id: string;
  /** Lower = runs first */
  priority: number;
  /** Match against concatenated description + merchant + memo (lowercased) */
  pattern: string;
  /** contains = substring; starts_with = text must begin with pattern (case-insensitive); regex = full RegExp */
  matchType: "contains" | "starts_with" | "regex";
  /**
   * When set, the rule applies only if the transaction amount equals this value
   * (same currency units as stored amounts, compared to two decimal places).
   * Combine with pattern for “contains X and amount = Y”.
   */
  matchAmount?: number;
  action: ImportRuleAction;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetMonth {
  id: string;
  /** YYYY-MM */
  month: string;
  categoryBudgets: Record<string, number>;
  updatedAt: number;
}

/** Transactions table column visibility (checkbox column is always shown). */
export type TransactionTableColumnId =
  | "date"
  | "description"
  | "source"
  | "category"
  | "amount"
  | "actions";

export interface UserSettings {
  driveFolderId?: string;
  /** Chase Category column → internal category id */
  issuerCategoryMappings?: Record<string, string>;
  investmentExclusionPatterns?: string[];
  currency?: string;
  /**
   * Which transaction table columns are visible (desktop + mobile).
   * Omitted keys use defaults in `lib/transaction-table-columns`.
   */
  transactionTableColumns?: Partial<
    Record<TransactionTableColumnId, boolean>
  >;
  updatedAt?: number;
}
