import Link from "next/link";
import { Nav, Notice } from "@/components/ui";

const steps = [
  { n: "01", title: "Answer", body: "AI handles the initial call." },
  { n: "02", title: "Qualify", body: "Captures trade, issue and location." },
  { n: "03", title: "Validate", body: "Checks service-area eligibility." },
  { n: "04", title: "Route", body: "Produces callback, handoff or review." },
  { n: "05", title: "Dispatch", body: "Creates a structured call receipt." },
];

export default function HomePage() {
  return (
    <div>
      <Nav />
      <main id="content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs uppercase tracking-[0.24em] text-ember">FieldRelay</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          AI systems for HVAC & plumbing call intake.
        </h1>
        <p className="mt-5 text-lg text-paper/80">Answer. Qualify. Validate. Route.</p>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-paper/75">
          FieldRelay answers missed and after-hours calls for residential HVAC and plumbing
          companies. It captures the request, checks whether the ZIP is in service, and gives the
          dispatcher a structured next action — never a fake booking or price.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/voice-demo"
            className="inline-flex rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-ink"
          >
            Try the AI Agent
          </Link>
          <Link
            href="/dispatcher"
            className="inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm text-paper"
          >
            View Dispatcher
          </Link>
        </div>

        <section className="mt-20" aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-sm uppercase tracking-[0.2em] text-ember">
            How it works
          </h2>
          <ol className="mt-6 space-y-5">
            {steps.map((step) => (
              <li key={step.n} className="grid grid-cols-[3rem_1fr] gap-4 sm:grid-cols-[4rem_1fr]">
                <span className="text-sm text-ember">{step.n}</span>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-paper/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-16">
          <Notice>
            POC demonstration. Fictional data only. No real booking, dispatch, estimate, transfer, or
            live phone call.
          </Notice>
        </div>
      </main>
    </div>
  );
}
