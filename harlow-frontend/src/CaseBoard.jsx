// The Case Board — the player's home screen and emotional anchor.
// Driven entirely by `state` (the game_state object from the backend).
// Renders the day/cycle counter, suspect cards with trust/suspicion,
// logged clues, the five revelations, and Nora's erasure on Day 6.

const CHARACTERS = {
  briggs:   { name: "Sheriff Tom Briggs", role: "Sheriff's Office" },
  vera:     { name: "Vera Knoll",         role: "The Diner" },
  calloway: { name: "Dr. James Calloway", role: "Town Clinic" },
  owen:     { name: "Owen Parish",        role: "Hardware Store" },
  nora:     { name: "Nora Hale",          role: "Public Library" },
};

const ORDER = ["briggs", "vera", "calloway", "owen", "nora"];

const REVELATIONS = [
  "Disappearances follow a 23-day cycle.",
  "A specific psychological profile is being targeted.",
  "The facility is the center — every disappearance orbits it.",
  "Nora is gone, and no one remembers her. You're next.",
  "The town was built around the arrangement. You were chosen before you arrived.",
];

const CLUE_LABELS = {
  mill_glove: "Metallic glove — the mill",
  ray_archive: "Ray Knoll's hidden archive",
  facility_tracks: "Fresh tire tracks — the facility",
  facility_hatch: "Recently-used hatch, east wall",
  owen_documentation: "Owen's four months of notes",
  owen_map: "Owen's map — the orbit",
  brass_key: "Vera's brass key",
  profile_template: "Behavioral profile — it matches you",
  missing_poster_vanished: "The poster that vanished overnight",
};

function prettyClue(key) {
  if (CLUE_LABELS[key]) return CLUE_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Meter({ label, value, color }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, letterSpacing: 1, color: "#8a7d63", marginBottom: 2,
      }}>
        <span>{label}</span><span>{v}</span>
      </div>
      <div style={{ height: 4, background: "#2a2117", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: v + "%", background: color }} />
      </div>
    </div>
  );
}

function SuspectCard({ id, rel, forgotten }) {
  const meta = CHARACTERS[id];
  if (!meta) return null;

  if (id === "nora" && forgotten) {
    return (
      <div style={{
        border: "1px dashed #3a2f1e", borderRadius: 4, padding: 12,
        background: "#191309", opacity: 0.55,
      }}>
        <div style={{ fontSize: 13, color: "#6e6047", textDecoration: "line-through" }}>
          Nora Hale
        </div>
        <div style={{ fontSize: 11, color: "#bf5d46", marginTop: 6, fontStyle: "italic" }}>
          No record remains. Only your notes.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: "1px solid #3a2f1e", borderRadius: 4, padding: 12, background: "#1e1810",
    }}>
      <div style={{ fontSize: 13, color: "#e8dcc0" }}>{meta.name}</div>
      <div style={{ fontSize: 10, color: "#8a7d63", letterSpacing: 1, marginTop: 2 }}>
        {meta.role.toUpperCase()}
      </div>
      <Meter label="TRUST" value={rel.trust} color="#d8a23f" />
      <Meter label="SUSPICION" value={rel.suspicion} color="#bf5d46" />
    </div>
  );
}

export default function CaseBoard({ state }) {
  if (!state) {
    return <div style={{ padding: 24, color: "#8a7d63" }}>Loading the board…</div>;
  }

  const day = state.day ?? 1;
  const cycle = state.cycle_days_remaining ?? 7;
  const rels = state.relationships || {};
  const clues = state.clues_found || [];
  const unlocked = state.revelations_unlocked || [];
  const events = state.world_events || [];
  const noraForgotten = events.includes("nora_forgotten");
  const urgent = cycle <= 2;

  return (
    <div style={{ padding: 20, color: "#e8dcc0", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 30, letterSpacing: 6, margin: 0, color: "#d8a23f", fontWeight: 400,
        }}>
          HARLOW
        </h1>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#8a7d63", letterSpacing: 1 }}>DAY {day}</div>
          <div style={{
            fontSize: 11, letterSpacing: 1, marginTop: 2,
            color: urgent ? "#bf5d46" : "#8a7d63",
          }}>
            CYCLE IN {cycle} {cycle === 1 ? "DAY" : "DAYS"}
          </div>
        </div>
      </div>

      <Section title="Suspects">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ORDER.filter((id) => rels[id]).map((id) => (
            <SuspectCard key={id} id={id} rel={rels[id]} forgotten={noraForgotten} />
          ))}
        </div>
      </Section>

      <Section title="Clues">
        {clues.length === 0 ? (
          <Empty>Nothing logged yet. Go talk to someone.</Empty>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {clues.map((c) => (
              <li key={c} style={{
                fontSize: 12, padding: "6px 0", borderBottom: "1px solid #2a2117",
                color: "#cdbf9e",
              }}>
                <span style={{ color: "#d8a23f", marginRight: 8 }}>—</span>{prettyClue(c)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Revelations">
        {REVELATIONS.map((text, i) => {
          const isUnlocked = unlocked.includes(i + 1);
          return (
            <div key={i} style={{
              fontSize: 12, padding: "7px 0", borderBottom: "1px solid #2a2117",
              color: isUnlocked ? "#e8dcc0" : "#5a4f3b",
              fontStyle: isUnlocked ? "normal" : "italic",
            }}>
              <span style={{ color: isUnlocked ? "#d8a23f" : "#5a4f3b", marginRight: 8 }}>
                {isUnlocked ? "◆" : "◇"}
              </span>
              {isUnlocked ? text : "Not yet understood."}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        fontSize: 11, letterSpacing: 2, color: "#8a7d63",
        borderBottom: "1px solid #3a2f1e", paddingBottom: 6, marginBottom: 10,
      }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 12, color: "#5a4f3b", fontStyle: "italic" }}>{children}</div>;
}