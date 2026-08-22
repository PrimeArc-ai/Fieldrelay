import type { CallDetail, CallEvent, CallSummary } from "./api";

export function prettyLabel(value?: string | null): string {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type OutcomeTone = "callback" | "handoff" | "review" | "unsupported" | "failed" | "neutral";

export function outcomeLabel(call: Pick<CallSummary, "disposition" | "handoff_requested" | "failure_code"> & { handoff_reason?: string | null }): string {
  if (call.failure_code || call.disposition === "provider_failure") return "Failed";
  if (call.disposition === "unsupported_area") return "Unsupported Area";
  if (call.disposition === "manual_review") return "Manual Review";
  if (call.disposition === "provisional_callback") return "Provisional Callback";
  if (call.disposition === "handoff_requested") {
    return call.handoff_reason === "danger" ? "Safety Stop" : "Human Handoff";
  }
  return prettyLabel(call.disposition);
}

export function outcomeTone(call: Pick<CallSummary, "disposition" | "failure_code">): OutcomeTone {
  if (call.failure_code || call.disposition === "provider_failure") return "failed";
  if (call.disposition === "unsupported_area") return "unsupported";
  if (call.disposition === "manual_review") return "review";
  if (call.disposition === "provisional_callback") return "callback";
  if (call.disposition === "handoff_requested") return "handoff";
  return "neutral";
}

export function intakeSummary(call: CallDetail): string {
  const sentences: string[] = [];
  const issue = call.issue_category ? prettyLabel(call.issue_category).toLowerCase() : null;

  if (call.trade && issue) {
    sentences.push(`Customer is requesting ${call.trade} service for ${issue}.`);
  } else if (call.trade) {
    sentences.push(`Customer is requesting ${call.trade} service.`);
  } else if (issue) {
    sentences.push(`Customer reported ${issue}.`);
  }

  const area = typeof call.receipt?.service_area_status === "string" ? call.receipt.service_area_status : null;
  if (area === "supported") {
    sentences.push("The service area was validated successfully.");
  } else if (area === "unsupported") {
    sentences.push("The ZIP is outside the supported service area.");
  } else if (area === "unavailable") {
    sentences.push("Service-area validation could not be confirmed.");
  }

  if (call.handoff_reason === "danger") {
    sentences.push("Routine intake stopped for a safety concern and a human handoff was requested.");
  } else if (call.handoff_reason === "explicit_human_request") {
    sentences.push("The caller asked to speak with a person.");
  } else if (call.handoff_reason === "disclosure_declined") {
    sentences.push("The caller declined AI intake.");
  } else if (call.callback_confirmed === true) {
    sentences.push("The caller requested a callback.");
  }

  if (call.preferred_next_action) {
    sentences.push(`Preferred next action recorded: ${call.preferred_next_action}.`);
  }
  if (call.failure_code === "PROVIDER_UNAVAILABLE") {
    sentences.push("The voice provider was unavailable.");
  }
  if (call.failure_code === "SERVICE_AREA_UNAVAILABLE") {
    sentences.push("Coverage was not promised.");
  }

  return sentences.join(" ") || "No additional intake details were captured.";
}

const EVENT_LABELS: Record<string, string> = {
  CALL_STARTED: "Call started",
  DISCLOSURE: "Disclosure",
  DANGER_SCREEN: "Safety screening",
  QUALIFICATION: "Qualification",
  SERVICE_AREA_CHECK: "Service-area validation",
  HANDOFF_REQUESTED: "Handoff requested",
  RECEIPT: "Call completed",
  PROVIDER_FAILURE: "Provider failure",
  PROMPT_INJECTION_BLOCKED: "Policy held",
  FAKE_CONFIRMATION_REFUSED: "Confirmation refused",
};

export function eventLabel(event: CallEvent): string {
  if (event.event_type === "HANDOFF_REQUESTED" && event.status === "HANDOFF_REQUESTED") {
    return "Handoff requested";
  }
  if (event.event_type === "SERVICE_AREA_CHECK" && event.status === "SUPPORTED") {
    return "Service-area validation";
  }
  return EVENT_LABELS[event.event_type] || prettyLabel(event.event_type);
}

export const INTAKE_STEPS = [
  { id: "DISCLOSURE", label: "Disclosure" },
  { id: "DANGER_SCREEN", label: "Safety" },
  { id: "QUALIFICATION", label: "Qualification" },
  { id: "SERVICE_AREA_CHECK", label: "Service Area" },
  { id: "NEXT_ACTION", label: "Next Action" },
] as const;

export function stepIndex(status: string, complete: boolean): number {
  if (complete) return INTAKE_STEPS.length;
  const order = ["DISCLOSURE", "DANGER_SCREEN", "QUALIFICATION", "SERVICE_AREA_CHECK", "NEXT_ACTION"];
  const index = order.indexOf(status);
  return index < 0 ? 0 : index;
}

export type DispatcherFilter = "all" | "callback" | "handoff" | "review" | "unsupported" | "failed";

export function matchesFilter(call: CallSummary, filter: DispatcherFilter): boolean {
  if (filter === "all") return true;
  if (filter === "callback") return call.disposition === "provisional_callback";
  if (filter === "handoff") return call.disposition === "handoff_requested";
  if (filter === "review") return call.disposition === "manual_review";
  if (filter === "unsupported") return call.disposition === "unsupported_area";
  return Boolean(call.failure_code) || call.disposition === "provider_failure";
}

export function matchesQuery(call: CallSummary, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [
    call.call_id,
    call.trade,
    call.issue_category,
    call.zip,
    call.location,
    call.disposition,
    call.urgency,
    call.failure_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
