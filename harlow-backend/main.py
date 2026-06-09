"""
The web server the frontend talks to. Run:  uvicorn main:app --reload
Then open http://localhost:8000/docs to test in the browser.

Endpoints:
  POST /session/new    -> { session_id, state }
  POST /message        -> { reply, state, ending? }
  POST /advance-day    -> { state, ending? }
"""
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from state import new_state
from pipeline import take_turn
from director import advance_day, resolve_ending, SCENES

app = FastAPI(title="Harlow")

# Lets the browser frontend (a different port) talk to this server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS = {}   # session_id -> state   (in memory; fine for MVP)
TURNS = {}      # session_id -> turn counter


class NewReq(BaseModel):
    pass


class MessageReq(BaseModel):
    session_id: str
    character: str
    text: str


def _ending_if_over(state):
    """If the cycle has hit zero, resolve and attach the ending."""
    if state["cycle_days_remaining"] <= 0:
        key = resolve_ending(state)
        return {"id": key, "scene": SCENES[key]}
    return None


@app.post("/session/new")
def session_new(_: NewReq = NewReq()):
    sid = str(uuid.uuid4())[:8]
    SESSIONS[sid] = new_state()
    TURNS[sid] = 0
    return {"session_id": sid, "state": SESSIONS[sid]}


@app.post("/message")
def message(req: MessageReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Unknown session. Call /session/new first.")
    TURNS[req.session_id] += 1
    reply, state, intent, deltas = take_turn(
        req.session_id, req.character, req.text,
        SESSIONS[req.session_id], TURNS[req.session_id],
    )
    SESSIONS[req.session_id] = state
    return {"reply": reply, "state": state, "intent": intent,
            "ending": _ending_if_over(state)}


@app.post("/advance-day")
def advance(req: MessageReq):
    if req.session_id not in SESSIONS:
        raise HTTPException(404, "Unknown session.")
    state = advance_day(SESSIONS[req.session_id])
    SESSIONS[req.session_id] = state
    return {"state": state, "ending": _ending_if_over(state)}