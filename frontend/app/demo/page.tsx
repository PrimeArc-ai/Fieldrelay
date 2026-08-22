"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ErrorBanner, Nav, Notice, StateMessage, StatusBadge } from "@/components/ui";
import { api, CallDetail } from "@/lib/api";
import { intakeSummary, outcomeLabel, outcomeTone } from "@/lib/format";
import { SCENARIO_CARDS } from "@/lib/scenarios";

export default function DemoPage() {
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CallDetail | null>(null);

  useEffect(() => {
    api
      .scenarios()
      .then((rows) => setAvailable(rows.map((row) => row.id)))
      .catch((err) => setError(err instanceof Error ? err.message : "Backend unavailable"))
      .finally(() => setLoading(false));
  }, []);

  const cards = useMemo(
    () => SCENARIO_CARDS.filter((card) => available.includes(card.id)),
    [available]
  );

  async function run(id: string) {
    setBusy(id);
    setError(null);
    try {
      setResult(await api.runScenario(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario failed");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      await api.reset();
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Nav />
      <main id="content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs uppercase tracking-[0.24em] text-ember">Demonstration</p>
        <h1 className="mt-2 text-3xl font-semibold">Scenario lab</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-paper/75">
          Each card runs the live FieldRelay engine with fictional inputs. Outcomes come from the
          backend, not from this page.
        </p>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void reset()}
            disabled={busy !== null}
            className="text-sm text-paper/70 underline"
          >
            Reset demo data
          </button>
        </div>

        {error ? <div className="mt-6"><ErrorBanner message={error} /></div> : null}
        {loading ? <div className="mt-6"><StateMessage title="Loading scenarios" /></div> : null}

        {result ? (
          <section className="mt-8 rounded-2xl border border-white/10 p-5" aria-labelledby="result-heading">
            <h2 id="result-heading" className="text-sm font-medium">Result</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge label={outcomeLabel(result)} tone={outcomeTone(result)} />
              <StatusBadge label={result.call_id} />
            </div>
            <p className="mt-4 text-sm leading-6 text-paper/80">{intakeSummary(result)}</p>
            <Link
              href={`/dispatcher/calls/${result.call_id}`}
              className="mt-5 inline-flex rounded-full bg-ember px-4 py-2 text-sm font-medium text-ink"
            >
              View Dispatcher Receipt
            </Link>
          </section>
        ) : null}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col rounded-2xl border border-white/10 p-5">
              <h2 className="text-base font-medium">{card.title}</h2>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-paper/55">Input</p>
              <p className="mt-1 text-sm text-paper/75">{card.input}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-paper/55">Expected outcome</p>
              <p className="mt-1 text-sm">{card.expected}</p>
              <button
                type="button"
                onClick={() => void run(card.id)}
                disabled={busy !== null}
                aria-label={`Run scenario: ${card.title}`}
                className="mt-5 self-start rounded-full bg-ember px-4 py-2 text-sm font-medium text-ink"
              >
                {busy === card.id ? "Running…" : "Run scenario"}
              </button>
            </li>
          ))}
        </ul>

        {!loading && cards.length === 0 && !error ? (
          <div className="mt-8">
            <StateMessage title="No scenarios available">The backend did not return any demo scenarios.</StateMessage>
          </div>
        ) : null}

        <div className="mt-10">
          <Notice>POC controls only. These are not customer-facing production tools.</Notice>
        </div>
      </main>
    </div>
  );
}
