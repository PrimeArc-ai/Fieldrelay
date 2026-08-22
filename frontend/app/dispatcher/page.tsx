"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorBanner, Nav, Notice, StateMessage, StatusBadge } from "@/components/ui";
import { api, CallSummary } from "@/lib/api";
import {
  DispatcherFilter,
  formatClock,
  matchesFilter,
  matchesQuery,
  outcomeLabel,
  outcomeTone,
  prettyLabel,
} from "@/lib/format";

const FILTERS: { id: DispatcherFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "callback", label: "Callback" },
  { id: "handoff", label: "Handoff" },
  { id: "review", label: "Manual Review" },
  { id: "unsupported", label: "Unsupported" },
  { id: "failed", label: "Failed" },
];

export default function DispatcherPage() {
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DispatcherFilter>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCalls(await api.calls());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => calls.filter((call) => matchesFilter(call, filter) && matchesQuery(call, query)),
    [calls, filter, query]
  );

  return (
    <div>
      <Nav />
      <main id="content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ember">Dispatcher console</p>
            <h1 className="mt-2 text-3xl font-semibold">Recent calls</h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/20 px-4 py-2 text-sm"
            aria-label="Refresh recent calls"
          >
            Refresh
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <div>
            <label htmlFor="call-search" className="text-xs uppercase tracking-[0.16em] text-paper/55">
              Search
            </label>
            <input
              id="call-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Trade, issue, ZIP, call ID"
              className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm outline-none placeholder:text-paper/40"
            />
          </div>
          <div role="group" aria-label="Filter calls">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide ${
                    filter === item.id ? "border-ember text-paper" : "border-white/15 text-paper/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          {error ? <ErrorBanner message={error} /> : null}
          {loading ? <StateMessage title="Loading calls" /> : null}
          {!loading && !error && calls.length === 0 ? (
            <StateMessage title="No calls yet">
              Run the voice demo or a scenario to create a receipt.
            </StateMessage>
          ) : null}
          {!loading && !error && calls.length > 0 && visible.length === 0 ? (
            <StateMessage title="No matching calls">Try another search or filter.</StateMessage>
          ) : null}

          <ul className="divide-y divide-white/10 border-t border-white/10">
            {visible.map((call) => (
              <li key={call.call_id}>
                <Link
                  href={`/dispatcher/calls/${call.call_id}`}
                  className="grid gap-3 py-4 sm:grid-cols-[6.5rem_1fr_auto] sm:items-center"
                >
                  <time className="text-sm text-paper/60" dateTime={call.created_at}>
                    {formatClock(call.created_at)}
                  </time>
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {call.trade || "Unspecified trade"} · {prettyLabel(call.issue_category)}
                    </p>
                    <p className="mt-1 text-xs text-paper/60">
                      {call.zip || "No ZIP"}
                      {call.location ? ` · ${call.location}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={prettyLabel(call.urgency)} tone={call.urgency === "urgent" ? "handoff" : "neutral"} />
                    <StatusBadge label={outcomeLabel(call)} tone={outcomeTone(call)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <Notice>Operational view only. Dispatchers cannot edit policy or confirm appointments here.</Notice>
        </div>
      </main>
    </div>
  );
}
