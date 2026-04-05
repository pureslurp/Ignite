"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { parseCsvText, rowFromMapping, applyImportRules } from "@/lib/csv/parse";
import {
  buildDedupeHash,
  findExistingDuplicateTransaction,
} from "@/lib/csv/dedupe";
import { upsertTransaction } from "@/lib/sync/sync-service";
import { useImportRules, useCategories, useUserSettingsRow } from "@/hooks/use-live-data";
import { isGoogleSheetMime } from "@/lib/drive/constants";
import { toast } from "sonner";
import type { Transaction } from "@/types";

export default function ImportPage() {
  const { user } = useAuth();
  const rules = useImportRules() ?? [];
  const categories = useCategories() ?? [];
  const settingsRow = useUserSettingsRow();
  const driveFolderId = settingsRow?.driveFolderId?.trim() ?? "";
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    dateCol: "",
    amountCol: "",
    descriptionCol: "",
    merchantCol: "",
    memoCol: "",
    issuerCategoryCol: "",
    detailsCol: "",
  });
  const [preview, setPreview] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [driveFiles, setDriveFiles] = useState<
    { id: string; name: string; modifiedTime?: string; mimeType?: string }[]
  >([]);
  const [driveListLoading, setDriveListLoading] = useState(false);
  const [driveFileLoadingId, setDriveFileLoadingId] = useState<string | null>(
    null
  );

  function applyHeadersGuess(rows: ReturnType<typeof parseCsvText>) {
    if (!rows.length) return;
    setHeaders(Object.keys(rows[0]!));
    const h = rows[0]!;
    const guess = (substr: string) =>
      Object.keys(h).find((k) => k.toLowerCase().includes(substr)) ?? "";
    setMapping((m) => ({
      ...m,
      dateCol: guess("date") || Object.keys(h)[0]!,
      amountCol:
        Object.keys(h).find((k) => k.toLowerCase().includes("amount")) ?? "",
      descriptionCol: guess("description") || "",
      merchantCol: guess("merchant") || "",
      memoCol: guess("memo") || "",
      issuerCategoryCol: guess("category") || "",
      detailsCol: guess("details") || "",
    }));
  }

  function loadFromText(t: string, name: string) {
    setFileName(name);
    setText(t);
    const rows = parseCsvText(t);
    applyHeadersGuess(rows);
  }

  function loadFromFile(f: File) {
    f.text().then((t) => loadFromText(t, f.name));
  }

  async function listDriveCsvs() {
    if (!user || !driveFolderId) return;
    setDriveListLoading(true);
    setDriveFiles([]);
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) {
        toast.error("You must be signed in.");
        return;
      }
      const token = await u.getIdToken(true);
      const res = await fetch("/api/drive/list", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderId: driveFolderId }),
      });
      const data = (await res.json()) as {
        files?: {
          id: string;
          name: string;
          modifiedTime?: string;
          mimeType?: string;
        }[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? `Could not list files (${res.status})`);
        return;
      }
      setDriveFiles(data.files ?? []);
    } finally {
      setDriveListLoading(false);
    }
  }

  async function loadFromDriveFile(fileId: string, name: string) {
    if (!user) return;
    setDriveFileLoadingId(fileId);
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) {
        toast.error("You must be signed in.");
        return;
      }
      const token = await u.getIdToken(true);
      const res = await fetch(
        `/api/drive/file?id=${encodeURIComponent(fileId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? `Could not load file (${res.status})`);
        return;
      }
      if (typeof data.text !== "string") {
        toast.error("Drive returned an empty file.");
        return;
      }
      loadFromText(data.text, name);
      toast.success(`Loaded “${name}” — set mapping, preview, then import.`);
    } finally {
      setDriveFileLoadingId(null);
    }
  }

  const issuerMap = useMemo(
    () => settingsRow?.issuerCategoryMappings ?? {},
    [settingsRow?.issuerCategoryMappings]
  );

  async function runPreview() {
    const rows = parseCsvText(text);
    const next: Transaction[] = [];
    const seen = new Set<string>();
    let skippedExisting = 0;
    for (const raw of rows.slice(0, 200)) {
      const parsed = rowFromMapping(raw, {
        dateCol: mapping.dateCol,
        amountCol: mapping.amountCol,
        descriptionCol: mapping.descriptionCol,
        merchantCol: mapping.merchantCol || undefined,
        memoCol: mapping.memoCol || undefined,
        issuerCategoryCol: mapping.issuerCategoryCol || undefined,
        detailsCol: mapping.detailsCol || undefined,
      });
      if (!parsed) continue;
      const amountStored = Math.abs(parsed.amount);
      const hash = await buildDedupeHash({
        date: parsed.date,
        amount: amountStored,
        description: parsed.description,
      });
      if (seen.has(hash)) continue;
      seen.add(hash);
      const existing = await findExistingDuplicateTransaction(
        parsed.date,
        amountStored,
        parsed.description,
        hash
      );
      if (existing) {
        skippedExisting++;
        continue;
      }
      const applied = applyImportRules(
        parsed.description,
        parsed.merchant,
        parsed.memo,
        rules,
        categories,
        parsed.issuerCategory,
        issuerMap
      );
      const signExcluded = parsed.amount < 0;
      const countsTowardSpending =
        applied.countsTowardSpending && !signExcluded;
      const exclusionReason: Transaction["exclusionReason"] = signExcluded
        ? "income_credit"
        : applied.exclusionReason;
      const id = crypto.randomUUID();
      const t: Transaction = {
        id,
        date: parsed.date,
        amount: amountStored,
        description: parsed.description,
        categoryId: applied.categoryId,
        account: fileName || "Manual import",
        countsTowardSpending,
        exclusionReason,
        originalCsvName: fileName,
        dedupeHash: hash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      next.push(t);
    }
    setPreview(next);
    const parts = [
      `${next.length} new row${next.length === 1 ? "" : "s"} in preview`,
      skippedExisting > 0
        ? `${skippedExisting} already in Ignite (skipped)`
        : null,
      "deduped within file",
    ].filter(Boolean);
    toast.message(`Preview: ${parts.join(" · ")}`);
  }

  async function commitImport() {
    if (!user) return;
    setImporting(true);
    try {
      const rows = parseCsvText(text);
      let n = 0;
      let skippedDup = 0;
      const seen = new Set<string>();
      for (const raw of rows) {
        const parsed = rowFromMapping(raw, {
          dateCol: mapping.dateCol,
          amountCol: mapping.amountCol,
          descriptionCol: mapping.descriptionCol,
          merchantCol: mapping.merchantCol || undefined,
          memoCol: mapping.memoCol || undefined,
          issuerCategoryCol: mapping.issuerCategoryCol || undefined,
          detailsCol: mapping.detailsCol || undefined,
        });
        if (!parsed) continue;
        const amountStored = Math.abs(parsed.amount);
        const hash = await buildDedupeHash({
          date: parsed.date,
          amount: amountStored,
          description: parsed.description,
        });
        if (seen.has(hash)) continue;
        seen.add(hash);
        const existing = await findExistingDuplicateTransaction(
          parsed.date,
          amountStored,
          parsed.description,
          hash
        );
        if (existing) {
          skippedDup++;
          continue;
        }
        const applied = applyImportRules(
          parsed.description,
          parsed.merchant,
          parsed.memo,
          rules,
          categories,
          parsed.issuerCategory,
          issuerMap
        );
        const signExcluded = parsed.amount < 0;
        const countsTowardSpending =
          applied.countsTowardSpending && !signExcluded;
        const exclusionReason: Transaction["exclusionReason"] = signExcluded
          ? "income_credit"
          : applied.exclusionReason;
        const id = crypto.randomUUID();
        await upsertTransaction(user.uid, {
          id,
          date: parsed.date,
          amount: amountStored,
          description: parsed.description,
          categoryId: applied.categoryId,
          account: fileName || "import",
          countsTowardSpending,
          exclusionReason,
          originalCsvName: fileName,
          dedupeHash: hash,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        n++;
      }
      const msg =
        skippedDup > 0
          ? `Imported ${n} new transaction${n === 1 ? "" : "s"} (${skippedDup} already existed, skipped)`
          : `Imported ${n} transaction${n === 1 ? "" : "s"}`;
      toast.success(msg);
      setPreview([]);
      setText("");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Import CSV</h1>
        <p className="text-muted-foreground text-sm">
          Upload a CSV, or load a CSV / Google Sheet from Drive (Sheets export as
          CSV — first tab only). Map columns, preview, then import. Import rules
          (and issuer category mappings from Settings) run on each row. Rows that
          match an existing transaction (same date, amount, and description) are
          skipped so re-imports never create duplicates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>
            Uses the folder saved under{" "}
            <Link href="/settings" className="text-primary underline">
              Settings → Drive
            </Link>
            . Lists <code className="text-xs">.csv</code> files and Google Sheets;
            sheets are exported as CSV (first worksheet). Pick a file, then map
            columns like a local upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!driveFolderId ? (
            <p className="text-sm text-muted-foreground">
              Set a Drive folder in{" "}
              <Link href="/settings" className="text-primary underline">
                Settings → Drive
              </Link>{" "}
              to list CSV and Sheet files here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={driveListLoading}
                  onClick={listDriveCsvs}
                >
                  {driveListLoading ? "Listing…" : "List CSV & Sheets"}
                </Button>
              </div>
              {driveFiles.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden w-24 sm:table-cell">
                        Type
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Modified
                      </TableHead>
                      <TableHead className="w-[1%] text-right">
                        Load
                      </TableHead>
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={driveFileLoadingId === f.id}
                            onClick={() => loadFromDriveFile(f.id, f.name)}
                          >
                            {driveFileLoadingId === f.id ? "Loading…" : "Load"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File</CardTitle>
          <CardDescription>
            Upload from your device, or load from Drive above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFromFile(f);
            }}
          />
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Column mapping</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["dateCol", "Date"],
                ["amountCol", "Amount"],
                ["descriptionCol", "Description"],
                ["merchantCol", "Merchant (optional)"],
                ["memoCol", "Memo (optional)"],
                ["issuerCategoryCol", "Issuer category (optional)"],
                ["detailsCol", "Details DEBIT/CREDIT (Chase bank)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Select
                  value={mapping[key]}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [key]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="sm:col-span-2 flex gap-2">
              <Button type="button" onClick={runPreview}>
                Preview
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={!preview.length || importing}
                onClick={commitImport}
                className="bg-gradient-to-r from-[#FFB800] to-[#FF4500] text-white"
              >
                {importing ? "Importing…" : "Import all"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({preview.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Spending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 25).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.date}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {t.description}
                    </TableCell>
                    <TableCell>${t.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      {t.countsTowardSpending ? "Yes" : "Excluded"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
