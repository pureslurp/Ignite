"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import {
  pullAllFromFirestore,
  seedDefaultCategories,
} from "@/lib/sync/sync-service";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setSynced(true);
      return;
    }
    if (loading) return;
    if (!user) {
      setSynced(true);
      return;
    }
    setSynced(false);
    let cancelled = false;
    (async () => {
      try {
        const { getFirestoreDb } = await import("@/lib/firebase/client");
        getFirestoreDb();
        await seedDefaultCategories(user.uid);
        await pullAllFromFirestore(user.uid);
        if (!cancelled) setSynced(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sync failed");
          setSynced(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (error) {
    return (
      <div className="bg-destructive/10 text-destructive p-4 text-center text-sm">
        {error}
      </div>
    );
  }

  if (!loading && user && !synced) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Syncing your data…
      </div>
    );
  }

  return <>{children}</>;
}
