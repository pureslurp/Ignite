"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTransactions, useCategories } from "@/hooks/use-live-data";
import { format, parseISO } from "date-fns";
import type { Transaction } from "@/types";
import { UNCATEGORIZED_ID } from "@/lib/constants";
import { spendingAmountForTransaction } from "@/lib/spending-amount";
import { cn } from "@/lib/utils";

function spendingTransactions(tx: Transaction[] | undefined) {
  return tx?.filter((t) => t.countsTowardSpending) ?? [];
}

function sumByCategory(rows: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of rows) {
    const k = t.categoryId ?? "none";
    m.set(k, (m.get(k) ?? 0) + spendingAmountForTransaction(t));
  }
  return m;
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** YoY spending change: lower spend than prior year → green; higher → red. */
function pctChangeClass(pct: number) {
  if (pct > 0) return "text-red-600 dark:text-red-400";
  if (pct < 0) return "text-green-600 dark:text-green-400";
  return "text-muted-foreground";
}

function CategoryColorSwatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-sm border border-border/90 shadow-sm dark:border-border/50",
        className
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

const CATEGORY_TABLE_TOP_N = 10;

export default function DashboardPage() {
  const router = useRouter();
  const transactions = useTransactions();
  const categories = useCategories();

  const catMap = useMemo(
    () => new Map(categories?.map((c) => [c.id, c.name]) ?? []),
    [categories]
  );

  /** Rollup key "none" = uncategorized; match seeded category color when present. */
  const categoryColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) {
      m.set(c.id, c.color);
    }
    const unc = categories?.find((c) => c.id === UNCATEGORIZED_ID);
    m.set("none", unc?.color ?? "#94a3b8");
    return m;
  }, [categories]);

  const spending = useMemo(
    () => spendingTransactions(transactions),
    [transactions]
  );

  const calendarYear = new Date().getFullYear();

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const t of spending) {
      const y = Number(t.date.slice(0, 4));
      if (!Number.isNaN(y)) s.add(y);
    }
    const list = [...s].sort((a, b) => b - a);
    return list.length ? list : [calendarYear];
  }, [spending, calendarYear]);

  const [selectedYear, setSelectedYear] = useState(calendarYear);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(
        availableYears.includes(calendarYear)
          ? calendarYear
          : availableYears[0]!
      );
    }
  }, [availableYears, selectedYear, calendarYear]);

  const spendingInYear = useMemo(
    () => spending.filter((t) => t.date.startsWith(`${selectedYear}-`)),
    [spending, selectedYear]
  );

  const byCategoryYear = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of spendingInYear) {
      const k = t.categoryId ?? "none";
      m[k] = (m[k] ?? 0) + spendingAmountForTransaction(t);
    }
    return m;
  }, [spendingInYear]);

  const yearTotal = useMemo(
    () =>
      spendingInYear.reduce((s, t) => s + spendingAmountForTransaction(t), 0),
    [spendingInYear]
  );

  /**
   * Calendar-completed months in the selected year (full months before the current month
   * when viewing this year; all 12 months when viewing a past year). Used to annualize spend.
   */
  const { completedMonthCount, completedMonthsSpend, completedMonthRangeLabel } =
    useMemo(() => {
      const now = new Date();
      const y = now.getFullYear();
      const month = now.getMonth() + 1;
      let keys: string[] = [];
      if (selectedYear < y) {
        keys = Array.from({ length: 12 }, (_, i) =>
          `${selectedYear}-${String(i + 1).padStart(2, "0")}`
        );
      } else if (selectedYear === y) {
        const n = month - 1;
        if (n > 0) {
          keys = Array.from({ length: n }, (_, i) =>
            `${selectedYear}-${String(i + 1).padStart(2, "0")}`
          );
        }
      }
      const set = new Set(keys);
      const sum = spendingInYear
        .filter((t) => set.has(t.date.slice(0, 7)))
        .reduce((s, t) => s + spendingAmountForTransaction(t), 0);
      let rangeLabel = "";
      if (keys.length === 1) {
        rangeLabel = format(parseISO(`${keys[0]}-01`), "MMM yyyy");
      } else if (keys.length > 1) {
        const a = format(parseISO(`${keys[0]}-01`), "MMM");
        const b = format(parseISO(`${keys[keys.length - 1]}-01`), "MMM yyyy");
        rangeLabel = `${a}–${b}`;
      }
      return {
        completedMonthCount: keys.length,
        completedMonthsSpend: sum,
        completedMonthRangeLabel: rangeLabel,
      };
    }, [selectedYear, spendingInYear]);

  const extrapolatedAnnualSpend =
    completedMonthCount > 0
      ? Math.round(
          (completedMonthsSpend / completedMonthCount) * 12 * 100
        ) / 100
      : null;

  /** Distinct calendar months in the selected year with spending */
  const distinctMonthsInYear = useMemo(() => {
    const s = new Set(spendingInYear.map((t) => t.date.slice(0, 7)));
    return [...s].sort();
  }, [spendingInYear]);

  const monthCountForAvg = Math.max(1, distinctMonthsInYear.length);

  const prevCalendarYear = selectedYear - 1;

  const spendingInPrevYear = useMemo(
    () => spending.filter((t) => t.date.startsWith(`${prevCalendarYear}-`)),
    [spending, prevCalendarYear]
  );

  const byCategoryPrevYear = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of spendingInPrevYear) {
      const k = t.categoryId ?? "none";
      m[k] = (m[k] ?? 0) + spendingAmountForTransaction(t);
    }
    return m;
  }, [spendingInPrevYear]);

  const distinctMonthsInPrevYear = useMemo(() => {
    const s = new Set(spendingInPrevYear.map((t) => t.date.slice(0, 7)));
    return [...s].sort();
  }, [spendingInPrevYear]);

  const prevYearMonthlyBaselineAvailable = distinctMonthsInPrevYear.length > 0;
  const monthCountForAvgPrevYear = Math.max(
    1,
    distinctMonthsInPrevYear.length
  );

  /** Same month number as today, in the selected year (for “this month” column). */
  const comparisonMonthStr = useMemo(() => {
    const m = new Date().getMonth() + 1;
    return `${selectedYear}-${String(m).padStart(2, "0")}`;
  }, [selectedYear]);

  const isViewingCurrentCalendarYear = selectedYear === calendarYear;

  /** Spending per category in the comparison month within the year (may be $0). */
  const spendingInComparisonMonth = useMemo(() => {
    const inMonth = spendingInYear.filter((t) =>
      t.date.startsWith(comparisonMonthStr)
    );
    return sumByCategory(inMonth);
  }, [spendingInYear, comparisonMonthStr]);

  const categoryRows = useMemo(() => {
    const entries = Object.entries(byCategoryYear).filter(([, v]) => v > 0);
    return entries
      .map(([id, value]) => {
        const total = Math.round(value * 100) / 100;
        const thisMo = spendingInComparisonMonth.get(id) ?? 0;
        const avgMonthly = total / monthCountForAvg;
        const totalPrev = byCategoryPrevYear[id] ?? 0;
        const prevYearAvgMonthly = prevYearMonthlyBaselineAvailable
          ? Math.round(
              (totalPrev / monthCountForAvgPrevYear) * 100
            ) / 100
          : null;
        let pctVsPrevYear: number | null = null;
        if (
          prevYearAvgMonthly != null &&
          prevYearAvgMonthly > 0 &&
          avgMonthly >= 0
        ) {
          pctVsPrevYear =
            Math.round(
              ((avgMonthly - prevYearAvgMonthly) / prevYearAvgMonthly) *
                10000
            ) / 100;
        }
        return {
          id,
          name: catMap.get(id) ?? (id === "none" ? "Uncategorized" : id),
          total,
          thisMonth: Math.round(thisMo * 100) / 100,
          avgMonthly,
          prevYearAvgMonthly,
          pctVsPrevYear,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [
    byCategoryYear,
    byCategoryPrevYear,
    catMap,
    monthCountForAvg,
    monthCountForAvgPrevYear,
    prevYearMonthlyBaselineAvailable,
    spendingInComparisonMonth,
  ]);

  const categoryColumnTotals = useMemo(() => {
    let thisMonth = 0;
    let allTime = 0;
    let avgSum = 0;
    let prevYearAvgSum = 0;
    for (const r of categoryRows) {
      thisMonth += r.thisMonth;
      allTime += r.total;
      avgSum += r.avgMonthly;
      if (r.prevYearAvgMonthly != null) {
        prevYearAvgSum += r.prevYearAvgMonthly;
      }
    }
    let pctVsPrevYearTotal: number | null = null;
    if (
      prevYearMonthlyBaselineAvailable &&
      prevYearAvgSum > 0 &&
      avgSum >= 0
    ) {
      pctVsPrevYearTotal =
        Math.round(
          ((avgSum - prevYearAvgSum) / prevYearAvgSum) * 10000
        ) / 100;
    }
    return {
      thisMonth: Math.round(thisMonth * 100) / 100,
      allTime: Math.round(allTime * 100) / 100,
      avgSum: Math.round(avgSum * 100) / 100,
      prevYearAvgSum: prevYearMonthlyBaselineAvailable
        ? Math.round(prevYearAvgSum * 100) / 100
        : null,
      pctVsPrevYearTotal,
    };
  }, [categoryRows, prevYearMonthlyBaselineAvailable]);

  const monthOptionsInYear = useMemo(() => {
    const s = new Set(spendingInYear.map((t) => t.date.slice(0, 7)));
    return [...s].sort().reverse();
  }, [spendingInYear]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [categoryTableExpanded, setCategoryTableExpanded] = useState(false);
  const [compareAvgToPrevYear, setCompareAvgToPrevYear] = useState(false);

  useEffect(() => {
    if (!monthOptionsInYear.length) {
      setSelectedMonth(`${selectedYear}-01`);
      return;
    }
    setSelectedMonth((prev) => {
      if (prev && monthOptionsInYear.includes(prev)) return prev;
      const cur = format(new Date(), "yyyy-MM");
      if (
        selectedYear === calendarYear &&
        monthOptionsInYear.includes(cur)
      ) {
        return cur;
      }
      return monthOptionsInYear[0]!;
    });
  }, [monthOptionsInYear, selectedYear, calendarYear]);

  /** Per-category totals in the selected year (typical monthly baseline) */
  const categoryTotalMap = useMemo(
    () => sumByCategory(spendingInYear),
    [spendingInYear]
  );

  const monthDetailRows = useMemo(() => {
    if (!selectedMonth || !spending.length) return [];
    const inMonth = spending.filter((t) => t.date.startsWith(selectedMonth));
    const byMonthCat = sumByCategory(inMonth);
    const rows = [...byMonthCat.entries()]
      .filter(([, amt]) => amt > 0)
      .map(([id, monthSpend]) => {
        const totalCat = categoryTotalMap.get(id) ?? monthSpend;
        const typical =
          monthCountForAvg > 0 ? totalCat / monthCountForAvg : monthSpend;
        const ratio = typical > 0 ? monthSpend / typical : 1;
        let flag: "typical" | "above" | "outlier" = "typical";
        if (ratio >= 2) flag = "outlier";
        else if (ratio >= 1.4) flag = "above";
        return {
          id,
          name: catMap.get(id) ?? (id === "none" ? "Uncategorized" : id),
          monthSpend: Math.round(monthSpend * 100) / 100,
          typical: Math.round(typical * 100) / 100,
          ratio,
          flag,
        };
      })
      .sort((a, b) => b.monthSpend - a.monthSpend);
    return rows;
  }, [
    selectedMonth,
    spending,
    categoryTotalMap,
    monthCountForAvg,
    catMap,
  ]);

  const monthDetailTotals = useMemo(() => {
    let monthSpend = 0;
    let typical = 0;
    for (const r of monthDetailRows) {
      monthSpend += r.monthSpend;
      typical += r.typical;
    }
    monthSpend = Math.round(monthSpend * 100) / 100;
    typical = Math.round(typical * 100) / 100;
    const ratio = typical > 0 ? monthSpend / typical : 1;
    let flag: "typical" | "above" | "outlier" = "typical";
    if (ratio >= 2) flag = "outlier";
    else if (ratio >= 1.4) flag = "above";
    return { monthSpend, typical, ratio, flag };
  }, [monthDetailRows]);

  /** Comparison month total for the selected year */
  const comparisonMonthSpend = useMemo(() => {
    return spendingInYear
      .filter((t) => t.date.startsWith(comparisonMonthStr))
      .reduce((s, t) => s + spendingAmountForTransaction(t), 0);
  }, [spendingInYear, comparisonMonthStr]);

  const displayedCategoryRows =
    categoryTableExpanded || categoryRows.length <= CATEGORY_TABLE_TOP_N
      ? categoryRows
      : categoryRows.slice(0, CATEGORY_TABLE_TOP_N);

  const comparisonMonthLabel = isViewingCurrentCalendarYear
    ? "This month (spending)"
    : `${comparisonMonthStr} (spending)`;

  const showCompareInAvgColumn =
    compareAvgToPrevYear && prevYearMonthlyBaselineAvailable;

  const avgMonthColClass =
    "text-right whitespace-nowrap align-middle tabular-nums text-muted-foreground";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Spending for the selected year — investment and excluded rows are
            omitted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            Year
          </span>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => v && setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {comparisonMonthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              $
              {comparisonMonthSpend.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Year total ({selectedYear})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-3xl font-semibold tabular-nums">
              ${yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            {extrapolatedAnnualSpend != null && completedMonthCount > 0 && (
              <p className="text-muted-foreground text-sm leading-snug">
                Extrapolated annual: {fmtUsd(extrapolatedAnnualSpend)}
                <span className="block text-xs mt-0.5">
                  From {completedMonthCount} completed month
                  {completedMonthCount === 1 ? "" : "s"}
                  {completedMonthRangeLabel
                    ? ` (${completedMonthRangeLabel})`
                    : ""}
                  .
                </span>
              </p>
            )}
            {extrapolatedAnnualSpend == null && isViewingCurrentCalendarYear && (
              <p className="text-muted-foreground text-xs leading-snug">
                Extrapolated annual appears after at least one full month of the
                year has ended.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Months with data ({selectedYear})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {distinctMonthsInYear.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>
              {comparisonMonthStr} spend, {selectedYear} category totals, and
              average per month (year total ÷{" "}
              {distinctMonthsInYear.length || 1} month
              {distinctMonthsInYear.length === 1 ? "" : "s"} with spending in{" "}
              {selectedYear}).
              {prevYearMonthlyBaselineAvailable ? (
                <>
                  {" "}
                  Turn on <span className="font-medium">Compare</span> to show{" "}
                  {prevCalendarYear} monthly average and percent change (lower is
                  green, higher is red).
                </>
              ) : null}{" "}
              {categoryRows.length > CATEGORY_TABLE_TOP_N && !categoryTableExpanded && (
                <>
                  {" "}
                  Showing top {CATEGORY_TABLE_TOP_N} of {categoryRows.length}{" "}
                  categories.
                </>
              )}
            </CardDescription>
          </div>
          {(prevYearMonthlyBaselineAvailable ||
            categoryRows.length > CATEGORY_TABLE_TOP_N) && (
            <div className="flex flex-wrap items-center gap-2 self-start">
              {prevYearMonthlyBaselineAvailable && (
                <Button
                  type="button"
                  variant={compareAvgToPrevYear ? "secondary" : "outline"}
                  size="sm"
                  className="shrink-0"
                  aria-pressed={compareAvgToPrevYear}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCompareAvgToPrevYear((v) => !v);
                  }}
                >
                  Compare
                </Button>
              )}
              {categoryRows.length > CATEGORY_TABLE_TOP_N && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryTableExpanded((exp) => !exp);
                  }}
                >
                  {categoryTableExpanded
                    ? `Show top ${CATEGORY_TABLE_TOP_N}`
                    : "Expand all"}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {categoryRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Import transactions to see category totals.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="table-fixed">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0">Category</TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      {isViewingCurrentCalendarYear
                        ? `${comparisonMonthStr} (now)`
                        : comparisonMonthStr}
                    </TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right whitespace-nowrap align-middle">
                      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span>Avg / month</span>
                        {showCompareInAvgColumn && (
                          <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                            vs {prevCalendarYear}
                          </span>
                        )}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCategoryRows.map((r) => (
                    <TableRow
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label={`View transactions in ${r.name}`}
                      onClick={() =>
                        router.push(
                          `/transactions?category=${encodeURIComponent(r.id)}`
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(
                            `/transactions?category=${encodeURIComponent(r.id)}`
                          );
                        }
                      }}
                    >
                      <TableCell className="min-w-0 font-medium">
                        <span className="flex min-w-0 items-center gap-2">
                          <CategoryColorSwatch
                            className="shrink-0"
                            color={
                              categoryColorById.get(r.id) ?? "#cbd5e1"
                            }
                          />
                          <span className="min-w-0 truncate">{r.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.thisMonth)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.total)}
                      </TableCell>
                      <TableCell className={avgMonthColClass}>
                        <div className="inline-flex max-w-full flex-col items-end gap-0.5 sm:flex-row sm:flex-nowrap sm:items-baseline sm:gap-x-3 sm:gap-y-0">
                          <span className="shrink-0 tabular-nums text-foreground">
                            {fmtUsd(r.avgMonthly)}
                          </span>
                          {compareAvgToPrevYear && r.prevYearAvgMonthly != null && (
                            <span className="text-xs text-muted-foreground">
                              {fmtUsd(r.prevYearAvgMonthly)} in {prevCalendarYear}
                              {r.pctVsPrevYear != null && (
                                <span
                                  className={cn(
                                    "font-medium",
                                    pctChangeClass(r.pctVsPrevYear)
                                  )}
                                >
                                  {" "}
                                  (
                                  {r.pctVsPrevYear > 0 ? "+" : ""}
                                  {r.pctVsPrevYear.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="min-w-0 font-medium">Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(categoryColumnTotals.thisMonth)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(categoryColumnTotals.allTime)}
                    </TableCell>
                    <TableCell className={avgMonthColClass}>
                      <div className="inline-flex max-w-full flex-col items-end gap-0.5 sm:flex-row sm:flex-nowrap sm:items-baseline sm:gap-x-3 sm:gap-y-0">
                        <span className="shrink-0 tabular-nums text-foreground">
                          {fmtUsd(categoryColumnTotals.avgSum)}
                        </span>
                        {compareAvgToPrevYear &&
                          categoryColumnTotals.prevYearAvgSum != null && (
                            <span className="text-xs text-muted-foreground">
                              {fmtUsd(categoryColumnTotals.prevYearAvgSum)} in{" "}
                              {prevCalendarYear}
                              {categoryColumnTotals.pctVsPrevYearTotal !=
                                null && (
                                <span
                                  className={cn(
                                    "font-medium",
                                    pctChangeClass(
                                      categoryColumnTotals.pctVsPrevYearTotal
                                    )
                                  )}
                                >
                                  {" "}
                                  (
                                  {categoryColumnTotals.pctVsPrevYearTotal > 0
                                    ? "+"
                                    : ""}
                                  {categoryColumnTotals.pctVsPrevYearTotal.toFixed(
                                    0
                                  )}
                                  %)
                                </span>
                              )}
                            </span>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Month detail</CardTitle>
            <CardDescription>
              Spending in one calendar month of {selectedYear} vs your typical
              monthly average for that category (year total in {selectedYear} ÷
              months with data in {selectedYear}). Highlights when this month is
              much higher than usual.
            </CardDescription>
          </div>
          {monthOptionsInYear.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm whitespace-nowrap">
                Month
              </span>
              <Select
                value={selectedMonth}
                onValueChange={(v) => v && setSelectedMonth(v)}
              >
                <SelectTrigger className="w-[11rem]">
                  <SelectValue placeholder="Pick month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptionsInYear.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!monthOptionsInYear.length ? (
            <p className="text-muted-foreground text-sm">
              No spending data in {selectedYear}.
            </p>
          ) : monthDetailRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No spending in {selectedMonth}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">{selectedMonth}</TableHead>
                    <TableHead className="text-right">Typical / mo</TableHead>
                    <TableHead className="text-right">vs typical</TableHead>
                    <TableHead className="w-[100px]"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDetailRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <CategoryColorSwatch
                            color={
                              categoryColorById.get(r.id) ?? "#cbd5e1"
                            }
                          />
                          {r.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.monthSpend)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtUsd(r.typical)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(r.ratio * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell>
                        {r.flag === "outlier" && (
                          <Badge variant="destructive">High</Badge>
                        )}
                        {r.flag === "above" && (
                          <Badge variant="secondary">Above avg</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(monthDetailTotals.monthSpend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtUsd(monthDetailTotals.typical)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(monthDetailTotals.ratio * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell>
                      {monthDetailTotals.flag === "outlier" && (
                        <Badge variant="destructive">High</Badge>
                      )}
                      {monthDetailTotals.flag === "above" && (
                        <Badge variant="secondary">Above avg</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
