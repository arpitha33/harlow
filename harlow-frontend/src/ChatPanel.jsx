// The conversation surface. The player picks a character and talks to them.
// Receives everything as props from App.jsx — it holds no game state itself.
import { useEffect, useRef, useState } from "react";

const CHARACTERS = {
  briggs:   { name: "Sheriff Tom Briggs", role: "Sheriff's Office" },
  vera:     { name: "Vera Knoll",         role: "The Diner" },
  calloway: { name: "Dr. James Calloway", role: "Town Clinic" },
  owen:     { name: "Owen Parish",        role: "Hardware Store" },
  nora:     { name: "Nora Hale",          role: "Public Library" },
};

const ORDER = ["briggs", "vera", "calloway", "owen", "nora"];

export default function ChatPanel({
  active, messages, onSend, onSelect, loading, noraForgotten,
}) {
  const [text, setText] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, loading]);

  function submit() {
    const t = text.trim();
    if (!t || loading) return;
    onSend(t);
    setText("");
  }

  const meta = CHARACTERS[active];

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      borderLeft: "1px solid #3a2f1e", background: "#191309",
    }}>
      {/* Character selector */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, padding: 12,
        borderBottom: "1px solid #3a2f1e",
      }}>
        {ORDER.map((id) => {
          const gone = id === "nora" && noraForgotten;
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => !gone && onSelect(id)}
              disabled={gone}
              style={{
                fontFamily: "inherit", fontSize: 11, letterSpacing: 1,
                padding: "5px 9px", borderRadius: 3, cursor: gone ? "not-allowed" : "pointer",
                border: "1px solid " + (isActive ? "#d8a23f" : "#3a2f1e"),
                background: isActive ? "#2a2013" : "transparent",
                color: gone ? "#4a4030" : (isActive ? "#d8a23f" : "#cdbf9e"),
                textDecoration: gone ? "line-through" : "none",
              }}
            >
              {CHARACTERS[id].name.split(" ").slice(-1)[0]}
            </button>
          );
        })}
      </div>

      {/* Active character header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #2a2117" }}>
        <div style={{ fontSize: 14, color: "#e8dcc0" }}>{meta.name}</div>
        <div style={{ fontSize: 10, letterSpacing: 1, color: "#8a7d63" }}>
          {meta.role.toUpperCase()}
        </div>
      </div>

      {/* Message log */}
      <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {(!messages || messages.length === 0) && (
          <div style={{ fontSize: 12, color: "#5a4f3b", fontStyle: "italic" }}>
            Say something. They're a person in a small town — not a guide.
          </div>
        )}
        {(messages || []).map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 9, letterSpacing: 1, marginBottom: 3,
              color: m.role === "player" ? "#8a7d63" : "#d8a23f",
            }}>
              {m.role === "player" ? "YOU" : meta.name.toUpperCase()}
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.55,
              color: m.role === "player" ? "#cdbf9e" : "#e8dcc0",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 12, color: "#8a7d63", fontStyle: "italic" }}>…</div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #3a2f1e" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={"Talk to " + meta.name.split(" ").slice(-1)[0] + "…"}
          style={{
            flex: 1, fontFamily: "inherit", fontSize: 13, padding: "9px 12px",
            background: "#15120d", border: "1px solid #3a2f1e", borderRadius: 3,
            color: "#e8dcc0", outline: "none",
          }}
        />
        <button
          onClick={submit}
          disabled={loading}
          style={{
            fontFamily: "inherit", fontSize: 12, letterSpacing: 1, padding: "0 16px",
            background: loading ? "#2a2117" : "#d8a23f",
            color: loading ? "#5a4f3b" : "#15120d",
            border: "none", borderRadius: 3, cursor: loading ? "default" : "pointer",
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}