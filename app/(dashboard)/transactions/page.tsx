"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import {
  useTransactions,
  useCategories,
  useImportRules,
} from "@/hooks/use-live-data";
import {
  upsertTransaction,
  deleteTransaction,
  upsertImportRule,
} from "@/lib/sync/sync-service";
import {
  escapeRegexChars,
  importRuleMatchesDescription,
} from "@/lib/csv/parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  StickyNote,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ImportRule, Transaction } from "@/types";
import { UNCATEGORIZED_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";

type RuleMode = "none" | "exact" | "contains" | "starts_with" | "custom";

type RuleMatchChoice = ImportRule["matchType"];

type BuildImportRulePatternResult =
  | { kind: "none" }
  | { kind: "rule"; pattern: string; matchType: RuleMatchChoice }
  | { kind: "invalid"; message: string };

function buildImportRulePattern(
  mode: RuleMode,
  description: string,
  customPattern: string,
  customMatchType: RuleMatchChoice
): BuildImportRulePatternResult {
  if (mode === "none") return { kind: "none" };
  if (
    (mode === "exact" ||
      mode === "contains" ||
      mode === "starts_with") &&
    !description.trim()
  ) {
    return {
      kind: "invalid",
      message: "This transaction has no description to match.",
    };
  }
  if (mode === "exact") {
    return {
      kind: "rule",
      pattern: `^${escapeRegexChars(description)}$`,
      matchType: "regex",
    };
  }
  if (mode === "contains") {
    return { kind: "rule", pattern: description, matchType: "contains" };
  }
  if (mode === "starts_with") {
    return {
      kind: "rule",
      pattern: description,
      matchType: "starts_with",
    };
  }
  const p = customPattern.trim();
  if (!p) {
    return { kind: "invalid", message: "Enter a custom pattern." };
  }
  return { kind: "rule", pattern: p, matchType: customMatchType };
}

function nextImportRulePriority(rules: ImportRule[] | undefined): number {
  const list = rules ?? [];
  return list.length ? Math.max(...list.map((r) => r.priority)) + 1 : 0;
}

type SortKey = "date" | "description" | "category" | "amount";

function categoryLabel(
  t: Transaction,
  catMap: Map<string, { name: string }>
): string {
  const id = t.categoryId;
  if (!id || id === UNCATEGORIZED_ID) return "Uncategorized";
  return catMap.get(id)?.name ?? id;
}

function compareForSort(
  a: Transaction,
  b: Transaction,
  sortKey: SortKey,
  sortDir: "asc" | "desc",
  catMap: Map<string, { name: string }>
): number {
  let cmp = 0;
  switch (sortKey) {
    case "date":
      cmp = a.date.localeCompare(b.date);
      break;
    case "description":
      cmp = a.description.localeCompare(b.description, undefined, {
        sensitivity: "base",
      });
      break;
    case "category":
      cmp = categoryLabel(a, catMap).localeCompare(
        categoryLabel(b, catMap),
        undefined,
        { sensitivity: "base" }
      );
      break;
    case "amount":
      cmp = a.amount - b.amount;
      break;
    default:
      break;
  }
  return sortDir === "asc" ? cmp : -cmp;
}

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
  align = "start",
}: {
  label: string;
  columnKey: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
  align?: "start" | "end";
}) {
  const active = sortKey === columnKey;
  return (
    <TableHead className={className}>
      <div
        className={cn(
          align === "end" && "flex justify-end",
          align === "start" && "-ml-1"
        )}
      >
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 font-medium hover:bg-muted/80",
            align === "end" ? "text-right" : "text-left",
            active && "text-foreground"
          )}
          onClick={() => onSort(columnKey)}
          aria-sort={
            active
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
        >
          <span className="min-w-0 truncate">{label}</span>
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0 opacity-70" aria-hidden />
            ) : (
              <ArrowDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
            )
          ) : (
            <ArrowUpDown className="size-3.5 shrink-0 opacity-35" aria-hidden />
          )}
        </button>
      </div>
    </TableHead>
  );
}

/** Long rule labels + full transaction description; override Select value line-clamp. */
const ruleDialogSelectTriggerClass =
  "h-auto min-h-9 w-full max-w-full py-2 text-left whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal [&_[data-slot=select-value]]:text-left";

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const transactions = useTransactions();
  const categories = useCategories();
  const importRules = useImportRules();
  const [search, setSearch] = useState("");
  const [filterSpend, setFilterSpend] = useState<"all" | "spending" | "excluded">(
    "spending"
  );
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excludeDialogOpen, setExcludeDialogOpen] = useState(false);
  const [pendingExclude, setPendingExclude] = useState<Transaction | null>(
    null
  );
  const [excludeRuleMode, setExcludeRuleMode] = useState<RuleMode>("none");
  const [customPattern, setCustomPattern] = useState("");
  const [customMatchType, setCustomMatchType] =
    useState<RuleMatchChoice>("contains");
  const [applyRuleToExisting, setApplyRuleToExisting] = useState(false);
  const [excludeSubmitting, setExcludeSubmitting] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<{
    tx: Transaction;
    newCategoryId: string;
  } | null>(null);
  const [categoryRuleMode, setCategoryRuleMode] = useState<RuleMode>("none");
  const [categoryCustomPattern, setCategoryCustomPattern] = useState("");
  const [categoryCustomMatchType, setCategoryCustomMatchType] =
    useState<RuleMatchChoice>("contains");
  const [categoryApplyExisting, setCategoryApplyExisting] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  /** After picking a category, show Add rule for this row for 5s. */
  const [categoryRuleHint, setCategoryRuleHint] = useState<{
    txId: string;
    categoryId: string;
  } | null>(null);
  const categoryRuleHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Keep row visible ~5s after categorizing so filters (e.g. Uncategorized) don’t hide it before Add rule */
  const [lingerRowIds, setLingerRowIds] = useState<Set<string>>(
    () => new Set()
  );
  const lingerTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  function clearCategoryRuleHintTimer() {
    if (categoryRuleHintTimerRef.current != null) {
      clearTimeout(categoryRuleHintTimerRef.current);
      categoryRuleHintTimerRef.current = null;
    }
  }

  function scheduleCategoryRowLinger(txId: string) {
    const prevTimer = lingerTimersRef.current.get(txId);
    if (prevTimer != null) clearTimeout(prevTimer);
    setLingerRowIds((prev) => new Set(prev).add(txId));
    const tid = setTimeout(() => {
      setLingerRowIds((prev) => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
      lingerTimersRef.current.delete(txId);
    }, 5000);
    lingerTimersRef.current.set(txId, tid);
  }

  useEffect(() => () => clearCategoryRuleHintTimer(), []);

  useEffect(
    () => () => {
      for (const t of lingerTimersRef.current.values()) clearTimeout(t);
      lingerTimersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    const raw = searchParams.get("category");
    if (raw == null || raw === "") return;
    const v = raw.trim();
    if (v === "all") {
      setFilterCategoryId("all");
      return;
    }
    if (v === "none") {
      setFilterCategoryId("none");
      return;
    }
    setFilterCategoryId(v);
  }, [searchParams]);

  const catMap = useMemo(
    () => new Map(categories?.map((c) => [c.id, c]) ?? []),
    [categories]
  );

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "date" || key === "amount" ? "desc" : "asc"
      );
    }
  }

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const minAmt = parseFloat(filterAmountMin);
    const maxAmt = parseFloat(filterAmountMax);
    const hasMin = filterAmountMin.trim() !== "" && !Number.isNaN(minAmt);
    const hasMax = filterAmountMax.trim() !== "" && !Number.isNaN(maxAmt);

    function matchesNonCategory(t: Transaction): boolean {
      if (filterSpend === "spending" && !t.countsTowardSpending) return false;
      if (filterSpend === "excluded" && t.countsTowardSpending) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.description.toLowerCase().includes(q)) return false;
      }
      if (filterDateFrom && t.date < filterDateFrom) return false;
      if (filterDateTo && t.date > filterDateTo) return false;
      if (hasMin && t.amount < minAmt) return false;
      if (hasMax && t.amount > maxAmt) return false;
      return true;
    }

    function matchesCategory(t: Transaction): boolean {
      if (filterCategoryId === "all") return true;
      const cid = t.categoryId;
      if (filterCategoryId === "none") {
        if (cid && cid !== UNCATEGORIZED_ID) return false;
      } else if (cid !== filterCategoryId) {
        return false;
      }
      return true;
    }

    const rows = transactions.filter((t) => {
      if (!matchesNonCategory(t)) return false;
      if (matchesCategory(t)) return true;
      if (lingerRowIds.has(t.id)) return true;
      return false;
    });

    rows.sort((a, b) =>
      compareForSort(a, b, sortKey, sortDir, catMap)
    );
    return rows;
  }, [
    transactions,
    search,
    filterSpend,
    filterCategoryId,
    filterDateFrom,
    filterDateTo,
    filterAmountMin,
    filterAmountMax,
    sortKey,
    sortDir,
    catMap,
    lingerRowIds,
  ]);

  function openExcludeDialog(t: Transaction) {
    setPendingExclude(t);
    setExcludeRuleMode("none");
    setCustomPattern(t.description);
    setCustomMatchType("contains");
    setApplyRuleToExisting(false);
    setExcludeDialogOpen(true);
  }

  function closeExcludeDialog() {
    setExcludeDialogOpen(false);
    setPendingExclude(null);
  }

  async function confirmExcludeFromDialog() {
    if (!user || !pendingExclude) return;
    const t = pendingExclude;
    const desc = t.description;

    const built = buildImportRulePattern(
      excludeRuleMode,
      desc,
      customPattern,
      customMatchType
    );
    if (excludeRuleMode !== "none") {
      if (built.kind === "invalid") {
        toast.error(built.message);
        return;
      }
    }

    setExcludeSubmitting(true);
    try {
      let newRule: ImportRule | null = null;

      if (excludeRuleMode !== "none" && built.kind === "rule") {
        newRule = {
          id: crypto.randomUUID(),
          priority: nextImportRulePriority(importRules),
          pattern: built.pattern,
          matchType: built.matchType,
          action: { type: "exclude_spending", reason: "transfer" },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await upsertImportRule(user.uid, newRule);
      }

      await upsertTransaction(user.uid, {
        ...t,
        countsTowardSpending: false,
        exclusionReason: "user_excluded",
        updatedAt: Date.now(),
      });

      if (newRule && applyRuleToExisting) {
        let n = 0;
        for (const row of transactions ?? []) {
          if (row.id === t.id) continue;
          if (!row.countsTowardSpending) continue;
          if (!importRuleMatchesDescription(newRule, row.description)) continue;
          await upsertTransaction(user.uid, {
            ...row,
            countsTowardSpending: false,
            exclusionReason: "transfer",
            updatedAt: Date.now(),
          });
          n++;
        }
        if (n > 0) {
          toast.message(`Matched ${n} other transaction${n === 1 ? "" : "s"}`);
        }
      }

      toast.success(
        newRule
          ? "Excluded and rule saved under Settings → Rules."
          : "Excluded from spending"
      );
      closeExcludeDialog();
    } finally {
      setExcludeSubmitting(false);
    }
  }

  async function toggleExclude(t: Transaction, on: boolean) {
    if (!user) return;
    await upsertTransaction(user.uid, {
      ...t,
      countsTowardSpending: !on,
      exclusionReason: on ? "user_excluded" : null,
      updatedAt: Date.now(),
    });
    toast.success(on ? "Excluded from spending" : "Counts toward spending");
  }

  async function setCategory(t: Transaction, categoryId: string | null) {
    if (!user) return;
    const id = categoryId ?? "none";
    const cat = id === "none" ? undefined : catMap.get(id);
    await upsertTransaction(user.uid, {
      ...t,
      categoryId: id === "none" ? null : id,
      countsTowardSpending: cat?.countsTowardSpending ?? true,
      updatedAt: Date.now(),
    });
  }

  function openCategoryDialog(t: Transaction, newCategoryId: string) {
    setPendingCategory({ tx: t, newCategoryId });
    setCategoryRuleMode("none");
    setCategoryCustomPattern(t.description);
    setCategoryCustomMatchType("contains");
    setCategoryApplyExisting(false);
    setCategoryDialogOpen(true);
  }

  function closeCategoryDialog() {
    setCategoryDialogOpen(false);
    setPendingCategory(null);
  }

  async function onCategorySelect(t: Transaction, v: string) {
    const current = t.categoryId ?? "none";
    if (v === current) return;
    clearCategoryRuleHintTimer();
    setCategoryRuleHint(null);
    if (v === "none") {
      await setCategory(t, null);
      return;
    }
    await setCategory(t, v);
    scheduleCategoryRowLinger(t.id);
    setCategoryRuleHint({ txId: t.id, categoryId: v });
    categoryRuleHintTimerRef.current = setTimeout(() => {
      setCategoryRuleHint(null);
      categoryRuleHintTimerRef.current = null;
    }, 5000);
  }

  function handleAddRuleClick(txId: string) {
    if (!categoryRuleHint || categoryRuleHint.txId !== txId) return;
    const row = transactions?.find((x) => x.id === txId);
    if (!row) return;
    const { categoryId } = categoryRuleHint;
    clearCategoryRuleHintTimer();
    setCategoryRuleHint(null);
    openCategoryDialog(row, categoryId);
  }

  async function confirmCategoryFromDialog() {
    if (!user || !pendingCategory) return;
    const { tx, newCategoryId } = pendingCategory;
    const desc = tx.description;
    const cat = catMap.get(newCategoryId);
    if (!cat) {
      toast.error("Category not found.");
      return;
    }

    const built = buildImportRulePattern(
      categoryRuleMode,
      desc,
      categoryCustomPattern,
      categoryCustomMatchType
    );
    if (categoryRuleMode !== "none" && built.kind === "invalid") {
      toast.error(built.message);
      return;
    }

    setCategorySubmitting(true);
    try {
      let newRule: ImportRule | null = null;
      if (categoryRuleMode !== "none" && built.kind === "rule") {
        newRule = {
          id: crypto.randomUUID(),
          priority: nextImportRulePriority(importRules),
          pattern: built.pattern,
          matchType: built.matchType,
          action: { type: "set_category", categoryId: newCategoryId },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await upsertImportRule(user.uid, newRule);
      }

      await upsertTransaction(user.uid, {
        ...tx,
        categoryId: newCategoryId,
        countsTowardSpending: cat.countsTowardSpending,
        updatedAt: Date.now(),
      });
      scheduleCategoryRowLinger(tx.id);

      if (newRule && categoryApplyExisting) {
        let n = 0;
        for (const row of transactions ?? []) {
          if (row.id === tx.id) continue;
          if (!importRuleMatchesDescription(newRule, row.description)) continue;
          if (row.categoryId === newCategoryId) continue;
          await upsertTransaction(user.uid, {
            ...row,
            categoryId: newCategoryId,
            countsTowardSpending: cat.countsTowardSpending,
            updatedAt: Date.now(),
          });
          n++;
        }
        if (n > 0) {
          toast.message(
            `Updated ${n} other transaction${n === 1 ? "" : "s"} to match`
          );
        }
      }

      toast.success(
        newRule
          ? "Categorized and rule saved under Settings → Rules."
          : "Category updated."
      );
      closeCategoryDialog();
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function bulkExclude() {
    if (!user || selected.size === 0) return;
    for (const id of selected) {
      const t = transactions?.find((x) => x.id === id);
      if (t)
        await upsertTransaction(user.uid, {
          ...t,
          countsTowardSpending: false,
          exclusionReason: "user_excluded",
          updatedAt: Date.now(),
        });
    }
    setSelected(new Set());
    toast.success("Updated selected rows");
  }

  async function removeRow(id: string) {
    if (!user) return;
    await deleteTransaction(user.uid, id);
    if (detailTx?.id === id) closeTransactionDetail();
    toast.success("Deleted");
  }

  function openTransactionDetail(t: Transaction) {
    setDetailTx(t);
    setNoteDraft(t.notes ?? "");
  }

  function closeTransactionDetail() {
    setDetailTx(null);
    setNoteDraft("");
  }

  async function saveTransactionNotes() {
    if (!user || !detailTx) return;
    const latest = transactions?.find((x) => x.id === detailTx.id) ?? detailTx;
    const trimmed = noteDraft.trim();
    setNoteSaving(true);
    try {
      await upsertTransaction(user.uid, {
        ...latest,
        notes: trimmed || undefined,
        updatedAt: Date.now(),
      });
      toast.success("Saved");
      closeTransactionDetail();
    } finally {
      setNoteSaving(false);
    }
  }

  const hasColumnFilters =
    filterCategoryId !== "all" ||
    Boolean(filterDateFrom) ||
    Boolean(filterDateTo) ||
    filterAmountMin.trim() !== "" ||
    filterAmountMax.trim() !== "";

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="text-muted-foreground text-sm">
            Search and filter. Click a description to add notes. Click column
            headers to sort. After you pick a category, use Add rule (shown
            briefly) to create an import rule; exclude still opens its dialog
            from the row actions.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-2">
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />
          <Select
            value={filterSpend}
            onValueChange={(v) => setFilterSpend(v as typeof filterSpend)}
          >
            <SelectTrigger className="w-full min-w-[10rem] sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spending">Spending only</SelectItem>
              <SelectItem value="excluded">Excluded only</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <Button variant="secondary" onClick={bulkExclude}>
              Exclude {selected.size} from spending
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label
            htmlFor="tx-filter-category"
            className="text-muted-foreground text-xs"
          >
            Category
          </Label>
          <Select
            value={filterCategoryId}
            onValueChange={(v) => v && setFilterCategoryId(v)}
          >
            <SelectTrigger
              id="tx-filter-category"
              className="w-full min-w-0 sm:w-[220px]"
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="none">Uncategorized</SelectItem>
              {categories
                ?.filter((c) => c.id !== UNCATEGORIZED_ID)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="tx-filter-date-from"
            className="text-muted-foreground text-xs"
          >
            From date
          </Label>
          <Input
            id="tx-filter-date-from"
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-[11rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="tx-filter-date-to"
            className="text-muted-foreground text-xs"
          >
            To date
          </Label>
          <Input
            id="tx-filter-date-to"
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-[11rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="tx-filter-amt-min"
            className="text-muted-foreground text-xs"
          >
            Min amount
          </Label>
          <Input
            id="tx-filter-amt-min"
            type="number"
            inputMode="decimal"
            placeholder="Any"
            value={filterAmountMin}
            onChange={(e) => setFilterAmountMin(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="tx-filter-amt-max"
            className="text-muted-foreground text-xs"
          >
            Max amount
          </Label>
          <Input
            id="tx-filter-amt-max"
            type="number"
            inputMode="decimal"
            placeholder="Any"
            value={filterAmountMax}
            onChange={(e) => setFilterAmountMax(e.target.value)}
            className="w-28"
          />
        </div>
        {hasColumnFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setFilterCategoryId("all");
              setFilterDateFrom("");
              setFilterDateTo("");
              setFilterAmountMin("");
              setFilterAmountMax("");
            }}
          >
            Clear column filters
          </Button>
        )}
      </div>

      <div className="rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            No transactions match. Import a CSV or change filters.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border md:hidden">
              {filtered.map((t) => (
                <div key={t.id} className="space-y-3 p-3 sm:p-4">
                  <div className="flex gap-3">
                    <Checkbox
                      className="mt-1 shrink-0"
                      checked={selected.has(t.id)}
                      onCheckedChange={(c) => {
                        const n = new Set(selected);
                        if (c) n.add(t.id);
                        else n.delete(t.id);
                        setSelected(n);
                      }}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {t.date}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          ${t.amount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="View details and notes"
                        className="w-full rounded-md px-1 py-1 text-left text-sm leading-snug hover:bg-muted/60"
                        onClick={() => openTransactionDetail(t)}
                      >
                        <span className="inline-flex items-start gap-1.5 break-words [word-break:break-word]">
                          {t.notes?.trim() ? (
                            <StickyNote
                              className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                              aria-hidden
                            />
                          ) : null}
                          <span>{t.description}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      value={
                        !t.categoryId || t.categoryId === UNCATEGORIZED_ID
                          ? "none"
                          : t.categoryId
                      }
                      onValueChange={(v) => void onCategorySelect(t, v ?? "none")}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 sm:max-w-xs">
                        <SelectValue placeholder="Category">
                          {(value: string | null) => {
                            if (value === "none" || value == null) {
                              return "Uncategorized";
                            }
                            if (!categories) {
                              return "…";
                            }
                            return (
                              catMap.get(value)?.name ?? "Unknown category"
                            );
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorized</SelectItem>
                        {categories
                          ?.filter((c) => c.id !== UNCATEGORIZED_ID)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="flex h-9 shrink-0 items-center justify-start sm:w-[4.5rem] sm:justify-end">
                      {categoryRuleHint?.txId === t.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 max-w-none shrink-0 px-2 text-xs whitespace-nowrap"
                          onClick={() => handleAddRuleClick(t.id)}
                        >
                          Add rule
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="touch-manipulation"
                      title={
                        t.countsTowardSpending ? "Exclude" : "Include"
                      }
                      aria-label={
                        t.countsTowardSpending
                          ? "Exclude from spending"
                          : "Include in spending"
                      }
                      onClick={() =>
                        t.countsTowardSpending
                          ? openExcludeDialog(t)
                          : toggleExclude(t, t.countsTowardSpending)
                      }
                    >
                      {t.countsTowardSpending ? (
                        <XCircle className="size-4" />
                      ) : (
                        <CheckCircle className="size-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="touch-manipulation text-destructive"
                      title="Delete"
                      aria-label="Delete transaction"
                      onClick={() => removeRow(t.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table className="w-full min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filtered.length > 0 &&
                          selected.size === filtered.length
                        }
                        onCheckedChange={(c) => {
                          if (c)
                            setSelected(new Set(filtered.map((x) => x.id)));
                          else setSelected(new Set());
                        }}
                      />
                    </TableHead>
                    <SortableHead
                      label="Date"
                      columnKey="date"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSortClick}
                      className="w-[10ch] max-w-[10ch] whitespace-nowrap"
                    />
                    <SortableHead
                      label="Description"
                      columnKey="description"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSortClick}
                      className="min-w-[220px]"
                    />
                    <SortableHead
                      label="Category"
                      columnKey="category"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSortClick}
                      className="w-[14rem] max-w-[14rem]"
                    />
                    <SortableHead
                      label="Amount"
                      columnKey="amount"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSortClick}
                      align="end"
                      className="w-24 whitespace-nowrap"
                    />
                    <TableHead className="w-[140px] text-muted-foreground">
                      <span className="text-xs font-medium">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(t.id)}
                          onCheckedChange={(c) => {
                            const n = new Set(selected);
                            if (c) n.add(t.id);
                            else n.delete(t.id);
                            setSelected(n);
                          }}
                        />
                      </TableCell>
                      <TableCell className="w-[10ch] max-w-[10ch] whitespace-nowrap text-sm tabular-nums">
                        {t.date}
                      </TableCell>
                      <TableCell className="min-w-[220px] max-w-md whitespace-normal p-2 align-top">
                        <button
                          type="button"
                          title="View details and notes"
                          className="flex min-w-0 max-w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted/60"
                          onClick={() => openTransactionDetail(t)}
                        >
                          {t.notes?.trim() ? (
                            <StickyNote
                              className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                              aria-hidden
                            />
                          ) : null}
                          <span className="min-w-0 break-words [word-break:break-word]">
                            {t.description}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="w-[14rem] max-w-[14rem] align-middle">
                        <div className="inline-flex max-w-full flex-nowrap items-center gap-2">
                          <Select
                            value={
                              !t.categoryId || t.categoryId === UNCATEGORIZED_ID
                                ? "none"
                                : t.categoryId
                            }
                            onValueChange={(v) =>
                              void onCategorySelect(t, v ?? "none")
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] shrink-0">
                              <SelectValue placeholder="Category">
                                {(value: string | null) => {
                                  if (value === "none" || value == null) {
                                    return "Uncategorized";
                                  }
                                  if (!categories) {
                                    return "…";
                                  }
                                  return (
                                    catMap.get(value)?.name ?? "Unknown category"
                                  );
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Uncategorized</SelectItem>
                              {categories
                                ?.filter((c) => c.id !== UNCATEGORIZED_ID)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <div className="flex h-8 w-[4.5rem] shrink-0 items-center justify-end">
                            {categoryRuleHint?.txId === t.id ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 max-w-none shrink-0 px-2 text-xs whitespace-nowrap"
                                onClick={() => handleAddRuleClick(t.id)}
                              >
                                Add rule
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${t.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={
                            t.countsTowardSpending ? "Exclude" : "Include"
                          }
                          aria-label={
                            t.countsTowardSpending
                              ? "Exclude from spending"
                              : "Include in spending"
                          }
                          onClick={() =>
                            t.countsTowardSpending
                              ? openExcludeDialog(t)
                              : toggleExclude(t, t.countsTowardSpending)
                          }
                        >
                          {t.countsTowardSpending ? (
                            <XCircle className="size-4" />
                          ) : (
                            <CheckCircle className="size-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title="Delete"
                          aria-label="Delete transaction"
                          onClick={() => removeRow(t.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={excludeDialogOpen}
        onOpenChange={(open) => {
          setExcludeDialogOpen(open);
          if (!open) setPendingExclude(null);
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl"
          showCloseButton={!excludeSubmitting}
        >
          <DialogHeader>
            <DialogTitle>Exclude from spending</DialogTitle>
            <DialogDescription className="sr-only">
              Choose whether to create an import rule from this transaction
              description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">Description</p>
            <div className="max-h-60 min-h-12 w-full overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-left font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
              {pendingExclude?.description ?? ""}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-muted-foreground text-xs leading-snug">
              Specific rules first: in Settings → Rules, put a longer match (e.g.{" "}
              <span className="font-medium text-foreground">Kroger Fuel</span>)
              above a shorter one (
              <span className="font-medium text-foreground">Kroger</span>), or use
              Starts with / Regex so they don’t overlap.
            </p>
            <div className="space-y-2">
              <Label htmlFor="exclude-rule-mode">Future imports</Label>
              <Select
                value={excludeRuleMode}
                onValueChange={(v) => setExcludeRuleMode(v as RuleMode)}
              >
                <SelectTrigger
                  id="exclude-rule-mode"
                  className={ruleDialogSelectTriggerClass}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(24rem,var(--available-height))] w-[var(--anchor-width)] min-w-[min(100vw-2rem,36rem)]">
                  <SelectItem value="none">This transaction only</SelectItem>
                  <SelectItem value="exact">
                    Exact line only (whole description must match)
                  </SelectItem>
                  <SelectItem value="contains">
                    Contains this full text (substring)
                  </SelectItem>
                  <SelectItem value="starts_with">
                    Starts with this text (prefix — good for fuel vs grocery)
                  </SelectItem>
                  <SelectItem value="custom">Custom pattern…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {excludeRuleMode === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="custom-pattern">Pattern</Label>
                <Input
                  id="custom-pattern"
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  placeholder="Text to find, or a regex"
                />
                <Select
                  value={customMatchType}
                  onValueChange={(v) =>
                    setCustomMatchType(v as RuleMatchChoice)
                  }
                >
                  <SelectTrigger className={ruleDialogSelectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--anchor-width)] min-w-[min(100vw-2rem,36rem)]">
                    <SelectItem value="contains">Contains (substring)</SelectItem>
                    <SelectItem value="starts_with">
                      Starts with (prefix must match)
                    </SelectItem>
                    <SelectItem value="regex">Regular expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Checkbox
                id="apply-existing"
                checked={applyRuleToExisting}
                disabled={excludeRuleMode === "none"}
                onCheckedChange={(c) =>
                  setApplyRuleToExisting(c === true)
                }
              />
              <Label
                htmlFor="apply-existing"
                className="text-muted-foreground cursor-pointer text-sm leading-snug font-normal"
              >
                Also exclude existing transactions that match this rule (not
                only new imports).
              </Label>
            </div>
          </div>

          <DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={excludeSubmitting}
              onClick={closeExcludeDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={excludeSubmitting}
              onClick={confirmExcludeFromDialog}
            >
              {excludeSubmitting ? "Saving…" : "Exclude"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) setPendingCategory(null);
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl"
          showCloseButton={!categorySubmitting}
        >
          <DialogHeader>
            <DialogTitle>Set category</DialogTitle>
            <DialogDescription className="sr-only">
              Choose category and optional import rule for this description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-foreground font-medium">
              {pendingCategory
                ? (catMap.get(pendingCategory.newCategoryId)?.name ??
                  "Category")
                : ""}
            </p>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Description</p>
              <div className="max-h-60 min-h-12 w-full overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-left font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                {pendingCategory?.tx.description ?? ""}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-muted-foreground text-xs leading-snug">
              Put a more specific rule (e.g.{" "}
              <span className="font-medium text-foreground">Kroger Fuel</span>)
              {" "}above a general{" "}
              <span className="font-medium text-foreground">Kroger</span> rule in
              Settings → Rules, or use Starts with / Regex.
            </p>
            <div className="space-y-2">
              <Label htmlFor="category-rule-mode">Future imports</Label>
              <Select
                value={categoryRuleMode}
                onValueChange={(v) => setCategoryRuleMode(v as RuleMode)}
              >
                <SelectTrigger
                  id="category-rule-mode"
                  className={ruleDialogSelectTriggerClass}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(24rem,var(--available-height))] w-[var(--anchor-width)] min-w-[min(100vw-2rem,36rem)]">
                  <SelectItem value="none">This transaction only</SelectItem>
                  <SelectItem value="exact">
                    Exact line only (whole description must match)
                  </SelectItem>
                  <SelectItem value="contains">
                    Contains this full text (substring)
                  </SelectItem>
                  <SelectItem value="starts_with">
                    Starts with this text (prefix — good for fuel vs grocery)
                  </SelectItem>
                  <SelectItem value="custom">Custom pattern…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {categoryRuleMode === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="category-custom-pattern">Pattern</Label>
                <Input
                  id="category-custom-pattern"
                  value={categoryCustomPattern}
                  onChange={(e) => setCategoryCustomPattern(e.target.value)}
                  placeholder="Text to find, or a regex"
                />
                <Select
                  value={categoryCustomMatchType}
                  onValueChange={(v) =>
                    setCategoryCustomMatchType(v as RuleMatchChoice)
                  }
                >
                  <SelectTrigger className={ruleDialogSelectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--anchor-width)] min-w-[min(100vw-2rem,36rem)]">
                    <SelectItem value="contains">Contains (substring)</SelectItem>
                    <SelectItem value="starts_with">
                      Starts with (prefix must match)
                    </SelectItem>
                    <SelectItem value="regex">Regular expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Checkbox
                id="category-apply-existing"
                checked={categoryApplyExisting}
                disabled={categoryRuleMode === "none"}
                onCheckedChange={(c) =>
                  setCategoryApplyExisting(c === true)
                }
              />
              <Label
                htmlFor="category-apply-existing"
                className="text-muted-foreground cursor-pointer text-sm leading-snug font-normal"
              >
                Also set category on existing transactions that match this rule.
              </Label>
            </div>
          </div>

          <DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={categorySubmitting}
              onClick={closeCategoryDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={categorySubmitting}
              onClick={confirmCategoryFromDialog}
            >
              {categorySubmitting ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailTx !== null}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-lg"
          showCloseButton={!noteSaving}
        >
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>
              Notes are saved with this transaction and sync to your devices.
            </DialogDescription>
          </DialogHeader>
          {detailTx && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Date</p>
                  <p className="tabular-nums">{detailTx.date}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Amount</p>
                  <p className="tabular-nums">${detailTx.amount.toFixed(2)}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-mono text-[13px] leading-relaxed break-words">
                  {detailTx.description}
                </p>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Category</p>
                  <p>{categoryLabel(detailTx, catMap)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Account</p>
                  <p className="truncate">{detailTx.account || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">
                    Counts toward spending
                  </p>
                  <p>
                    {detailTx.countsTowardSpending
                      ? "Yes"
                      : "No — excluded"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-notes">Notes</Label>
                <Textarea
                  id="tx-notes"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note…"
                  rows={4}
                  disabled={noteSaving}
                  className="min-h-[100px] resize-y"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={noteSaving}
              onClick={closeTransactionDetail}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={noteSaving}
              onClick={() => void saveTransactionNotes()}
            >
              {noteSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Transactions</h1>
            <p className="text-muted-foreground text-sm">Loading…</p>
          </div>
        </div>
      }
    >
      <TransactionsPageContent />
    </Suspense>
  );
}
