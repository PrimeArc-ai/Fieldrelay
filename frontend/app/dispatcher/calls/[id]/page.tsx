"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorBanner, Nav, Notice, StateMessage, StatusBadge } from "@/components/ui";
import { api, CallDetail } from "@/lib/api";
import { eventLabel, formatTime, intakeSummary, outcomeLabel, outcomeTone, prettyLabel } from "@/lib/format";

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .call(params.id)
      .then(setCall)
      .catch((err) => setError(err instanceof Error ? err.message : "Call not found"))
      .finally(() => setLoading(false));
  }, [params.id]);

  const area =
    call && typeof call.receipt?.service_area_status === "string"
      ? prettyLabel(String(call.receipt.service_area_status))
      : "—";

  return (
    <div>
      <Nav />
      <main id="content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs uppercase tracking-[0.24em] text-ember">Call receipt</p>
        {loading ? <div className="mt-6"><StateMessage title="Loading receipt" /></div> : null}
        {error ? <div className="mt-6"><ErrorBanner message={error} /></div> : null}

        {call ? (
          <article className="mt-4">
            <header className="border-b border-white/10 pb-6">
              <h1 className="text-2xl font-semibold sm:text-3xl">{call.call_id}</h1>
              <p className="mt-2 text-sm text-paper/60">{formatTime(call.created_at)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={outcomeLabel(call)} tone={outcomeTone(call)} />
                <StatusBadge
                  label={prettyLabel(call.urgency)}
                  tone={call.urgency === "urgent" ? "handoff" : "neutral"}
                />
              </div>
            </header>

            <ReceiptSection title="Customer request">
              <Field label="Trade" value={call.trade} />
              <Field label="Issue" value={prettyLabel(call.issue_category)} />
            </ReceiptSection>

            <ReceiptSection title="Service details">
              <Field label="ZIP" value={call.zip} />
              <Field label="Location" value={call.location} />
              <Field label="Service area" value={area} />
            </ReceiptSection>

            <ReceiptSection title="Next action">
              <Field label="Outcome" value={outcomeLabel(call)} />
              <Field
                label="Callback requested"
                value={call.callback_confirmed == null ? "—" : call.callback_confirmed ? "Yes" : "No"}
              />
              <Field label="Preferred time" value={call.preferred_next_action} />
              {call.handoff_reason ? <Field label="Handoff reason" value={prettyLabel(call.handoff_reason)} /> : null}
            </ReceiptSection>

            <ReceiptSection title="AI intake summary">
              <p className="text-sm leading-7 text-paper/80">{intakeSummary(call)}</p>
            </ReceiptSection>

            {Array.isArray(call.receipt?.transcript) && (call.receipt.transcript as { role?: string; text?: string }[]).length > 0 ? (
              <section className="border-b border-white/10 py-6" aria-labelledby="conversation-heading">
                <h2 id="conversation-heading" className="text-xs uppercase tracking-[0.18em] text-ember">
                  Conversation
                </h2>
                <ol className="mt-4 space-y-3">
                  {(call.receipt.transcript as { role?: string; text?: string }[]).map((line, index) => (
                    <li key={`${line.role}-${index}`} className="text-sm leading-6">
                      <span className="text-xs uppercase tracking-widest text-paper/55">
                        {line.role === "assistant" ? "Assistant" : "Caller"}
                      </span>
                      <p className="text-paper/80">{line.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section className="border-b border-white/10 py-6" aria-labelledby="notice-heading">
              <h2 id="notice-heading" className="text-xs uppercase tracking-[0.18em] text-ember">
                Important notice
              </h2>
              <p className="mt-3 text-sm leading-7 text-paper/80">
                This is a provisional callback request. No appointment, estimate, price, technician
                assignment, or service promise has been confirmed.
              </p>
            </section>

            <section className="border-b border-white/10 py-6" aria-labelledby="timeline-heading">
              <h2 id="timeline-heading" className="text-xs uppercase tracking-[0.18em] text-ember">
                Call timeline
              </h2>
              <ol className="mt-5 space-y-4">
                {call.events.map((event, index) => (
                  <li key={`${event.event_type}-${index}`} className="grid grid-cols-[1rem_1fr] gap-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-ember" aria-hidden="true" />
                    <div>
                      <p className="text-sm">{eventLabel(event)}</p>
                      <p className="text-xs text-paper/55">{formatTime(event.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <details className="py-6">
              <summary className="cursor-pointer text-sm text-paper/80">Technical details</summary>
              <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs leading-6 text-paper/75">
                {JSON.stringify(
                  {
                    receipt: call.receipt,
                    events: call.events,
                  },
                  null,
                  2
                )}
              </pre>
            </details>

            <div className="flex flex-wrap gap-4">
              <Link href="/dispatcher" className="text-sm underline">
                Back to dispatcher
              </Link>
            </div>
            <div className="mt-8">
              <Notice>POC record. Fictional caller data. JSON remains available for debugging only.</Notice>
            </div>
          </article>
        ) : null}
      </main>
    </div>
  );
}

function ReceiptSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = title.replaceAll(" ", "-").toLowerCase();
  return (
    <section className="border-b border-white/10 py-6" aria-labelledby={id}>
      <h2 id={id} className="text-xs uppercase tracking-[0.18em] text-ember">
        {title}
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-paper/55">{label}</dt>
      <dd className="mt-1 text-sm">{value && value !== "—" ? value : "—"}</dd>
    </div>
  );
}
