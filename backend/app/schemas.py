from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool
    env: str
    voice: str
    service_area: bool


class ServiceAreaResponse(BaseModel):
    status: str
    zip: str | None = None


class CallSummary(BaseModel):
    call_id: str
    created_at: datetime
    status: str
    trade: str | None
    issue_category: str | None
    zip: str | None
    location: str | None = None
    urgency: str
    disposition: str | None
    handoff_requested: bool
    failure_code: str | None
    scenario: str | None = None


class CallEventOut(BaseModel):
    event_type: str
    status: str
    created_at: datetime
    failure_code: str | None = None


class CallDetail(CallSummary):
    provider_call_id: str | None
    location: str | None
    callback_confirmed: bool | None
    preferred_next_action: str | None
    handoff_reason: str | None
    last_assistant_text: str | None
    receipt: dict[str, Any] | None
    events: list[CallEventOut]


class TurnRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class TurnResponse(BaseModel):
    call_id: str
    assistant_text: str
    status: str
    complete: bool
    receipt: dict[str, Any] | None = None


class ScenarioRequest(BaseModel):
    scenario: str


class DemoStartRequest(BaseModel):
    scenario: str | None = None


class TranscriptLine(BaseModel):
    role: str
    text: str = ""


class CompleteRequest(BaseModel):
    transcript: list[TranscriptLine] = Field(default_factory=list)


class VoiceConfigResponse(BaseModel):
    enabled: bool
    publicKey: str | None = None
    assistantId: str | None = None
    assistant: dict[str, Any] | None = None
    mode: str
