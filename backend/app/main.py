from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, init_db
from app.models import Call, CallEvent, Receipt
from app.schemas import (
    CompleteRequest,
    DemoStartRequest,
    HealthResponse,
    ScenarioRequest,
    ServiceAreaResponse,
    TurnRequest,
    TurnResponse,
    VoiceConfigResponse,
)
from app.services.scenarios import list_scenarios, run_scenario
from app.services.serialize import call_detail, call_summary
from app.services.service_area import service_area_service
from app.services.state_machine import engine
from app.services.vapi_voice import voice_config

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FieldRelay POC", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    voice = "vapi" if settings.vapi_public_key.strip() else "simulated"
    return HealthResponse(ok=True, env=settings.fieldrelay_env, voice=voice, service_area=True)


@app.get("/api/service-area", response_model=ServiceAreaResponse)
def service_area(zip: str) -> ServiceAreaResponse:
    result = service_area_service.check(zip)
    return ServiceAreaResponse(status=result.status, zip=result.zip)


@app.get("/api/calls")
def list_calls(db: Session = Depends(get_db)):
    calls = db.query(Call).order_by(Call.created_at.desc()).limit(50).all()
    return [call_summary(call) for call in calls]


@app.get("/api/calls/{call_id}")
def get_call(call_id: str, db: Session = Depends(get_db)):
    call = db.get(Call, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    events = db.query(CallEvent).filter(CallEvent.call_id == call_id).order_by(CallEvent.id.asc()).all()
    receipt = db.query(Receipt).filter(Receipt.call_id == call_id).one_or_none()
    return call_detail(call, events, receipt)


@app.get("/api/demo/voice", response_model=VoiceConfigResponse)
def demo_voice() -> VoiceConfigResponse:
    return VoiceConfigResponse(**voice_config())


@app.post("/api/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    db.query(Receipt).delete()
    db.query(CallEvent).delete()
    db.query(Call).delete()
    db.commit()
    service_area_service.reset()
    return {"ok": True}


@app.get("/api/demo/scenarios")
def demo_scenarios():
    return list_scenarios()


@app.post("/api/demo/scenario")
def demo_scenario(body: ScenarioRequest, db: Session = Depends(get_db)):
    try:
        call = run_scenario(db, body.scenario)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    events = db.query(CallEvent).filter(CallEvent.call_id == call.id).order_by(CallEvent.id.asc()).all()
    receipt = db.query(Receipt).filter(Receipt.call_id == call.id).one_or_none()
    return call_detail(call, events, receipt)


@app.post("/api/demo/calls", response_model=TurnResponse)
def demo_start(body: DemoStartRequest | None = None, db: Session = Depends(get_db)):
    call = engine.start(db, scenario=(body.scenario if body else None) or "interactive")
    return TurnResponse(
        call_id=call.id,
        assistant_text=call.last_assistant_text or "",
        status=call.status,
        complete=False,
    )


@app.post("/api/demo/calls/{call_id}/turn", response_model=TurnResponse)
def demo_turn(call_id: str, body: TurnRequest, db: Session = Depends(get_db)):
    call = db.get(Call, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    result = engine.handle_turn(db, call, body.text)
    db.refresh(call)
    receipt = db.query(Receipt).filter(Receipt.call_id == call_id).one_or_none()
    payload = None
    if receipt:
        import json

        payload = json.loads(receipt.payload)
    return TurnResponse(
        call_id=call.id,
        assistant_text=result.assistant_text,
        status=call.status,
        complete=result.complete,
        receipt=payload,
    )


def _turn_response(call, result, receipt) -> TurnResponse:
    payload = None
    if receipt:
        import json

        payload = json.loads(receipt.payload)
    return TurnResponse(
        call_id=call.id,
        assistant_text=result.assistant_text,
        status=call.status,
        complete=result.complete,
        receipt=payload,
    )


@app.post("/api/demo/calls/{call_id}/complete", response_model=TurnResponse)
def demo_complete(call_id: str, body: CompleteRequest | None = None, db: Session = Depends(get_db)):
    call = db.get(Call, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    transcript = [line.model_dump() for line in (body.transcript if body else [])]
    result = engine.close(db, call, transcript=transcript or None)
    db.refresh(call)
    receipt = db.query(Receipt).filter(Receipt.call_id == call_id).one_or_none()
    return _turn_response(call, result, receipt)


@app.post("/api/fieldrelay/vapi")
async def vapi_webhook(request: Request, db: Session = Depends(get_db)):
    """Vapi adapter. Maps provider events onto the same CallEngine."""
    if settings.vapi_webhook_secret:
        incoming = request.headers.get("x-vapi-secret") or request.headers.get("authorization", "")
        if settings.vapi_webhook_secret not in incoming:
            raise HTTPException(status_code=401, detail="Invalid webhook secret")

    payload = await request.json()
    message = payload.get("message") or payload
    message_type = message.get("type") or payload.get("type")
    call_block = message.get("call") or payload.get("call") or {}
    provider_id = call_block.get("id")

    if message_type == "tool-calls":
        tool_calls = message.get("toolCallList") or message.get("toolCalls") or []
        results = []
        for tool_call in tool_calls:
            name = tool_call.get("name") or (tool_call.get("function") or {}).get("name")
            tool_id = tool_call.get("id")
            args = tool_call.get("parameters") or (tool_call.get("function") or {}).get("arguments") or {}
            if isinstance(args, str):
                import json

                args = json.loads(args)
            if name == "check_service_area":
                zip_code = args.get("zip") or args.get("zip_code")
                result = service_area_service.check(zip_code)
                results.append({"toolCallId": tool_id, "result": result.status})
        return {"results": results}

    if message_type in {"end-of-call-report", "status-update"} and provider_id:
        call = db.query(Call).filter(Call.provider_call_id == provider_id).one_or_none()
        if call is None:
            call = engine.start(db, provider_call_id=provider_id, scenario="vapi")
        raw = message.get("transcript") or ""
        transcript_payload: list[dict] = []
        if isinstance(raw, list):
            transcript_payload = [
                {
                    "role": item.get("role") or "caller",
                    "text": item.get("text") or item.get("content") or "",
                }
                for item in raw
            ]
        engine.close(db, call, transcript=transcript_payload or None)
        return {"ok": True}

    if message_type == "assistant-request":
        return {
            "assistant": {
                "firstMessage": (
                    "Hi, you've reached the after-hours assistant. I'm an AI assistant. "
                    "Is it okay if I ask you a few questions?"
                ),
            }
        }

    return {"ok": True}
