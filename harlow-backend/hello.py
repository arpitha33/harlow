from state import new_state
from pipeline import take_turn

session_id = "test_owen"
state = new_state()

conversations = [
    "Hi, I'm the new deputy. Quiet town?",
    "I noticed you closed early yesterday.",
    "I'm not here to cause trouble. I just want to know what's going on.",
]

for i, message in enumerate(conversations):
    print(f"\nPLAYER: {message}")
    reply, state, intent, deltas = take_turn(session_id, "owen", message, state, turn=i+1)
    print(f"OWEN: {reply}")
    print(f"intent={intent} | trust={state['relationships']['owen']['trust']} | deltas={deltas}")