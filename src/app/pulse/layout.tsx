import Link from "next/link";
import { Activity } from "lucide-react";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(210_40%_98%)]">
      <header className="sticky top-0 z-20 border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link href="/pulse" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Activity size={18} />
            </span>
            <span className="text-base font-bold tracking-tight">
              EcoSphere <span className="text-accent">Pulse</span>
            </span>
          </Link>
          <nav className="-mx-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap px-4 text-sm [&>*]:shrink-0 sm:mx-0 sm:px-0">
            <NavLink href="/pulse" label="Cockpit" />
            <NavLink href="/pulse/focus" label="This week" />
            <NavLink href="/pulse/forecast" label="Forecast" />
            <NavLink href="/pulse/installs" label="Installs" />
            <NavLink href="/pulse/leads" label="Leads" />
            <NavLink href="/pulse/crew" label="Crew" />
            <NavLink href="/pulse/liabilities" label="Owed" />
            <NavLink href="/pulse/advice" label="Advice" />
            <NavLink href="/pulse/assistant" label="Assistant" />
            <NavLink href="/pulse/settings" label="Settings" />
            <a
              href="/api/logout"
              className="ml-2 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Sign out
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
