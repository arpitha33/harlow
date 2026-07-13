const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function sendMessage(sessionId, character, text) {
  const res = await fetch(`${API_URL}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, character, text }),
  })
  return res.json()  // { reply, state }
}