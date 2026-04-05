"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { useCategories, useImportRules, useUserSettingsRow } from "@/hooks/use-live-data";
import {
  upsertCategory,
  deleteCategory,
  upsertImportRule,
  deleteImportRule,
  saveUserSettings,
} from "@/lib/sync/sync-service";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { Category, ImportRule } from "@/types";
import { UNCATEGORIZED_ID } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDexie } from "@/lib/db/dexie";
import { decodeBase64UrlUtf8 } from "@/lib/debug-base64url";
import { driveFileOpenUrl, isGoogleSheetMime } from "@/lib/drive/constants";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function CategoryEditRow({
  category: c,
  onSave,
  onToggleSpending,
  onRemove,
}: {
  category: Category;
  onSave: (c: Category) => Promise<void>;
  onToggleSpending: (c: Category, on: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(c.name);
  const [color, setColor] = useState(c.color);

  useEffect(() => {
    setName(c.name);
    setColor(c.color);
  }, [c.id, c.name, c.color]);

  const dirty = name.trim() !== c.name || color !== c.color;
  const canRemove = c.id !== UNCATEGORIZED_ID;

  async function save() {
    if (!name.trim()) {
      toast.error("Category name is required.");
      return;
    }
    await onSave({
      ...c,
      name: name.trim(),
      color,
      updatedAt: Date.now(),
    });
    toast.success("Category updated");
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:items-center">
        <div className="flex items-center gap-2">
          <Label className="sr-only">Color</Label>
          <Input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 shrink-0 cursor-pointer p-1"
            aria-label="Category color"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <Label className="sr-only">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Counts as spending</Label>
          <Switch
            checked={c.countsTowardSpending}
            onCheckedChange={(on) => onToggleSpending(c, on)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!dirty}
          onClick={() => void save()}
        >
          Save
        </Button>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onRemove(c.id)}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const categories = useCategories() ?? [];
  const rules = useImportRules() ?? [];
  const settingsRow = useUserSettingsRow();
  const [driveFolderIdInput, setDriveFolderIdInput] = useState("");
  const [driveListLoading, setDriveListLoading] = useState(false);
  const [driveFiles, setDriveFiles] = useState<
    {
      id: string;
      name: string;
      modifiedTime?: string;
      size?: string;
      mimeType?: string;
    }[]
  >([]);
  const [settingsTab, setSettingsTab] = useState("categories");
  const [newCat, setNewCat] = useState({ name: "", color: "#FF4500" });
  const [ruleForm, setRuleForm] = useState<{
    pattern: string;
    categoryId: string;
    exclude: boolean;
    matchType: ImportRule["matchType"];
  }>({
    pattern: "",
    categoryId: "",
    exclude: false,
    matchType: "contains",
  });

  useEffect(() => {
    setDriveFolderIdInput(settingsRow?.driveFolderId ?? "");
  }, [settingsRow?.driveFolderId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("driveConnected");
    const err = params.get("driveError");
    const dbg = params.get("driveDebug");
    if (connected === "1") {
      toast.success("Google Drive connected.");
      setSettingsTab("drive");
      window.history.replaceState({}, "", "/settings");
      return;
    }
    if (err) {
      const labels: Record<string, string> = {
        oauth:
          "Google OAuth did not return a code (cancelled, wrong client, or consent denied).",
        token:
          "Google token exchange failed — verify GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, redirect URI matches Google Cloud and .env, and OAuth client is Web type.",
        state: "OAuth state was invalid — try Connect again.",
        server: "Server missing FIREBASE_SERVICE_ACCOUNT_JSON.",
      };
      let desc = labels[err] ?? `Error code: ${err}`;
      if (dbg) {
        try {
          desc += `\n\n${decodeBase64UrlUtf8(dbg)}`;
        } catch {
          desc += "\n\n(debug payload could not be decoded)";
        }
      }
      toast.error("Drive connection failed", {
        description: desc,
        duration: 25_000,
      });
      setSettingsTab("drive");
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function addCategory() {
    if (!user || !newCat.name.trim()) return;
    const c: Category = {
      id: crypto.randomUUID(),
      name: newCat.name.trim(),
      color: newCat.color,
      sortOrder: categories.length,
      countsTowardSpending: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await upsertCategory(user.uid, c);
    setNewCat({ name: "", color: "#FF4500" });
    toast.success("Category added");
  }

  async function toggleCatSpending(c: Category, on: boolean) {
    if (!user) return;
    await upsertCategory(user.uid, {
      ...c,
      countsTowardSpending: on,
      updatedAt: Date.now(),
    });
  }

  async function removeCategory(id: string) {
    if (!user || id === UNCATEGORIZED_ID) return;
    await deleteCategory(user.uid, id);
    toast.success("Category removed");
  }

  async function addRule() {
    if (!user || !ruleForm.pattern.trim()) return;
    if (!ruleForm.exclude && !ruleForm.categoryId) {
      toast.error("Pick a category or enable investment exclusion");
      return;
    }
    const r: ImportRule = {
      id: crypto.randomUUID(),
      priority: rules.length,
      pattern: ruleForm.pattern.trim(),
      matchType: ruleForm.matchType,
      action: ruleForm.exclude
        ? { type: "exclude_spending", reason: "investment" }
        : { type: "set_category", categoryId: ruleForm.categoryId },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await upsertImportRule(user.uid, r);
    setRuleForm({
      pattern: "",
      categoryId: "",
      exclude: false,
      matchType: "contains",
    });
    toast.success("Rule added");
  }

  async function removeRule(id: string) {
    if (!user) return;
    await deleteImportRule(user.uid, id);
    toast.success("Rule removed");
  }

  const rulesOrdered = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority),
    [rules]
  );

  async function moveRule(id: string, dir: -1 | 1) {
    if (!user) return;
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i]!;
    const b = sorted[j]!;
    const pa = a.priority;
    const pb = b.priority;
    await upsertImportRule(user.uid, {
      ...a,
      priority: pb,
      updatedAt: Date.now(),
    });
    await upsertImportRule(user.uid, {
      ...b,
      priority: pa,
      updatedAt: Date.now(),
    });
    toast.success("Rule order updated");
  }

  function matchTypeLabel(m: ImportRule["matchType"]): string {
    if (m === "regex") return "Regex";
    if (m === "starts_with") return "Starts with";
    return "Contains";
  }

  async function exportJson() {
    const db = getDexie();
    const [tx, cat, ru] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.importRules.toArray(),
    ]);
    const blob = new Blob([JSON.stringify({ transactions: tx, categories: cat, importRules: ru }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ignite-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Download started");
  }

  async function connectDrive() {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      toast.error("You must be signed in to connect Drive.");
      return;
    }
    const token = await user.getIdToken(true);
    const res = await fetch("/api/drive/auth", {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    let data: {
      url?: string;
      error?: string;
      hint?: string;
      detail?: string;
      debug?: Record<string, unknown>;
    };
    try {
      data = await res.json();
    } catch {
      toast.error("Drive auth returned invalid JSON", {
        description: `HTTP ${res.status} ${res.statusText}`,
      });
      return;
    }

    console.error("[Ignite][Drive connect] /api/drive/auth", {
      ok: res.ok,
      status: res.status,
      body: data,
    });

    if (!res.ok) {
      const title = data.error ?? `Drive connect failed (${res.status})`;
      const descParts = [data.hint, data.detail];
      if (data.debug) {
        descParts.push(JSON.stringify(data.debug, null, 2));
      }
      const description = descParts.filter(Boolean).join("\n\n");
      toast.error(title, {
        description: description || undefined,
        duration: 20_000,
      });
      return;
    }
    if (data.debug) {
      console.info("[Ignite][Drive connect] debug (success)", data.debug);
    }
    if (data.url) window.location.href = data.url;
    else toast.error(data.error ?? "Could not start OAuth");
  }

  async function saveDriveFolder() {
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    const id = driveFolderIdInput.trim();
    await saveUserSettings(user.uid, { driveFolderId: id || undefined });
    toast.success("Drive folder saved.");
  }

  async function listDriveCsvs() {
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    const folderId = driveFolderIdInput.trim();
    if (!folderId) {
      toast.error("Enter a folder ID first.");
      return;
    }
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) {
      toast.error("You must be signed in.");
      return;
    }
    setDriveListLoading(true);
    setDriveFiles([]);
    try {
      const token = await u.getIdToken(true);
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderId }),
      });
      const data = (await res.json()) as {
        files?: {
          id: string;
          name: string;
          modifiedTime?: string;
          size?: string;
          mimeType?: string;
        }[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? `Could not list files (${res.status})`);
        return;
      }
      setDriveFiles(data.files ?? []);
      if ((data.files ?? []).length === 0) {
        toast.message("No CSV or Google Sheets found", {
          description:
            "Add .csv files or Google Sheets to this folder, then list again.",
        });
      }
    } finally {
      setDriveListLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Categories, rules, Google Drive, and data export.
        </p>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="drive">Drive</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your categories</CardTitle>
              <CardDescription>
                Edit name and color, then Save. Investment / transfer categories
                can turn off &quot;Counts as spending&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {categories.map((c) => (
                <CategoryEditRow
                  key={c.id}
                  category={c}
                  onSave={async (cat) => {
                    if (!user) return;
                    await upsertCategory(user.uid, cat);
                  }}
                  onToggleSpending={toggleCatSpending}
                  onRemove={removeCategory}
                />
              ))}
              <div className="flex flex-wrap gap-2 pt-4">
                <Input
                  placeholder="New category"
                  value={newCat.name}
                  onChange={(e) =>
                    setNewCat((n) => ({ ...n, name: e.target.value }))
                  }
                  className="max-w-xs"
                />
                <Input
                  type="color"
                  value={newCat.color}
                  onChange={(e) =>
                    setNewCat((n) => ({ ...n, color: e.target.value }))
                  }
                  className="h-10 w-16"
                />
                <Button onClick={addCategory}>Add</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import rules</CardTitle>
              <CardDescription>
                Rules run from top to bottom; the first match wins. Put specific
                patterns (e.g. Kroger Fuel) before general ones (Kroger). Match
                types: contains substring, starts with prefix, or regex.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rulesOrdered.map((r, idx) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 border-b border-border py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <code className="block w-full max-w-full break-all rounded bg-muted px-2 py-1.5 text-xs leading-relaxed">
                      {r.pattern}
                    </code>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span className="rounded border border-border px-1.5 py-0.5">
                        {matchTypeLabel(r.matchType)}
                      </span>
                      <span>
                        {r.action.type === "exclude_spending"
                          ? "Exclude from spending"
                          : "Set category"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8"
                      disabled={idx === 0}
                      onClick={() => moveRule(r.id, -1)}
                      aria-label="Move rule up"
                    >
                      <ChevronUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-8"
                      disabled={idx === rulesOrdered.length - 1}
                      onClick={() => moveRule(r.id, 1)}
                      aria-label="Move rule down"
                    >
                      <ChevronDownIcon className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRule(r.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Pattern</Label>
                  <Input
                    value={ruleForm.pattern}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, pattern: e.target.value }))
                    }
                    placeholder="e.g. KROGER FUEL or KROGER"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Match type</Label>
                  <Select
                    value={ruleForm.matchType}
                    onValueChange={(v) =>
                      setRuleForm((f) => ({
                        ...f,
                        matchType: v as ImportRule["matchType"],
                      }))
                    }
                  >
                    <SelectTrigger className="h-auto min-h-9 w-full max-w-full py-2 text-left whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="min-w-[min(100vw-2rem,28rem)]">
                      <SelectItem value="contains">
                        Contains — substring anywhere in description
                      </SelectItem>
                      <SelectItem value="starts_with">
                        Starts with — description must begin with this text
                        (helps fuel vs in-store)
                      </SelectItem>
                      <SelectItem value="regex">
                        Regular expression (full RegExp, case-insensitive flag)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    id="ex"
                    checked={ruleForm.exclude}
                    onCheckedChange={(on) =>
                      setRuleForm((f) => ({ ...f, exclude: on }))
                    }
                  />
                  <Label htmlFor="ex">Exclude as investment (not spending)</Label>
                </div>
                {!ruleForm.exclude && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Category</Label>
                    <Select
                      value={ruleForm.categoryId}
                      onValueChange={(v) =>
                        setRuleForm((f) => ({
                          ...f,
                          categoryId: v ?? "",
                        }))
                      }
                    >
                      <SelectTrigger className="h-auto min-h-9 w-full max-w-full py-2 text-left whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal">
                        <SelectValue placeholder="Pick category" />
                      </SelectTrigger>
                      <SelectContent className="min-w-[min(100vw-2rem,28rem)]">
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Button onClick={addRule}>Add rule</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drive">
          <Card>
            <CardHeader>
              <CardTitle>Google Drive</CardTitle>
              <CardDescription>
                Connect Google, then paste the ID of the folder that holds bank CSV
                exports and/or Google Sheets. Listing includes{" "}
                <code className="text-xs">text/csv</code> files and native Sheets
                (import uses the first worksheet as CSV).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button type="button" onClick={connectDrive}>
                Connect Google Drive
              </Button>
              <div className="space-y-2">
                <Label htmlFor="drive-folder-id">Folder ID</Label>
                <Input
                  id="drive-folder-id"
                  placeholder="e.g. from drive.google.com/drive/folders/THIS_PART"
                  value={driveFolderIdInput}
                  onChange={(e) => setDriveFolderIdInput(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Open the folder in Google Drive — the URL ends with{" "}
                  <code className="text-xs">/folders/&lt;id&gt;</code>. Paste only the ID. Import
                  can use the same folder from{" "}
                  <Link href="/import" className="text-primary underline">
                    Import
                  </Link>
                  .
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={saveDriveFolder}>
                  Save folder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={listDriveCsvs}
                  disabled={driveListLoading}
                >
                  {driveListLoading ? "Listing…" : "List CSV & Sheets"}
                </Button>
              </div>
              {driveFiles.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden w-24 sm:table-cell">Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Modified</TableHead>
                      <TableHead className="w-[1%] text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driveFiles.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          <span className="block">{f.name}</span>
                          <span className="text-muted-foreground text-xs sm:hidden">
                            {isGoogleSheetMime(f.mimeType)
                              ? "Google Sheet"
                              : "CSV"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {isGoogleSheetMime(f.mimeType) ? "Sheet" : "CSV"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {f.modifiedTime
                            ? new Date(f.modifiedTime).toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={driveFileOpenUrl(f.id, f.mimeType)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-sm underline"
                          >
                            Open
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Export data</CardTitle>
              <CardDescription>
                Download a JSON snapshot of local IndexedDB (transactions, categories, rules).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={exportJson}>
                Download JSON
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
