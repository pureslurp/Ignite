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

export interface UserSettings {
  driveFolderId?: string;
  /** Chase Category column → internal category id */
  issuerCategoryMappings?: Record<string, string>;
  investmentExclusionPatterns?: string[];
  currency?: string;
  updatedAt?: number;
}
