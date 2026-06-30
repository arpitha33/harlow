// Talks to the FastAPI backend. The backend runs on port 8000.
// Endpoints (from main.py):
//   POST /session/new  -> { session_id, state }
//   POST /message      -> { reply, state, intent, ending }
//   POST /advance-day  -> { state, ending }

const BASE = "http://localhost:8000";

async function post(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch (networkErr) {
    // fetch throws (not an HTTP error) when the server is unreachable.
    throw new Error(
      "Can't reach the backend at " + BASE +
      ". Is the uvicorn server running in the other terminal?"
    );
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(path + " failed (" + res.status + "): " + detail);
  }
  return res.json();
}

export function newSession() {
  return post("/session/new", {});
}

export function sendMessage(sessionId, character, text) {
  return post("/message", { session_id: sessionId, character, text });
}

// /advance-day reuses the message request model on the backend,
// so character and text must be present even though it ignores them.
export function advanceDay(sessionId) {
  return post("/advance-day", { session_id: sessionId, character: "system", text: "" });
}