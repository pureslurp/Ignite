"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Hover preview for transaction notes. Trigger is a span (safe inside row buttons).
 */
export function NotePreviewTooltip({
  note,
  className,
  children,
}: {
  note: string;
  className?: string;
  children: ReactNode;
}) {
  const text = note.trim();
  if (!text) return <>{children}</>;

  return (
    <Tooltip.Provider delay={200}>
      <Tooltip.Root>
        <Tooltip.Trigger
          closeOnClick={false}
          delay={150}
          render={<span className={cn("inline-flex shrink-0", className)} />}
        >
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="top" sideOffset={6} className="z-[100]">
            <Tooltip.Popup
              className={cn(
                "max-h-48 max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-popover px-3 py-2 text-left text-sm text-popover-foreground shadow-md outline-none"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{text}</p>
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
