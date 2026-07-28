"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pulse/sos", label: "Modeller" },
  { href: "/pulse/sos/ledger", label: "Commission ledger" },
];

export function SosTabs() {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-8">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.href === "/pulse/sos" ? pathname === "/pulse/sos" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
