# FieldRelay POC Architecture

**Product:** FieldRelay by PrimeArcTech  
**Scope:** POC vertical slice only. The Managed Pilot MVP (dedicated Worker, D1, Access, encryption, second isolated deployment) is out of scope.

This plan follows `FIELDRELAY_POC_SPEC.md`. Where that spec and the PRD differ, the POC spec governs this build.

## Goal

Prove one end-to-end loop a stranger can understand in under five minutes:

```text
Caller → Voice Agent → Disclosure → Safety Screen
  → Bounded Qualification → Service-Area Validation
  → Provisional Outcome OR Human Handoff
  → Structured Receipt → Dispatcher Dashboard
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind | Spec preference; small demo surface |
| Backend | Python FastAPI | Spec preference; deterministic tools/state |
| Database | SQLite | Local POC; no pooled multi-tenant store |
| Voice | Vapi webhook interface + simulated demo path | Spec requires Vapi; live keys are optional for local testing |
| Tests | pytest + FastAPI TestClient | P0 scenarios must be automated |

## Surfaces

```text
/                         Landing
/voice-demo               Interactive demo call (simulated turns; same backend as Vapi)
/dispatcher               Read-only recent calls
/dispatcher/calls/:id     Receipt + events
/demo                     Scenario selector
```

## Backend boundary

```text
GET  /api/health
POST /api/fieldrelay/vapi      Vapi webhook (tools, status, end report)
GET  /api/service-area?zip=
GET  /api/calls
GET  /api/calls/{call_id}
POST /api/demo/reset
POST /api/demo/scenario
POST /api/demo/calls           Start a demo call
POST /api/demo/calls/{id}/turn Apply one caller turn
```

Demo-only start/turn endpoints exist so the product can be tested without provider keys. They call the same state machine as the Vapi adapter.

## Authoritative rules

1. Backend decides service area. The model never guesses coverage.
2. No invented bookings, prices, estimates, transfers, or provider success.
3. Danger stops routine intake.
4. Explicit human request is honored (`HANDOFF_REQUESTED`). Real telephony transfer is not implemented in this POC.
5. Failures are visible. Never display fake success.
6. Secrets stay in environment variables, never in frontend code.
7. Demo data is fictional.
8. No pooled multi-tenant SaaS.

## State machine

The LLM (or demo caller text) supplies information. Backend assigns the operational outcome.

```text
CALL_STARTED
DISCLOSURE
DANGER_SCREEN
QUALIFICATION
SERVICE_AREA_CHECK
NEXT_ACTION
        ├── HANDOFF_REQUESTED
        ├── PROVISIONAL_CALLBACK
        ├── UNSUPPORTED_AREA
        ├── MANUAL_REVIEW
        ├── PROVIDER_FAILURE
        └── TRANSFER_FAILURE
CALL_COMPLETED
```

Every user turn is scanned for danger, human request, prompt injection, and fake-confirmation language, regardless of current state.

## Data

SQLite tables: `calls`, `call_events`, `receipts`.

Transcripts are not written to operational logs. Receipt payload is structured JSON (disposition, ZIP, service-area status, handoff, failure code).

## Voice

`VoiceProvider` is an interface.

- **Demo adapter:** typed/scripted turns through `/api/demo/*`.
- **Vapi adapter:** `POST /api/fieldrelay/vapi` maps tool calls (`check_service_area`) and end-of-call reports onto the same engine.

Live browser voice requires `VAPI_PUBLIC_KEY` / `VAPI_PRIVATE_KEY`. Without keys, the simulated path is the supported test path.

## What this POC does not build

Dedicated Cloudflare Worker/D1/Access, encryption/retention automation, deployment factory, billing, CRM, confirmed appointments, real number porting, production monitoring, or real customer traffic.
