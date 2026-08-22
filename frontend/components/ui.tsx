"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OutcomeTone } from "@/lib/format";

const links = [
  { href: "/voice-demo", label: "Voice demo" },
  { href: "/dispatcher", label: "Dispatcher" },
  { href: "/demo", label: "Scenarios" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-white/10">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:rounded focus:bg-ember focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="text-sm tracking-[0.18em] uppercase text-paper">
          FieldRelay
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-sm ${active ? "text-paper" : "text-paper/70 hover:text-paper"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

const TONE_CLASS: Record<OutcomeTone, string> = {
  callback: "border-paper/30 text-paper",
  handoff: "border-ember/50 text-ember",
  review: "border-paper/20 text-paper/80",
  unsupported: "border-paper/20 text-paper/80",
  failed: "border-ember/50 text-ember",
  neutral: "border-white/15 text-paper/70",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: OutcomeTone;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wide ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-5 text-paper/60" role="note">
      {children}
    </p>
  );
}

export function StateMessage({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 px-4 py-6 text-sm" role="status">
      <p className="font-medium text-paper">{title}</p>
      {children ? <p className="mt-2 text-paper/70">{children}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-paper" role="alert">
      {message}
    </div>
  );
}
