// Root component. Owns all game state, talks to the backend, and lays out
// the Case Board (left) and Chat Panel (right). No App.css import on purpose —
// global styles live in index.css.
import { useEffect, useState } from "react";
import CaseBoard from "./CaseBoard.jsx";
import ChatPanel from "./ChatPanel.jsx";
import { newSession, sendMessage, advanceDay } from "./api.js";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [state, setState] = useState(null);
  const [active, setActive] = useState("vera");
  const [messages, setMessages] = useState({}); // { character: [{role, text}] }
  const [loading, setLoading] = useState(false);
  const [ending, setEnding] = useState(null);
  const [error, setError] = useState(null);

  async function start() {
    setError(null);
    setEnding(null);
    setMessages({});
    try {
      const data = await newSession();
      setSessionId(data.session_id);
      setState(data.state);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { start(); }, []);

  async function handleSend(text) {
    if (!sessionId) return;
    setMessages((m) => ({
      ...m,
      [active]: [...(m[active] || []), { role: "player", text }],
    }));
    setLoading(true);
    setError(null);
    try {
      const data = await sendMessage(sessionId, active, text);
      setState(data.state);
      setMessages((m) => ({
        ...m,
        [active]: [...(m[active] || []), { role: "npc", text: data.reply }],
      }));
      if (data.ending) setEnding(data.ending);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvanceDay() {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await advanceDay(sessionId);
      setState(data.state);
      if (data.ending) setEnding(data.ending);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const noraForgotten = !!(state && (state.world_events || []).includes("nora_forgotten"));

  return (
    <div style={{
      height: "100vh", display: "grid", gridTemplateColumns: "1.4fr 1fr",
      background: "#15120d",
      fontFamily: "ui-monospace, 'Courier New', monospace",
    }}>
      <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
        <CaseBoard state={state} />
        <button
          onClick={handleAdvanceDay}
          disabled={loading || !sessionId}
          style={{
            position: "absolute", bottom: 16, left: 20,
            fontFamily: "inherit", fontSize: 11, letterSpacing: 1, padding: "8px 14px",
            background: "transparent", color: "#8a7d63",
            border: "1px solid #3a2f1e", borderRadius: 3, cursor: "pointer",
          }}
        >
          ADVANCE DAY →
        </button>
      </div>

      <ChatPanel
        active={active}
        messages={messages[active]}
        onSend={handleSend}
        onSelect={setActive}
        loading={loading}
        noraForgotten={noraForgotten}
      />

      {error && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#bf5d46", color: "#15120d", padding: "8px 16px",
          fontFamily: "ui-monospace, monospace", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {ending && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(10,8,5,0.94)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 40, zIndex: 100,
        }}>
          <div style={{ maxWidth: 620, textAlign: "center" }}>
            <div style={{
              fontFamily: "Georgia, serif", fontSize: 13, letterSpacing: 4,
              color: "#bf5d46", marginBottom: 16,
            }}>
              ENDING — {String(ending.id || "").toUpperCase()}
            </div>
            <div style={{
              fontFamily: "Georgia, serif", fontSize: 17, lineHeight: 1.7, color: "#e8dcc0",
              whiteSpace: "pre-wrap",
            }}>
              {ending.scene}
            </div>
            <button
              onClick={start}
              style={{
                marginTop: 28, fontFamily: "ui-monospace, monospace", fontSize: 12,
                letterSpacing: 1, padding: "9px 18px", background: "#d8a23f",
                color: "#15120d", border: "none", borderRadius: 3, cursor: "pointer",
              }}
            >
              ARRIVE AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}