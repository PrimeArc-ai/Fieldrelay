"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DailyIframe from "@daily-co/daily-js";
import Vapi from "@vapi-ai/web";
import { ErrorBanner, Nav, Notice, StatusBadge } from "@/components/ui";
import { api, TurnResponse, VoiceConfig } from "@/lib/api";
import { INTAKE_STEPS, stepIndex } from "@/lib/format";

type Line = { role: "assistant" | "caller"; text: string };
type CallUiStatus = "Ready" | "Connecting" | "In progress" | "Completed" | "Failed";

const NONFATAL_VAPI_ERRORS = new Set([
  "audio-observer-setup-error",
  "audio-processing-setup-error",
  "video-recording-setup-error",
]);

function vapiErrorText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err !== "object") return String(err);
  const value = err as Record<string, unknown>;
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  if (typeof value.errorMsg === "string" && value.errorMsg.trim()) return value.errorMsg;
  if (typeof value.error === "string" && value.error.trim()) return value.error;
  if (value.error) return vapiErrorText(value.error);
  if (typeof value.type === "string") return value.type;
  return "";
}

function describeVapiError(err: unknown): string {
  const raw = vapiErrorText(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("notallowederror") ||
    lower.includes("permission denied") ||
    lower.includes("not allowed")
  ) {
    return "This tab was denied the microphone. In the address bar, set Microphone to Allow, reload, and start again. Or type your replies below.";
  }
  if (lower.includes("notfounderror") || lower.includes("requested device not found")) {
    return "The browser cannot see a microphone device. Type your replies below.";
  }
  if (lower.includes("notreadableerror") || lower.includes("could not start audio")) {
    return "The microphone is in use or the browser could not open it. Close other apps using the mic, or type your replies below.";
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid key")) {
    return "Vapi rejected the public key. Check VAPI_PUBLIC_KEY, or type your replies below.";
  }
  if (lower.includes("402") || lower.includes("credit") || lower.includes("quota") || lower.includes("payment")) {
    return "Vapi has no remaining credits. Type your replies below to finish the demo.";
  }
  return raw
    ? `Voice did not start (${raw}). Type your replies below.`
    : "Voice did not start. Type your replies below.";
}

function isFatalVapiError(err: unknown): boolean {
  if (err && typeof err === "object" && "type" in err) {
    return !NONFATAL_VAPI_ERRORS.has(String((err as { type: unknown }).type));
  }
  return true;
}

function isMicDenied(err: unknown): boolean {
  const lower = vapiErrorText(err).toLowerCase();
  return (
    lower.includes("notallowederror") ||
    lower.includes("permission denied") ||
    lower.includes("not allowed")
  );
}

function destroyStaleDaily() {
  try {
    DailyIframe.getCallInstance()?.destroy();
  } catch {
    // A leftover Daily room from a failed start should not block the next attempt.
  }
}

export default function VoiceDemoPage() {
  const [voice, setVoice] = useState<VoiceConfig | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState("DISCLOSURE");
  const [uiStatus, setUiStatus] = useState<CallUiStatus>("Ready");
  const [liveVoice, setLiveVoice] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const callIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const linesRef = useRef<Line[]>([]);
  const voiceStartedRef = useRef(false);

  const voiceEnabled = Boolean(voice?.enabled);

  useEffect(() => {
    api
      .voiceConfig()
      .then(setVoice)
      .catch(() => setVoice({ enabled: false, publicKey: null, assistantId: null, assistant: null, mode: "typed" }));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  async function finishCall() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    vapiRef.current?.stop();
    setLiveVoice(false);
    const id = callIdRef.current;
    if (!id) {
      setUiStatus("Completed");
      setComplete(true);
      return;
    }
    try {
      const result = await api.completeCall(id, linesRef.current);
      setEngineStatus(result.status);
      setComplete(true);
      setUiStatus("Completed");
      if (result.assistant_text) {
        setLines((current) => {
          const last = current[current.length - 1];
          if (last?.text === result.assistant_text) return current;
          return [...current, { role: "assistant", text: result.assistant_text }];
        });
      }
    } catch (err) {
      setUiStatus("Failed");
      setError(err instanceof Error ? err.message : "Could not save the dispatcher receipt");
    }
  }

  async function applyUserTurn(text: string) {
    const id = callIdRef.current;
    if (!id) return;
    const result: TurnResponse = await api.turn(id, text);
    setEngineStatus(result.status);
    setComplete(result.complete);
    if (result.complete) {
      setUiStatus("Completed");
      void finishCall();
    }
    return result;
  }

  async function start() {
    setBusy(true);
    setError(null);
    setUiStatus("Connecting");
    try {
      const result = await api.startCall();
      callIdRef.current = result.call_id;
      finishingRef.current = false;
      voiceStartedRef.current = false;
      setCallId(result.call_id);
      setComplete(false);
      setEngineStatus(result.status);
      const opening: Line[] = [{ role: "assistant", text: result.assistant_text }];
      linesRef.current = opening;
      setLines(opening);

      if (voiceEnabled && voice?.publicKey) {
        try {
          await startVapi(voice);
          voiceStartedRef.current = true;
          setLiveVoice(true);
          setUiStatus("In progress");
        } catch (voiceErr) {
          voiceStartedRef.current = false;
          setLiveVoice(false);
          setUiStatus("In progress");
          setError(describeVapiError(voiceErr));
          window.setTimeout(() => inputRef.current?.focus(), 50);
        }
      } else {
        setLiveVoice(false);
        setUiStatus("In progress");
        window.setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (err) {
      setUiStatus("Failed");
      setLiveVoice(false);
      setError(err instanceof Error ? err.message : "Could not start the demo. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  async function startVapi(config: VoiceConfig, attempt = 0): Promise<void> {
    vapiRef.current?.stop();
    destroyStaleDaily();
    const client = new Vapi(config.publicKey as string);
    vapiRef.current = client;
    let startFailed = "";

    client.on("call-start", () => {
      voiceStartedRef.current = true;
      setError(null);
      setLiveVoice(true);
      setUiStatus("In progress");
    });
    client.on("call-start-failed", (event: { error?: string }) => {
      startFailed = event?.error || startFailed;
    });
    client.on("call-end", () => {
      setLiveVoice(false);
      if (voiceStartedRef.current) void finishCall();
    });
    client.on("error", (err: unknown) => {
      if (!isFatalVapiError(err)) return;
      if (!voiceStartedRef.current) {
        startFailed = vapiErrorText(err) || startFailed;
        return;
      }
      if (isMicDenied(err)) {
        setLiveVoice(false);
        setError(describeVapiError(err));
      }
    });
    client.on("message", (message: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
      if (message.type !== "transcript" || message.transcriptType !== "final" || !message.transcript) return;
      const role: Line["role"] = message.role === "assistant" ? "assistant" : "caller";
      setLines((current) => {
        const last = current[current.length - 1];
        if (last && last.role === role && last.text === message.transcript) return current;
        const next = [...current, { role, text: message.transcript as string }];
        linesRef.current = next;
        return next;
      });
      if (role === "caller") {
        const hangup = /\b(end (the |this )?call|hang up|goodbye|end it)\b/i.test(message.transcript);
        void applyUserTurn(message.transcript)
          .then((result) => {
            if (hangup || result?.complete) void finishCall();
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Could not record this turn");
          });
      } else if (/\b(thank you for calling|goodbye)\b/i.test(message.transcript)) {
        window.setTimeout(() => void finishCall(), 1200);
      }
    });

    let webCall: unknown = null;
    if (config.assistantId) {
      webCall = await client.start(config.assistantId);
    } else if (config.assistant) {
      webCall = await client.start({ ...config.assistant, recordingEnabled: false } as never);
    } else {
      throw new Error("Vapi is enabled but no assistant is configured.");
    }
    if (webCall) return;

    const reason = startFailed || "Daily did not join the Vapi room.";
    const retryable = /duplicate|already-started|call object/i.test(reason);
    if (attempt === 0 && retryable) {
      client.stop();
      destroyStaleDaily();
      await startVapi(config, 1);
      return;
    }
    throw new Error(reason);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!callId || !input.trim() || complete || liveVoice) return;
    const text = input.trim();
    setInput("");
    setLines((current) => {
      const next = [...current, { role: "caller" as const, text }];
      linesRef.current = next;
      return next;
    });
    setBusy(true);
    try {
      const result = await applyUserTurn(text);
      if (result) {
        setLines((current) => {
          const next = [...current, { role: "assistant" as const, text: result.assistant_text }];
          linesRef.current = next;
          return next;
        });
      }
    } catch (err) {
      setUiStatus("Failed");
      setError(err instanceof Error ? err.message : "Turn failed");
    } finally {
      setBusy(false);
    }
  }

  function endVoice() {
    void finishCall();
  }

  const activeStep = stepIndex(engineStatus, complete);

  return (
    <div>
      <Nav />
      <main id="content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs uppercase tracking-[0.24em] text-ember">AI voice intake</p>
        <h1 className="mt-3 text-3xl font-semibold">Try the after-hours intake agent.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-paper/75">
          {voiceEnabled
            ? "Start Demo Call opens a live Vapi browser session. Allow the microphone. The assistant speaks; FieldRelay still writes the dispatcher receipt."
            : "Voice is not configured yet. Start Demo Call uses typed intake. Add VAPI_PUBLIC_KEY to .env to let Vapi speak."}
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          <section aria-labelledby="call-panel-heading" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="call-panel-heading" className="text-sm font-medium">
                Demo call
              </h2>
              <p aria-live="polite">
                <StatusBadge
                  label={uiStatus}
                  tone={uiStatus === "Failed" ? "failed" : uiStatus === "Completed" ? "callback" : "neutral"}
                />
              </p>
            </div>

            {!callId ? (
              <div className="mt-4 rounded-2xl border border-white/10 px-5 py-10 text-center sm:px-8">
                <CallMark live={false} enabled={voiceEnabled} />
                <p className="mt-6 text-sm text-paper/75">
                  {voiceEnabled ? "Microphone ready. The assistant will speak first." : "Ready when you are."}
                </p>
                <button
                  type="button"
                  onClick={start}
                  disabled={busy || voice === null}
                  aria-label="Start demo call"
                  className="mt-6 rounded-full bg-ember px-6 py-3 text-sm font-medium text-ink"
                >
                  {busy ? "Connecting…" : "Start Demo Call"}
                </button>
                <div className="mx-auto mt-8 max-w-md text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-ember">Example scenario</p>
                  <p className="mt-2 text-sm leading-6 text-paper/70">
                    yes → no → HVAC → My AC isn&apos;t cooling → 560001 → Bengaluru → yes → callback
                    tomorrow 10 AM
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <CallMark live={liveVoice} enabled={voiceEnabled} compact />
                  {liveVoice ? (
                    <button type="button" onClick={endVoice} className="text-sm text-ember">
                      End voice call
                    </button>
                  ) : null}
                </div>
                <ol className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-wide text-paper/55">
                  {INTAKE_STEPS.map((step, index) => {
                    const done = index < activeStep;
                    const current = index === activeStep && !complete;
                    return (
                      <li key={step.id} className={done || current ? "text-paper" : undefined} aria-current={current ? "step" : undefined}>
                        {step.label}
                        {index < INTAKE_STEPS.length - 1 ? <span className="mx-2 text-paper/30">→</span> : null}
                      </li>
                    );
                  })}
                </ol>
                <div
                  ref={logRef}
                  className="max-h-[28rem] min-h-[18rem] space-y-4 overflow-y-auto px-4 py-5"
                  role="log"
                  aria-live="polite"
                  aria-label="Call transcript"
                >
                  {lines.map((line, index) => (
                    <div key={index} className={line.role === "caller" ? "sm:ml-8" : "sm:mr-8"}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ember">
                        {line.role === "assistant" ? "Assistant" : "Caller"}
                      </p>
                      <p className="mt-1 rounded-lg border border-white/10 px-3 py-2 text-sm leading-6">
                        {line.text}
                      </p>
                    </div>
                  ))}
                </div>
                {!liveVoice ? (
                  <form onSubmit={send} className="flex flex-col gap-2 border-t border-white/10 p-4 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="caller-input" className="text-xs uppercase tracking-[0.16em] text-paper/55">
                        Your reply as the caller
                      </label>
                      <input
                        id="caller-input"
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        disabled={complete || busy}
                        placeholder={complete ? "Call complete" : "Type what the caller would say"}
                        className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm outline-none placeholder:text-paper/40"
                      />
                    </div>
                    <button type="submit" className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-ink" disabled={complete || busy}>
                      Send
                    </button>
                  </form>
                ) : (
                  <p className="border-t border-white/10 px-4 py-3 text-sm text-paper/70">
                    Speak now. Your microphone is on.
                  </p>
                )}
              </div>
            )}

            {error ? (
              <div className="mt-4">
                <ErrorBanner message={error} />
              </div>
            ) : null}

            {complete && callId ? (
              <Link
                href={`/dispatcher/calls/${callId}`}
                className="mt-6 inline-flex rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-ink"
              >
                View Dispatcher Receipt
              </Link>
            ) : callId && !liveVoice && uiStatus === "Completed" ? (
              <Link
                href={`/dispatcher/calls/${callId}`}
                className="mt-6 inline-flex rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-ink"
              >
                View Dispatcher Receipt
              </Link>
            ) : null}
          </section>

          <aside className="space-y-6 text-sm text-paper/75">
            <section aria-labelledby="constraints-heading">
              <h2 id="constraints-heading" className="text-xs uppercase tracking-[0.2em] text-ember">
                Safety constraints
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-4">
                <li>No diagnosis, price, or confirmed booking.</li>
                <li>Danger stops routine intake.</li>
                <li>Unsupported ZIP never promises coverage.</li>
                <li>Asking for a person requests handoff.</li>
              </ul>
            </section>
            <Notice>
              {voiceEnabled
                ? "POC demonstration. Fictional information only. Browser microphone via Vapi. No live transfer or CRM write."
                : "POC demonstration. Fictional information only. No live phone line or CRM write. Typed fallback until Vapi keys are set."}
            </Notice>
            <Link href="/demo" className="inline-block text-paper underline">
              Run a scripted scenario
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}

function CallMark({ live, enabled, compact = false }: { live: boolean; enabled: boolean; compact?: boolean }) {
  const size = compact ? "h-10 w-10" : "h-28 w-28";
  const inner = compact ? "h-7 w-7" : "h-16 w-16";
  return (
    <div
      className={`mx-auto flex items-center justify-center rounded-full border ${size} ${
        live ? "border-ember" : "border-ember/40"
      }`}
      aria-hidden="true"
    >
      <div className={`flex items-center justify-center rounded-full border border-ember/70 ${inner}`}>
        <svg width={compact ? 16 : 28} height={compact ? 16 : 28} viewBox="0 0 24 24" fill="none" className="text-ember">
          <path
            d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M7 11a5 5 0 0 0 10 0M12 16v3M9 19h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          {!enabled && !live ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" /> : null}
        </svg>
      </div>
    </div>
  );
}
