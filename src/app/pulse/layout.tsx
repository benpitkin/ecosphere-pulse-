import type { ReactNode } from "react";
import Link from "next/link";

const NAV: ReadonlyArray<readonly [string, string]> = [
  ["Cockpit", "/pulse"],
  ["This week", "/pulse/focus"],
  ["Forecast", "/pulse/forecast"],
  ["Installs", "/pulse/installs"],
  ["Crew", "/pulse/crew"],
  ["Owed", "/pulse/liabilities"],
  ["Advice", "/pulse/advice"],
  ["Assistant", "/pulse/assistant"],
  ["Settings", "/pulse/settings"],
];

export default function PulseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl p-4">
      <nav className="-mx-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap px-4 text-sm [&>*]:shrink-0 sm:mx-0 sm:px-0">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href} className="rounded px-3 py-2 hover:bg-gray-100">
            {label}
          </Link>
        ))}
      </nav>
      <main className="mt-4">{children}</main>
    </div>
  );
}
