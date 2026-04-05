"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isFirebaseConfigured()) {
      router.replace("/login");
      return;
    }
    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (!loading && !isFirebaseConfigured()) {
    return null;
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
