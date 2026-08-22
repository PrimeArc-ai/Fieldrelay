# FieldRelay POC

Managed missed/after-hours HVAC and plumbing intake. This repository implements the **POC vertical slice** from `FIELDRELAY_POC_SPEC.md`. The Managed Pilot MVP in the PRD is not this build.

Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## What you can test now

Without Vapi keys you can still run the full loop:

1. Open the landing page
2. Start a demo call or run a scripted scenario
3. Complete disclosure → danger screen → qualification → ZIP check
4. Open the dispatcher dashboard and inspect the receipt

Live Vapi browser voice: put `VAPI_PUBLIC_KEY` in `.env` (from the Vapi dashboard). Restart the backend. **Start Demo Call** will then request the microphone and the assistant will speak. Typed intake remains the fallback when keys are empty.

## Run locally

Use two terminals from the repo root.

**Backend**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: http://127.0.0.1:8000/api/health

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

UI: http://localhost:3000

Pages: `/` landing, `/voice-demo`, `/dispatcher`, `/dispatcher/calls/:id`, `/demo`

## Tests

```bash
source .venv/bin/activate
PYTHONPATH=backend python3 -m pytest -q
```

Covers normal HVAC, unsupported ZIP, danger, human request, service-area failure, provider failure, prompt injection / fake confirmation, interactive turns, and reset.

## Demo ZIPs

Supported: `560001` `560002` `560003` `560004`  
Anything else is unsupported. Tool failure is the `service_area_failure` scenario.

## Out of scope here

Dedicated Cloudflare Worker/D1/Access, encryption/retention automation, billing, CRM, confirmed appointments, real telephony transfer, production traffic.
