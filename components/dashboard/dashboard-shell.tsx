"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  List,
  Upload,
  PieChart,
  Wallet,
  Settings,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Image
            src="/brand/ignite-logo.png"
            alt=""
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-semibold tracking-tight">Ignite</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          <p className="truncate">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start px-2"
            onClick={() => signOut()}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={mobileNav} onOpenChange={setMobileNav}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Menu"
                type="button"
                onClick={() => setMobileNav(true)}
              >
                <Menu className="size-5" />
              </Button>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-14 items-center gap-2 border-b border-border px-4">
                  <Image
                    src="/brand/ignite-logo.png"
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-lg"
                  />
                  <span className="font-semibold">Ignite</span>
                </div>
                <div className="p-3">
                  <NavLinks onNavigate={() => setMobileNav(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-semibold">Ignite</span>
          </div>
        </header>
        <main className="flex-1 min-w-0 px-3 py-4 sm:px-4 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
