export type CallSummary = {
  call_id: string;
  created_at: string;
  status: string;
  trade: string | null;
  issue_category: string | null;
  zip: string | null;
  location: string | null;
  urgency: string;
  disposition: string | null;
  handoff_requested: boolean;
  failure_code: string | null;
  scenario: string | null;
};

export type CallEvent = {
  event_type: string;
  status: string;
  created_at: string;
  failure_code: string | null;
};

export type CallDetail = CallSummary & {
  provider_call_id: string | null;
  location: string | null;
  callback_confirmed: boolean | null;
  preferred_next_action: string | null;
  handoff_reason: string | null;
  last_assistant_text: string | null;
  receipt: Record<string, unknown> | null;
  events: CallEvent[];
};

export type TurnResponse = {
  call_id: string;
  assistant_text: string;
  status: string;
  complete: boolean;
  receipt: Record<string, unknown> | null;
};

export type VoiceConfig = {
  enabled: boolean;
  publicKey: string | null;
  assistantId: string | null;
  assistant: Record<string, unknown> | null;
  mode: "vapi" | "typed";
};

const API = "/backend-api";

async function parse<T>(request: Promise<Response>): Promise<T> {
  const response = await request;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => parse<{ ok: boolean; voice: string }>(fetch(`${API}/health`)),
  voiceConfig: () => parse<VoiceConfig>(fetch(`${API}/demo/voice`)),
  calls: () => parse<CallSummary[]>(fetch(`${API}/calls`)),
  call: (id: string) => parse<CallDetail>(fetch(`${API}/calls/${id}`)),
  scenarios: () => parse<{ id: string; label: string }[]>(fetch(`${API}/demo/scenarios`)),
  runScenario: (scenario: string) =>
    parse<CallDetail>(
      fetch(`${API}/demo/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      })
    ),
  reset: () => parse<{ ok: boolean }>(fetch(`${API}/demo/reset`, { method: "POST" })),
  startCall: () =>
    parse<TurnResponse>(
      fetch(`${API}/demo/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "interactive" }),
      })
    ),
  turn: (callId: string, text: string) =>
    parse<TurnResponse>(
      fetch(`${API}/demo/calls/${callId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
    ),
  completeCall: (callId: string, transcript: { role: string; text: string }[] = []) =>
    parse<TurnResponse>(
      fetch(`${API}/demo/calls/${callId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })
    ),
};
