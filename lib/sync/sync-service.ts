"use client";

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import type { Transaction, Category, ImportRule, BudgetMonth, UserSettings } from "@/types";
import { getDexie } from "@/lib/db/dexie";
import { DEFAULT_CATEGORY_SEED, UNCATEGORIZED_ID } from "@/lib/constants";

function txFromDoc(id: string, data: Record<string, unknown>): Transaction {
  const dateVal = data.date;
  let dateStr: string;
  if (dateVal instanceof Timestamp) {
    dateStr = dateVal.toDate().toISOString().slice(0, 10);
  } else if (typeof dateVal === "string") {
    dateStr = dateVal.slice(0, 10);
  } else {
    dateStr = new Date().toISOString().slice(0, 10);
  }
  return {
    id,
    date: dateStr,
    amount: Number(data.amount ?? 0),
    description: String(data.description ?? ""),
    categoryId: (data.categoryId as string | null) ?? null,
    account: String(data.account ?? ""),
    countsTowardSpending: Boolean(data.countsTowardSpending ?? true),
    exclusionReason: (data.exclusionReason as Transaction["exclusionReason"]) ?? null,
    originalCsvName: data.originalCsvName as string | undefined,
    dedupeHash: data.dedupeHash as string | undefined,
    notes:
      typeof data.notes === "string" && data.notes.length > 0
        ? data.notes
        : undefined,
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

function catFromDoc(id: string, data: Record<string, unknown>): Category {
  return {
    id,
    name: String(data.name ?? ""),
    color: String(data.color ?? "#888"),
    sortOrder: Number(data.sortOrder ?? 0),
    countsTowardSpending: Boolean(data.countsTowardSpending ?? true),
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

export async function seedDefaultCategories(uid: string): Promise<void> {
  const db = getFirestoreDb();
  const dexie = getDexie();
  const snap = await getDocs(collection(db, "users", uid, "categories"));
  if (!snap.empty) return;

  const batch = writeBatch(db);
  const now = Date.now();
  for (let i = 0; i < DEFAULT_CATEGORY_SEED.length; i++) {
    const seed = DEFAULT_CATEGORY_SEED[i]!;
    const id = crypto.randomUUID();
    const c: Category = {
      id,
      ...seed,
      sortOrder: seed.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(doc(db, "users", uid, "categories", id), {
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
      countsTowardSpending: c.countsTowardSpending,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
    await dexie.categories.put(c);
  }
  const unc: Category = {
    id: UNCATEGORIZED_ID,
    name: "Uncategorized",
    color: "#94a3b8",
    sortOrder: 999,
    countsTowardSpending: true,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(doc(db, "users", uid, "categories", UNCATEGORIZED_ID), {
    name: unc.name,
    color: unc.color,
    sortOrder: unc.sortOrder,
    countsTowardSpending: unc.countsTowardSpending,
    createdAt: now,
    updatedAt: now,
  });
  await dexie.categories.put(unc);
  await batch.commit();
}

export async function pullAllFromFirestore(uid: string): Promise<void> {
  const db = getFirestoreDb();
  const dexie = getDexie();

  const [txSnap, catSnap, ruleSnap, budgetSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "transactions")),
    getDocs(collection(db, "users", uid, "categories")),
    getDocs(collection(db, "users", uid, "importRules")),
    getDocs(collection(db, "users", uid, "budgets")),
  ]);

  await dexie.transactions.clear();
  const txRows = txSnap.docs
    .map((d) => txFromDoc(d.id, d.data()))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const row of txRows) {
    await dexie.transactions.put(row);
  }
  await dexie.categories.clear();
  const cats = catSnap.docs
    .map((d) => catFromDoc(d.id, d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const c of cats) {
    await dexie.categories.put(c);
  }
  await dexie.importRules.clear();
  const rules = ruleSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        priority: Number(data.priority ?? 0),
        pattern: String(data.pattern ?? ""),
        matchType: (data.matchType as ImportRule["matchType"]) ?? "contains",
        action: data.action as ImportRule["action"],
        createdAt: Number(data.createdAt ?? Date.now()),
        updatedAt: Number(data.updatedAt ?? Date.now()),
      } satisfies ImportRule;
    })
    .sort((a, b) => a.priority - b.priority);
  for (const r of rules) {
    await dexie.importRules.put(r);
  }
  await dexie.budgets.clear();
  for (const d of budgetSnap.docs) {
    const data = d.data();
    await dexie.budgets.put({
      id: d.id,
      month: String(data.month ?? d.id),
      categoryBudgets: (data.categoryBudgets as Record<string, number>) ?? {},
      updatedAt: Number(data.updatedAt ?? Date.now()),
    });
  }

  const settingsRef = doc(db, "users", uid, "settings", "default");
  const { getDoc } = await import("firebase/firestore");
  const settingsSnap = await getDoc(settingsRef);
  if (settingsSnap.exists()) {
    await dexie.settings.put({
      key: "default",
      ...(settingsSnap.data() as UserSettings),
    });
  }
}

export function subscribeToFirestore(
  uid: string,
  onChange: () => void
): Unsubscribe {
  const db = getFirestoreDb();
  return onSnapshot(collection(db, "users", uid, "transactions"), () => {
    pullAllFromFirestore(uid).then(onChange).catch(console.error);
  });
}

export async function upsertTransaction(uid: string, t: Transaction): Promise<void> {
  const db = getFirestoreDb();
  const dexie = getDexie();
  const ref = doc(db, "users", uid, "transactions", t.id);
  await setDoc(ref, {
    date: t.date,
    amount: t.amount,
    description: t.description,
    categoryId: t.categoryId,
    account: t.account,
    countsTowardSpending: t.countsTowardSpending,
    exclusionReason: t.exclusionReason,
    originalCsvName: t.originalCsvName ?? null,
    dedupeHash: t.dedupeHash ?? null,
    notes: t.notes?.trim() ? t.notes.trim() : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
  await dexie.transactions.put(t);
}

export async function deleteTransaction(uid: string, id: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "users", uid, "transactions", id));
  await getDexie().transactions.delete(id);
}

export async function upsertCategory(uid: string, c: Category): Promise<void> {
  const db = getFirestoreDb();
  await setDoc(doc(db, "users", uid, "categories", c.id), {
    name: c.name,
    color: c.color,
    sortOrder: c.sortOrder,
    countsTowardSpending: c.countsTowardSpending,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
  await getDexie().categories.put(c);
}

export async function deleteCategory(uid: string, id: string): Promise<void> {
  if (id === UNCATEGORIZED_ID) return;
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "users", uid, "categories", id));
  await getDexie().categories.delete(id);
}

export async function upsertImportRule(uid: string, r: ImportRule): Promise<void> {
  const db = getFirestoreDb();
  await setDoc(doc(db, "users", uid, "importRules", r.id), {
    priority: r.priority,
    pattern: r.pattern,
    matchType: r.matchType,
    action: r.action,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
  await getDexie().importRules.put(r);
}

export async function deleteImportRule(uid: string, id: string): Promise<void> {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "users", uid, "importRules", id));
  await getDexie().importRules.delete(id);
}

export async function upsertBudgetMonth(uid: string, b: BudgetMonth): Promise<void> {
  const db = getFirestoreDb();
  await setDoc(doc(db, "users", uid, "budgets", b.month), {
    month: b.month,
    categoryBudgets: b.categoryBudgets,
    updatedAt: b.updatedAt,
  });
  await getDexie().budgets.put(b);
}

export async function saveUserSettings(
  uid: string,
  partial: Partial<UserSettings>
): Promise<void> {
  const db = getFirestoreDb();
  const existing = await getDexie().settings.get("default");
  const { key: _k, ...rest } = existing ?? { key: "default" as const };
  const merged: UserSettings = {
    ...rest,
    ...partial,
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, "users", uid, "settings", "default"), merged, {
    merge: true,
  });
  await getDexie().settings.put({ key: "default", ...merged });
}
