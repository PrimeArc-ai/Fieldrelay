from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Call, CallEvent, Receipt
from app.services.service_area import UNAVAILABLE, UNSUPPORTED, service_area_service

DISCLOSURE_TEXT = (
    "Hi, you've reached the after-hours assistant. I'm an AI assistant. "
    "Is it okay if I ask you a few questions?"
)
DANGER_QUESTION = (
    "Before we continue: is anyone in immediate danger — gas smell, fire, flooding, "
    "or another emergency?"
)
TRADE_QUESTION = "What type of service do you need — HVAC or plumbing?"
ISSUE_QUESTION = "What seems to be the problem?"
ZIP_QUESTION = "What is the ZIP code for the property?"
LOCATION_QUESTION = "What city or area is the property in?"
CALLBACK_QUESTION = "Can the dispatcher call you back at the number you're calling from?"
NEXT_ACTION_QUESTION = "What would you like the dispatcher to do next — a callback, or a visit if they can arrange one?"

DANGER_RE = re.compile(
    r"\b(gas smell|smell(?:s|ing)? gas|fire|flames?|major flood|flooding|"
    r"carbon monoxide|\bco leak\b|explosion|electrical fire|can't breathe|"
    r"cannot breathe|active water leak|burst pipe)\b",
    re.I,
)
HUMAN_RE = re.compile(
    r"\b(speak to (?:a )?human|real person|actual person|operator|"
    r"dispatcher|transfer me|talk to someone|speak to someone)\b",
    re.I,
)
INJECTION_RE = re.compile(
    r"\b(ignore (?:your |all )?instructions|system prompt|reveal (?:your )?(?:prompt|instructions)|"
    r"show (?:me )?(?:your )?system prompt)\b",
    re.I,
)
CONFIRMATION_RE = re.compile(
    r"\b(appointment is confirmed|confirm(?:ed)? (?:my )?appointment|"
    r"just (?:tell|say) (?:me )?(?:it'?s|is) confirmed|booked for sure|guaranteed booking)\b",
    re.I,
)
AFFIRM_RE = re.compile(r"\b(yes|yeah|yep|ok|okay|sure|please|go ahead|that's fine|thats fine)\b", re.I)
DENY_RE = re.compile(r"\b(no|nope|not okay|don't|do not|stop)\b", re.I)
ZIP_RE = re.compile(r"\b(\d{5,6})\b")
ZIP_SPACED_RE = re.compile(r"\b(\d{3})\s+(\d{3})\b")
PRICE_RE = re.compile(r"\b(how much|price|estimate|quote|cost)\b", re.I)
END_CALL_RE = re.compile(
    r"\b(end (the |this )?call|hang up|goodbye|good bye|that's all|thats all|end it)\b",
    re.I,
)
CALLBACK_RE = re.compile(r"\b(call(?: me)? back|callback|please call|you can call)\b", re.I)
TIME_RE = re.compile(
    r"\b("
    r"tomorrow(?:\s+(?:morning|afternoon|evening|night))?(?:\s+around)?(?:\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))?"
    r"|tonight|this (?:morning|afternoon|evening)"
    r"|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)"
    r"|as soon as possible|\basap\b"
    r")\b",
    re.I,
)
CITY_RE = re.compile(
    r"\b(bengaluru|bangalore|mumbai|delhi|new delhi|hyderabad|chennai|pune|kolkata|"
    r"whitefield|koramangala|indiranagar|jayanagar)\b",
    re.I,
)
IN_PLACE_RE = re.compile(r"\bin ([a-z][a-z]+(?:\s+[a-z]+){0,2})\b", re.I)

ISSUE_MAP = (
    (re.compile(r"water leak|leaking|\bflood", re.I), "WATER_LEAK"),
    (re.compile(r"\b(?:ac|air.?cond|not cooling|isn't cooling|isnt cooling|no cooling)\b", re.I), "AC_NOT_COOLING"),
    (re.compile(r"no heat|not heating|\bfurnace\b", re.I), "NO_HEAT"),
    (re.compile(r"drain|clog", re.I), "DRAIN_CLOG"),
    (re.compile(r"\bgas\b", re.I), "GAS_ISSUE"),
    (re.compile(r"toilet", re.I), "TOILET_ISSUE"),
)

TRADE_FROM_ISSUE = {
    "WATER_LEAK": "PLUMBING",
    "DRAIN_CLOG": "PLUMBING",
    "TOILET_ISSUE": "PLUMBING",
    "AC_NOT_COOLING": "HVAC",
    "NO_HEAT": "HVAC",
}

ZIP_CITIES = {
    "560001": "Bengaluru",
    "560002": "Bengaluru",
    "560003": "Bengaluru",
    "560004": "Bengaluru",
}

_DIGIT_WORDS = {
    "zero": "0",
    "oh": "0",
    "o": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
}

LOCATION_STOP = frozenset(
    {
        "the",
        "this",
        "that",
        "need",
        "help",
        "please",
        "yes",
        "yeah",
        "okay",
        "ok",
        "danger",
        "immediate",
        "service",
        "area",
        "call",
        "back",
        "my",
        "our",
        "hvac",
        "plumbing",
        "house",
        "home",
        "trouble",
        "problem",
    }
)

CALLER_ROLES = frozenset({"caller", "user", "customer"})


@dataclass
class TurnResult:
    assistant_text: str
    complete: bool


class CallEngine:
    """Deterministic operational outcomes. Caller text supplies facts, not dispositions."""

    def start(self, db: Session, *, scenario: str | None = None, provider_call_id: str | None = None) -> Call:
        call = Call(
            id=f"call_{uuid.uuid4().hex[:10]}",
            provider_call_id=provider_call_id,
            status="DISCLOSURE",
            scenario=scenario,
            last_assistant_text=DISCLOSURE_TEXT,
        )
        db.add(call)
        _event(db, call, "CALL_STARTED", "CALL_STARTED")
        _event(db, call, "DISCLOSURE", "DISCLOSURE")
        db.commit()
        db.refresh(call)
        return call

    def fail_provider(self, db: Session, *, scenario: str | None = "provider_failure") -> Call:
        call = Call(
            id=f"call_{uuid.uuid4().hex[:10]}",
            status="CALL_COMPLETED",
            urgency="routine",
            disposition="provider_failure",
            failure_code="PROVIDER_UNAVAILABLE",
            scenario=scenario,
            last_assistant_text=(
                "I'm sorry — the voice assistant is unavailable right now. "
                "I've recorded this as a provider failure so a dispatcher can call you back."
            ),
        )
        db.add(call)
        _event(db, call, "CALL_STARTED", "CALL_STARTED")
        _event(db, call, "PROVIDER_FAILURE", "PROVIDER_FAILURE", failure_code="PROVIDER_UNAVAILABLE")
        _write_receipt(db, call)
        db.commit()
        db.refresh(call)
        return call

    def handle_turn(self, db: Session, call: Call, user_text: str) -> TurnResult:
        text = user_text.strip()
        if call.status == "CALL_COMPLETED":
            return TurnResult(call.last_assistant_text or "This call is already complete.", True)

        if INJECTION_RE.search(text):
            _event(db, call, "PROMPT_INJECTION_BLOCKED", call.status)
            reply = (
                "I can't share internal instructions or change safety policy. "
                + (call.last_assistant_text or DISCLOSURE_TEXT)
            )
            call.last_assistant_text = reply
            db.commit()
            return TurnResult(reply, False)

        if DANGER_RE.search(text):
            return self._handoff(db, call, reason="danger", urgency="urgent", issue_hint=text)

        if HUMAN_RE.search(text):
            return self._handoff(db, call, reason="explicit_human_request", urgency=call.urgency or "routine")

        if CONFIRMATION_RE.search(text):
            reply = (
                "I can't confirm an appointment, price, or service. "
                "The dispatcher has to confirm any next step. "
                + self._next_question(call)
            )
            call.last_assistant_text = reply
            _event(db, call, "FAKE_CONFIRMATION_REFUSED", call.status)
            db.commit()
            return TurnResult(reply, False)

        if PRICE_RE.search(text):
            reply = (
                "I don't give prices or estimates. I can capture the request for the dispatcher. "
                + self._next_question(call)
            )
            call.last_assistant_text = reply
            db.commit()
            return TurnResult(reply, False)

        if END_CALL_RE.search(text):
            return self.close(db, call)

        self._ingest_facts(call, text)

        if call.status == "DISCLOSURE":
            declined = (
                DENY_RE.search(text)
                and not AFFIRM_RE.search(text)
                and not call.issue_category
                and not call.zip
            )
            if declined:
                return self._handoff(db, call, reason="disclosure_declined", urgency="routine")
            if AFFIRM_RE.search(text) or call.issue_category or call.zip:
                call.status = "DANGER_SCREEN"
                call.last_assistant_text = DANGER_QUESTION
                _event(db, call, "DANGER_SCREEN", "DANGER_SCREEN")
                db.commit()
                return TurnResult(DANGER_QUESTION, False)
            call.last_assistant_text = DISCLOSURE_TEXT
            db.commit()
            return TurnResult(DISCLOSURE_TEXT, False)

        if call.status == "DANGER_SCREEN":
            short_yes = AFFIRM_RE.search(text) and not DENY_RE.search(text) and len(text.split()) <= 3
            if short_yes:
                return self._handoff(db, call, reason="danger", urgency="urgent")
            call.status = "QUALIFICATION"
            call.last_assistant_text = TRADE_QUESTION
            _event(db, call, "QUALIFICATION", "QUALIFICATION")
            db.commit()
            return TurnResult(TRADE_QUESTION, False)

        if call.status in {"QUALIFICATION", "SERVICE_AREA_CHECK", "NEXT_ACTION"}:
            missing = self._missing_field(call)
            if missing is not None:
                question = self._question_for(missing)
                call.last_assistant_text = question
                db.commit()
                return TurnResult(question, False)
            return self._finalize(db, call)

        db.commit()
        return TurnResult(call.last_assistant_text or DISCLOSURE_TEXT, False)

    def close(
        self,
        db: Session,
        call: Call,
        *,
        caller_texts: list[str] | None = None,
        transcript: list[dict] | None = None,
    ) -> TurnResult:
        """End the call and always write a receipt. Never invent a confirmed booking."""
        lines = _normalize_transcript(transcript)
        texts = list(caller_texts or [])
        texts.extend(_caller_texts(lines))
        was_complete = call.status == "CALL_COMPLETED"
        prior_disposition = call.disposition

        if was_complete and not texts and not lines:
            return TurnResult(call.last_assistant_text or "This call is already complete.", True)

        for text in texts:
            self._ingest_facts(call, text, unconstrained=True)

        combined = " ".join(texts)
        if combined and DANGER_RE.search(combined) and call.disposition != "handoff_requested":
            return self._handoff(db, call, reason="danger", urgency="urgent", issue_hint=combined, transcript=lines)
        if combined and HUMAN_RE.search(combined) and call.disposition != "handoff_requested":
            return self._handoff(
                db,
                call,
                reason="explicit_human_request",
                urgency=call.urgency or "routine",
                transcript=lines,
            )

        self._infer_defaults(call)

        if self._ready_to_finalize(call):
            if was_complete and prior_disposition in {"provisional_callback", "unsupported_area"}:
                _write_receipt(db, call, transcript=lines)
                db.commit()
                return TurnResult(call.last_assistant_text or "This call is already complete.", True)
            return self._finalize(db, call, transcript=lines)

        if not was_complete:
            call.disposition = "manual_review"
            call.status = "CALL_COMPLETED"
            call.last_assistant_text = (
                "The call has ended. I've saved a dispatcher receipt from what was captured. "
                "This is not a confirmed appointment, estimate, or service promise."
            )
            _event(db, call, "CALL_ENDED", "MANUAL_REVIEW")
        _write_receipt(db, call, transcript=lines)
        db.commit()
        return TurnResult(call.last_assistant_text, True)

    def _ingest_facts(self, call: Call, text: str, *, unconstrained: bool = False) -> None:
        missing = self._missing_field(call)
        lower = text.lower()

        zip_code = _extract_zip(text)
        if zip_code:
            call.zip = zip_code

        if call.trade is None:
            if re.search(r"\bhvac\b|\bheat(?:ing)?\b|air.?cond|\bac\b", lower):
                call.trade = "HVAC"
            elif re.search(r"plumb", lower):
                call.trade = "PLUMBING"

        if call.issue_category is None:
            for pattern, category in ISSUE_MAP:
                if pattern.search(text):
                    call.issue_category = category
                    break
            if call.issue_category is None and missing == "issue_category" and len(text) > 3:
                call.issue_category = re.sub(r"\W+", "_", text).strip("_").upper()[:48]

        self._infer_trade(call)

        if call.location is None:
            place = _extract_location(text)
            if place:
                call.location = place
            elif not unconstrained and missing == "location":
                cleaned = ZIP_RE.sub("", text).strip(" ,.")
                if cleaned and not AFFIRM_RE.fullmatch(cleaned) and len(cleaned) > 1:
                    call.location = cleaned[:128]

        if call.callback_confirmed is None:
            if CALLBACK_RE.search(text) and not DENY_RE.search(text):
                call.callback_confirmed = True
            elif missing == "callback_confirmed":
                if AFFIRM_RE.search(text) and not DENY_RE.search(text):
                    call.callback_confirmed = True
                elif DENY_RE.search(text):
                    call.callback_confirmed = False

        if call.preferred_next_action is None:
            time_match = TIME_RE.search(text)
            if time_match:
                call.preferred_next_action = time_match.group(0)[:128]
            elif CALLBACK_RE.search(text):
                call.preferred_next_action = "callback"
            elif missing == "preferred_next_action" and len(text) > 2 and not AFFIRM_RE.fullmatch(text.strip()):
                call.preferred_next_action = text[:128]

    def _infer_trade(self, call: Call) -> None:
        if call.trade is None and call.issue_category:
            call.trade = TRADE_FROM_ISSUE.get(call.issue_category)

    def _infer_defaults(self, call: Call) -> None:
        self._infer_trade(call)
        if call.location is None and call.zip:
            call.location = ZIP_CITIES.get(call.zip)
        if call.issue_category:
            if call.callback_confirmed is None:
                call.callback_confirmed = True
            if not call.preferred_next_action:
                call.preferred_next_action = "callback"

    def _ready_to_finalize(self, call: Call) -> bool:
        return bool(
            call.trade
            and call.issue_category
            and call.zip
            and call.callback_confirmed is not None
            and call.preferred_next_action
        )

    def _missing_field(self, call: Call) -> str | None:
        if not call.trade:
            return "trade"
        if not call.issue_category:
            return "issue_category"
        if not call.zip:
            return "zip"
        if not call.location:
            return "location"
        if call.callback_confirmed is None:
            return "callback_confirmed"
        if not call.preferred_next_action:
            return "preferred_next_action"
        return None

    def _question_for(self, field: str) -> str:
        return {
            "trade": TRADE_QUESTION,
            "issue_category": ISSUE_QUESTION,
            "zip": ZIP_QUESTION,
            "location": LOCATION_QUESTION,
            "callback_confirmed": CALLBACK_QUESTION,
            "preferred_next_action": NEXT_ACTION_QUESTION,
        }[field]

    def _next_question(self, call: Call) -> str:
        if call.status == "DISCLOSURE":
            return DISCLOSURE_TEXT
        if call.status == "DANGER_SCREEN":
            return DANGER_QUESTION
        missing = self._missing_field(call)
        if missing:
            return self._question_for(missing)
        return NEXT_ACTION_QUESTION

    def _handoff(
        self,
        db: Session,
        call: Call,
        *,
        reason: str,
        urgency: str,
        issue_hint: str | None = None,
        transcript: list[dict] | None = None,
    ) -> TurnResult:
        if issue_hint and call.issue_category is None:
            for pattern, category in ISSUE_MAP:
                if pattern.search(issue_hint):
                    call.issue_category = category
                    break
            if reason == "danger" and call.issue_category is None:
                call.issue_category = "POSSIBLE_EMERGENCY"
        call.urgency = urgency
        call.handoff_requested = True
        call.handoff_reason = reason
        call.disposition = "handoff_requested"
        call.status = "CALL_COMPLETED"
        if reason == "danger":
            reply = (
                "I'm stopping routine intake. If this is an emergency, contact local emergency services. "
                "I've flagged this for an urgent human handoff. A dispatcher will follow up."
            )
        else:
            reply = (
                "I'll request a human handoff now. I won't keep you in an automated loop. "
                "A dispatcher will take it from here."
            )
        call.last_assistant_text = reply
        _event(db, call, "HANDOFF_REQUESTED", "HANDOFF_REQUESTED")
        _write_receipt(db, call, transcript=transcript)
        db.commit()
        return TurnResult(reply, True)

    def _finalize(self, db: Session, call: Call, transcript: list[dict] | None = None) -> TurnResult:
        call.status = "SERVICE_AREA_CHECK"
        result = service_area_service.check(call.zip)
        _event(
            db,
            call,
            "SERVICE_AREA_CHECK",
            result.status.upper(),
            failure_code="SERVICE_AREA_UNAVAILABLE" if result.status == UNAVAILABLE else None,
        )

        if result.status == UNAVAILABLE:
            call.disposition = "manual_review"
            call.failure_code = "SERVICE_AREA_UNAVAILABLE"
            call.status = "CALL_COMPLETED"
            reply = (
                "I couldn't confirm service coverage just now, so I won't promise that we serve this area. "
                "I've sent this for manual review. A dispatcher will confirm next steps."
            )
        elif result.status == UNSUPPORTED:
            call.disposition = "unsupported_area"
            call.status = "CALL_COMPLETED"
            reply = (
                f"I don't show {call.zip} as a supported service area, so I can't promise a visit or booking. "
                "I've recorded this for the dispatcher to review."
            )
        else:
            call.disposition = "provisional_callback"
            call.status = "CALL_COMPLETED"
            reply = (
                "I've recorded your preferred time for the dispatcher to confirm. "
                "This is not a confirmed appointment, estimate, or service promise."
            )

        call.last_assistant_text = reply
        _write_receipt(db, call, transcript=transcript)
        db.commit()
        return TurnResult(reply, True)


def _event(db: Session, call: Call, event_type: str, status: str, failure_code: str | None = None) -> None:
    db.add(CallEvent(call_id=call.id, event_type=event_type, status=status, failure_code=failure_code))


def _normalize_transcript(transcript: list[dict] | None) -> list[dict]:
    lines: list[dict] = []
    for item in transcript or []:
        role = str(item.get("role") or "").strip().lower()
        text = str(item.get("text") or "").strip()
        if role and text:
            lines.append({"role": role, "text": text})
    return lines


def _caller_texts(transcript: list[dict]) -> list[str]:
    return [line["text"] for line in transcript if line.get("role") in CALLER_ROLES]


def _extract_zip(text: str) -> str | None:
    match = ZIP_RE.search(text)
    if match:
        return match.group(1)
    spaced = ZIP_SPACED_RE.search(text)
    if spaced:
        return f"{spaced.group(1)}{spaced.group(2)}"
    digits: list[str] = []
    runs: list[str] = []
    for word in re.findall(r"[a-z]+", text.lower()):
        if word in _DIGIT_WORDS:
            digits.append(_DIGIT_WORDS[word])
            continue
        if len(digits) >= 5:
            runs.append("".join(digits))
        digits = []
    if len(digits) >= 5:
        runs.append("".join(digits))
    for run in runs:
        if len(run) in {5, 6}:
            return run
        if len(run) > 6:
            return run[:6]
    return None


def _extract_location(text: str) -> str | None:
    city = CITY_RE.search(text)
    if city:
        return city.group(1).title()[:128]
    place = IN_PLACE_RE.search(text)
    if not place:
        return None
    candidate = place.group(1).strip()
    first = candidate.split()[0].lower()
    if first in LOCATION_STOP or candidate.lower() in LOCATION_STOP:
        return None
    if AFFIRM_RE.fullmatch(candidate) or DENY_RE.fullmatch(candidate):
        return None
    return candidate.title()[:128]


def _write_receipt(db: Session, call: Call, transcript: list[dict] | None = None) -> None:
    payload = {
        "call_id": call.id,
        "trade": call.trade,
        "issue_category": call.issue_category,
        "location": call.location,
        "zip": call.zip,
        "service_area_status": _service_area_status(call),
        "urgency": call.urgency,
        "callback_confirmed": call.callback_confirmed,
        "preferred_next_action": call.preferred_next_action,
        "disposition": call.disposition,
        "handoff_requested": call.handoff_requested,
        "handoff_reason": call.handoff_reason,
        "failure_code": call.failure_code,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }
    existing = db.query(Receipt).filter(Receipt.call_id == call.id).one_or_none()
    if transcript:
        payload["transcript"] = transcript
    elif existing:
        try:
            previous = json.loads(existing.payload)
        except json.JSONDecodeError:
            previous = {}
        if previous.get("transcript"):
            payload["transcript"] = previous["transcript"]
    encoded = json.dumps(payload)
    if existing:
        existing.payload = encoded
    else:
        db.add(Receipt(call_id=call.id, payload=encoded))
        _event(db, call, "RECEIPT", "CALL_COMPLETED", failure_code=call.failure_code)


def _service_area_status(call: Call) -> str | None:
    if call.disposition == "unsupported_area":
        return "unsupported"
    if call.failure_code == "SERVICE_AREA_UNAVAILABLE":
        return "unavailable"
    if call.zip and call.disposition == "provisional_callback":
        return "supported"
    if call.zip:
        return service_area_service.check(call.zip).status
    return None


engine = CallEngine()
