"""
The Director: scripted world events and the ending resolver. NO AI here.
The five endings are never "routed" — they emerge from the accumulated state.
"""

SCENES = {
    "broadcast":  "Two weeks later the story breaks nationwide. A federal inquiry "
                  "opens. Your apartment sits empty, a car parked outside for three "
                  "days. The truth got out. You did not.",
    "selection":  "Six months later, a different town, a different diner. Someone "
                  "who looks exactly like you sits across from a stranger, asking "
                  "careful questions, smiling a beat too long. You did not disappear. "
                  "Something else arrived.",
    "escape":     "Three months later, a city apartment. The news runs a short "
                  "segment: Harlow, nothing unusual, investigation closed. Owen asks "
                  "if you think they replaced you both already. You say yes. You are "
                  "out. It is still happening.",
    "arrangement":"One year later. A new deputy arrives. You meet them at the office, "
                  "show them the case board, wave at it. 'Small town. People leave. "
                  "Nothing sinister.' You smile the whole time.",
    "forgotten":  "A new deputy arrives in Harlow. The board reads 32 missing now. "
                  "Briggs meets them at the door, friendly, offers coffee. There is no "
                  "trace of you. Not even a memory.",
}


def advance_day(state):
    """Move the clock forward and fire scripted events on their day."""
    state["day"] += 1
    state["cycle_days_remaining"] = max(0, state["cycle_days_remaining"] - 1)
    if state["day"] == 3:
        state["world_events"].append("missing_poster_vanished")
    if state["day"] == 6 and "nora_forgotten" not in state["world_events"]:
        state["world_events"].append("nora_forgotten")  # everyone forgets Nora
    return state


def resolve_ending(state):
    """On cycle night, decide which of the five endings the state lands on."""
    rel = state["relationships"]
    clues = state["clues_found"]
    ev = state["world_events"]
    owen = rel["owen"]["trust"]
    briggs = rel["briggs"]
    betrayed_owen = "reported_silo_to_briggs" in ev

    # Most specific conditions first.
    if owen >= 80 and "logging_road_known" in clues and not betrayed_owen:
        return "escape"
    if "ray_archive" in clues and "broadcast_sent" in ev:
        return "broadcast"
    if "facility_entered" in ev and owen <= 20:
        return "selection"
    if briggs["suspicion"] >= 60 and briggs["trust"] >= 40 and "deal_with_briggs" in ev:
        return "arrangement"
    return "forgotten"  # ran out of time / trusted no one in reach