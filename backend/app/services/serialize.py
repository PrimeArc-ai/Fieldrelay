import json

from app.models import Call, CallEvent, Receipt
from app.schemas import CallDetail, CallEventOut, CallSummary


def call_summary(call: Call) -> CallSummary:
    return CallSummary(
        call_id=call.id,
        created_at=call.created_at,
        status=call.status,
        trade=call.trade,
        issue_category=call.issue_category,
        zip=call.zip,
        location=call.location,
        urgency=call.urgency,
        disposition=call.disposition,
        handoff_requested=call.handoff_requested,
        failure_code=call.failure_code,
        scenario=call.scenario,
    )


def call_detail(call: Call, events: list[CallEvent], receipt: Receipt | None) -> CallDetail:
    payload = json.loads(receipt.payload) if receipt else None
    return CallDetail(
        **call_summary(call).model_dump(),
        provider_call_id=call.provider_call_id,
        callback_confirmed=call.callback_confirmed,
        preferred_next_action=call.preferred_next_action,
        handoff_reason=call.handoff_reason,
        last_assistant_text=call.last_assistant_text,
        receipt=payload,
        events=[
            CallEventOut(
                event_type=event.event_type,
                status=event.status,
                created_at=event.created_at,
                failure_code=event.failure_code,
            )
            for event in events
        ],
    )
