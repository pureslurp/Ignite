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

function spendingTransactions(tx: Transaction[] | undefined) {
  return tx?.filter((t) => t.countsTowardSpending) ?? [];
}

function sumByCategory(rows: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of rows) {
    const k = t.categoryId ?? "none";
    m.set(k, (m.get(k) ?? 0) + t.amount);
  }
  return m;
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
      m[k] = (m[k] ?? 0) + t.amount;
    }
    return m;
  }, [spendingInYear]);

  const yearTotal = useMemo(
    () => spendingInYear.reduce((s, t) => s + t.amount, 0),
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
        .reduce((s, t) => s + t.amount, 0);
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
        return {
          id,
          name: catMap.get(id) ?? (id === "none" ? "Uncategorized" : id),
          total,
          thisMonth: Math.round(thisMo * 100) / 100,
          avgMonthly: total / monthCountForAvg,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [
    byCategoryYear,
    catMap,
    monthCountForAvg,
    spendingInComparisonMonth,
  ]);

  const categoryColumnTotals = useMemo(() => {
    let thisMonth = 0;
    let allTime = 0;
    let avgSum = 0;
    for (const r of categoryRows) {
      thisMonth += r.thisMonth;
      allTime += r.total;
      avgSum += r.avgMonthly;
    }
    return {
      thisMonth: Math.round(thisMonth * 100) / 100,
      allTime: Math.round(allTime * 100) / 100,
      avgSum: Math.round(avgSum * 100) / 100,
    };
  }, [categoryRows]);

  const monthOptionsInYear = useMemo(() => {
    const s = new Set(spendingInYear.map((t) => t.date.slice(0, 7)));
    return [...s].sort().reverse();
  }, [spendingInYear]);

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [categoryTableExpanded, setCategoryTableExpanded] = useState(false);

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
      .reduce((s, t) => s + t.amount, 0);
  }, [spendingInYear, comparisonMonthStr]);

  const displayedCategoryRows =
    categoryTableExpanded || categoryRows.length <= CATEGORY_TABLE_TOP_N
      ? categoryRows
      : categoryRows.slice(0, CATEGORY_TABLE_TOP_N);

  const comparisonMonthLabel = isViewingCurrentCalendarYear
    ? "This month (spending)"
    : `${comparisonMonthStr} (spending)`;

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
              {categoryRows.length > CATEGORY_TABLE_TOP_N && !categoryTableExpanded && (
                <>
                  {" "}
                  Showing top {CATEGORY_TABLE_TOP_N} of {categoryRows.length}{" "}
                  categories.
                </>
              )}
            </CardDescription>
          </div>
          {categoryRows.length > CATEGORY_TABLE_TOP_N && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 self-start"
              onClick={() => setCategoryTableExpanded((e) => !e)}
            >
              {categoryTableExpanded
                ? `Show top ${CATEGORY_TABLE_TOP_N}`
                : "Expand all"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {categoryRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Import transactions to see category totals.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      {isViewingCurrentCalendarYear
                        ? `${comparisonMonthStr} (now)`
                        : comparisonMonthStr}
                    </TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Avg / month</TableHead>
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
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.thisMonth)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(r.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtUsd(r.avgMonthly)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(categoryColumnTotals.thisMonth)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtUsd(categoryColumnTotals.allTime)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtUsd(categoryColumnTotals.avgSum)}
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
                      <TableCell className="font-medium">{r.name}</TableCell>
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
