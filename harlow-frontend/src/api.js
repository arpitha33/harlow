const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function newSession() {
  const res = await fetch(`${API_URL}/session/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.json()  // { session_id, state }
}

export async function sendMessage(sessionId, character, text) {
  const res = await fetch(`${API_URL}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, character, text }),
  })
  return res.json()  // { reply, state }
}

export function advanceDay(sessionId) {
  return fetch(`${API_URL}/advance-day`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, character: 'system', text: '' }),
  }).then(res => res.json()); // { state, ending }
}