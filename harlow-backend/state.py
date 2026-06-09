"""
Structured game state = the exact facts: trust, suspicion, clues, days.
This is deterministic. It is what tunes behavior and enforces the story's gates.
(The fuzzy "what was said" memory lives in memory.py instead.)
"""
import json
from config import client, SMALL_MODEL


def new_state():
    return {
        "day": 1,
        "cycle_days_remaining": 6,
        "clues_found": [],
        "revelations_unlocked": [],
        "world_events": [],
        "relationships": {
            "briggs":   {"trust": 45, "suspicion": 10},
            "vera":     {"trust": 40, "suspicion": 15},
            "calloway": {"trust": 50, "suspicion": 10},
            "owen":     {"trust": 20, "suspicion": 5},
            "nora":     {"trust": 50, "suspicion": 10},
        },
    }


_EVAL_SYSTEM = (
    "You are a neutral game-state evaluator. You read one exchange between a "
    "player and a character and report how it changed their relationship. "
    "You only output JSON. You never role-play."
)


def evaluate(character, player_text, reply, state):
    """
    A SEPARATE, cheap model call whose only job is to score the exchange.
    We never let the character model report its own trust changes — it drifts.
    Returns a dict of deltas.
    """
    rel = state["relationships"][character]
    user = f"""Character: {character}
Their current trust in the player: {rel['trust']}/100
Their current wariness (suspicion): {rel['suspicion']}/100

The player said: "{player_text}"
{character} replied: "{reply}"

Score the effect of this exchange. Return ONLY a JSON object of this shape:
{{"trust_change": <integer from -10 to 10>,
  "suspicion_change": <integer from -10 to 10>}}

Warmth, honesty, and shared vulnerability raise trust. Pressure, prying, or
threats raise suspicion."""

    resp = client.chat.completions.create(
        model=SMALL_MODEL,
        messages=[
            {"role": "system", "content": _EVAL_SYSTEM},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    try:
        d = json.loads(resp.choices[0].message.content)
        return {
            "trust_change": int(d.get("trust_change", 0)),
            "suspicion_change": int(d.get("suspicion_change", 0)),
        }
    except Exception:
        # If parsing ever fails, change nothing rather than crash.
        return {"trust_change": 0, "suspicion_change": 0}


def apply(state, character, deltas):
    """Apply the deltas and enforce story gates (plain code, never the AI)."""
    rel = state["relationships"][character]
    rel["trust"] = max(0, min(100, rel["trust"] + deltas["trust_change"]))
    rel["suspicion"] = max(0, min(100, rel["suspicion"] + deltas["suspicion_change"]))

    # THE KEY GATE: Vera hands over Ray's brass key only when she truly trusts
    # the player AND knows someone else is already involved (Owen has spoken).
    if (
        character == "vera"
        and rel["trust"] >= 70
        and "owen_has_spoken" in state["world_events"]
        and "brass_key" not in state["clues_found"]
    ):
        state["clues_found"].append("brass_key")

    return state