"use client";

import { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { useAuth } from "@/components/providers/auth-provider";
import { useCategories } from "@/hooks/use-live-data";
import { upsertBudgetMonth } from "@/lib/sync/sync-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { getDexie } from "@/lib/db/dexie";

export default function BudgetsPage() {
  const { user } = useAuth();
  const categories = useCategories() ?? [];
  const month = format(startOfMonth(new Date()), "yyyy-MM");
  const budget = useLiveQuery(
    () => getDexie().budgets.get(month),
    [month]
  );
  const [local, setLocal] = useState<Record<string, string>>({});

  async function save() {
    if (!user) return;
    const categoryBudgets: Record<string, number> = {};
    for (const c of categories) {
      const raw = local[c.id] ?? String(budget?.categoryBudgets?.[c.id] ?? "");
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && n > 0) categoryBudgets[c.id] = n;
    }
    await upsertBudgetMonth(user.uid, {
      id: month,
      month,
      categoryBudgets,
      updatedAt: Date.now(),
    });
    toast.success("Budget saved");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <p className="text-muted-foreground text-sm">
          Monthly targets for spending-eligible categories ({month}).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Category budgets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories
            .filter((c) => c.countsTowardSpending)
            .map((c) => (
              <div key={c.id} className="flex items-center gap-4">
                <Label className="w-40">{c.name}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    className="w-32"
                    placeholder="0"
                    defaultValue={budget?.categoryBudgets?.[c.id] ?? ""}
                    onChange={(e) =>
                      setLocal((s) => ({ ...s, [c.id]: e.target.value }))
                    }
                  />
                </div>
              </div>
            ))}
          <Button onClick={save} className="mt-4">
            Save budgets
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
