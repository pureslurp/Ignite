import { AuthGuard } from "@/components/dashboard/auth-guard";
import { SyncProvider } from "@/components/providers/sync-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SyncProvider>
        <DashboardShell>{children}</DashboardShell>
      </SyncProvider>
    </AuthGuard>
  );
}
