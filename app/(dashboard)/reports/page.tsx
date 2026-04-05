"use client";

import { useMemo } from "react";
import { format, subMonths } from "date-fns";
import { useTransactions, useCategories, useSpendingTotals } from "@/hooks/use-live-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  const transactions = useTransactions();
  const categories = useCategories();
  const { byCategory, total } = useSpendingTotals(transactions);

  const catMap = useMemo(
    () => new Map(categories?.map((c) => [c.id, c.name]) ?? []),
    [categories]
  );

  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    if (!transactions) return m;
    for (const t of transactions) {
      if (!t.countsTowardSpending) continue;
      const mo = t.date.slice(0, 7);
      m[mo] = (m[mo] ?? 0) + t.amount;
    }
    return m;
  }, [transactions]);

  const months = [0, 1, 2, 3, 4, 5].map((i) =>
    format(subMonths(new Date(), i), "yyyy-MM")
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Spending-only rollups (investment rows excluded).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Spending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((mo) => (
                <TableRow key={mo}>
                  <TableCell>{mo}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${(byMonth[mo] ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All-time by category</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byCategory).map(([id, v]) => (
                <TableRow key={id}>
                  <TableCell>
                    {catMap.get(id) ?? (id === "none" ? "Uncategorized" : id)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${v.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-4 text-sm">
            All-time spending total:{" "}
            <span className="font-medium text-foreground">
              ${total.toFixed(2)}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
