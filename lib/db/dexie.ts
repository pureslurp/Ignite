import Dexie, { type Table } from "dexie";
import type { Transaction, Category, ImportRule, BudgetMonth, UserSettings } from "@/types";

export class IgniteDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  importRules!: Table<ImportRule, string>;
  budgets!: Table<BudgetMonth, string>;
  settings!: Table<{ key: string } & UserSettings, string>;

  constructor() {
    super("ignite-db");
    this.version(1).stores({
      transactions: "id, date, categoryId, countsTowardSpending, dedupeHash",
      categories: "id, sortOrder, name",
      importRules: "id, priority",
      budgets: "id, month",
      settings: "key",
    });
  }
}

let db: IgniteDB | undefined;

export function getDexie(): IgniteDB {
  if (typeof window === "undefined") {
    throw new Error("Dexie is client-only");
  }
  if (!db) {
    db = new IgniteDB();
  }
  return db;
}
