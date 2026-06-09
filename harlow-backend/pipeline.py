"""
The turn pipeline — the heart of the brain. Six steps, plain Python.
(Phase 4-1/2 of the build guide turns these exact six into a LangGraph graph.)
"""

import json
from config import client, BIG_MODEL, SMALL_MODEL
from characters import CHARACTERS
from memory import recall, remember
from state import evaluate, apply
from typing import TypedDict
from langgraph.graph import StateGraph, END

class Turn(TypedDict):
    session_id: str
    character: str
    player_text: str
    state: dict
    intent: str
    memories: list
    prompt: str
    reply: str
    deltas: dict
    turn: int

def classify(t): t["intent"] = classify_intent(t["player_text"]); return t
def retrieve(t): t["memories"] = recall(t["session_id"], t["character"], t["player_text"]); return t
def assemble(t): t["prompt"] = build_prompt(t["character"], t["state"], t["memories"]); return t
def respond(t):  t["reply"] = generate(t["prompt"], t["player_text"]); return t
def score(t):    t["deltas"] = evaluate(t["character"], t["player_text"], t["reply"], t["state"]); return t
def commit(t):   t["state"] = apply(t["state"], t["character"], t["deltas"]); remember(t["session_id"], t["character"], f'Player: "{t["player_text"]}" | {t["character"]}: "{t["reply"]}"', t["turn"]); return t

g = StateGraph(Turn)
for name, fn in [("classify",classify),("retrieve",retrieve),("assemble",assemble),
                 ("respond",respond),("score",score),("commit",commit)]:
    g.add_node(name, fn)

g.set_entry_point("classify")
g.add_edge("classify","retrieve"); g.add_edge("retrieve","assemble")
g.add_edge("assemble","respond");  g.add_edge("respond","score")
g.add_edge("score","commit");      g.add_edge("commit", END)

turn_graph = g.compile()


# ---- Step 1: classify what the player is doing -----------------------------
def classify_intent(player_text):
    """Cheap, fast call. Returns one intent label used to steer behavior."""
    user = (
        'Classify the player\'s message in a detective game into ONE intent. '
        f'Message: "{player_text}". '
        'Return ONLY JSON: {"intent": "<small_talk | probe_topic | accusation | '
        'request | threat>"}'
    )
    try:
        resp = client.chat.completions.create(
            model=SMALL_MODEL,
            messages=[{"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        return json.loads(resp.choices[0].message.content).get("intent", "small_talk")
    except Exception:
        return "small_talk"


# ---- Step 3 helpers: build the character's full prompt ---------------------
def _format_state(character, state):
    rel = state["relationships"][character]
    events = ", ".join(state["world_events"]) or "nothing notable yet"
    return (
        f"It is Day {state['day']}. There are {state['cycle_days_remaining']} days "
        f"until the cycle. Your trust in the player is {rel['trust']}/100 and your "
        f"wariness is {rel['suspicion']}/100. Things that have happened in town: {events}."
    )


def build_prompt(character, state, memories):
    template = CHARACTERS[character]
    mem = "\n".join(f"- {m}" for m in memories) if memories else "(nothing yet)"
    return template.format(game_state=_format_state(character, state), memories=mem)


# ---- Step 4: generate the in-character reply (the BIG model) ---------------
def generate(system_prompt, player_text):
    resp = client.chat.completions.create(
        model=BIG_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": player_text},
        ],
        temperature=0.8,
    )
    return resp.choices[0].message.content.strip()


# ---- The whole turn --------------------------------------------------------
def take_turn(session_id, character, player_text, state, turn):
    result = turn_graph.invoke({
        "session_id": session_id,
        "character": character,
        "player_text": player_text,
        "state": state,
        "turn": turn,
        "intent": "", "memories": [], "prompt": "", "reply": "", "deltas": {}
    })
    return result["reply"], result["state"], result["intent"], result["deltas"]