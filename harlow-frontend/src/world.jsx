import { Suspense, useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, useGLTF, Sky } from "@react-three/drei";
import { EffectComposer, ChromaticAberration, Noise, Vignette, wrapEffect } from "@react-three/postprocessing";
import { Effect } from "postprocessing";
import * as THREE from "three";
import CaseBoard from "./CaseBoard.jsx";
import { newSession, sendMessage, advanceDay } from "./api.js";

// ---- slight fisheye / barrel distortion ------------------------------------
const fisheyeShader = `
uniform float strength;
void mainUv(inout vec2 uv) {
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 + strength * dot(c, c));
}`;
class FisheyeEffect extends Effect {
  constructor({ strength = 0.1 } = {}) {
    super("Fisheye", fisheyeShader, { uniforms: new Map([["strength", new THREE.Uniform(strength)]]) });
  }
}
const Fisheye = wrapEffect(FisheyeEffect);

// ---- the world: every location is just data --------------------------------
const BUFFER = 0.8;
const SPEED_WALK = 2.6;
const SPEED_RUN = 5.5;
const BOB_AMP = 0.06;

const CHAR_NAMES = {
  vera: "Vera Knoll", briggs: "Sheriff Tom Briggs", calloway: "Dr. James Calloway",
  owen: "Owen Parish", nora: "Nora Hale",
};

const LOCATIONS = {
  home: {
    model: "/models/house.glb",
    spawn: [-28.6, 1.2, -119.1],
    eye: 1.2,
    floorY: 0,
    ambient: 0.6,
    interactables: [
      { id: "board", kind: "board",  label: "Examine the case board", x: -22.9, z: -119.1, radius: 2.5 },
      { id: "door",  kind: "travel", label: "Leave the house",        x: -28.4, z: -118.8, radius: 1.8 },
    ],
  },
  diner: {
    model: "/models/diner.glb",
    spawn: [-16.1, 21.9, -18.6],
    eye: 1.2,
    floorY: 20.7,
    ambient: 0.6,
    interactables: [
      { id: "vera", kind: "npc", character: "vera", label: "Talk to Vera", x: -24.2, z: -18.4, radius: 2.5, model: "/models/vera.glb", rotY: 0, height: 1.8 },
      { id: "exit", kind: "home", label: "Head back home", x: -16.1, z: -18.6, radius: 2.0 },
    ],
  },
  sheriff: {
    model: "/models/trailerpark.glb",
    spawn: [-17.4, 1.2, 22.6],
    eye: 1.2,
    floorY: 0.9,
    ambient: 0.6,
    interactables: [
      { id: "briggs", kind: "npc", character: "briggs", label: "Talk to Sheriff Briggs", x: -1.2, z: 39.0, radius: 2.5, model: "/models/briggs.glb", rotY: 3.1416, height: 1.8, yOffset: -1.2 },
      { id: "exit", kind: "home", label: "Head back home", x: -17.4, z: 22.6, radius: 3 },
    ],
  },
  clinic: {
    model: "/models/hospital.glb",
    spawn: [2.9, 1.2, 0.5],
    eye: 1.6,
    floorY: 0.0,
    ambient: 0.6,
    interactables: [
      { id: "calloway", kind: "npc", character: "calloway", label: "Talk to Dr. Calloway", x: -4.9, z: -0.2, radius: 2.5, model: "/models/calloway.glb" },
      { id: "exit", kind: "home", label: "Head back home", x: 2.9, z: 0.5, radius: 3 },
    ],
  },
  hardware: {
    model: "/models/sixtwelve.glb",
    spawn: [-5.8, 1.4, -8.9],
    eye: 1.6,
    floorY: 0.2,
    ambient: 0.6,
    interactables: [
      { id: "owen", kind: "npc", character: "owen", label: "Talk to Owen", x: -14.4, z: -12.0, radius: 2.5, model: "/models/owen.glb" },
      { id: "exit", kind: "home", label: "Head back home", x: -5.8, z: -8.9, radius: 3 },
    ],
  },
  library: {
    model: "/models/library.glb",
    alphaTest: 0.1,
    spawn: [10.9, 1.7, -0.5],
    eye: 1.6,
    floorY: 0.2,
    ambient: 0.6,
    interactables: [
      { id: "nora", kind: "npc", character: "nora", label: "Talk to Nora", x: -9.1, z: -2.9, radius: 2.5, model: "/models/nora.glb" },
      { id: "exit", kind: "home", label: "Head back home", x: 10.9, z: -0.5, radius: 3 },
    ],
  },

};

// travel menu options
const TRAVEL = [
  { id: "diner",    label: "The Diner",         ready: true  },
  { id: "sheriff",  label: "Sheriff's Office",  ready: true  },
  { id: "clinic",   label: "Town Clinic",        ready: true },
  { id: "hardware", label: "Hardware Store",     ready: true },
  { id: "library",  label: "Public Library",     ready: true },
];

useGLTF.preload("/models/house.glb");
useGLTF.preload("/models/diner.glb");
useGLTF.preload("/models/vera.glb");
useGLTF.preload("/models/trailerpark.glb");
useGLTF.preload("/models/briggs.glb");
useGLTF.preload("/models/hospital.glb");
useGLTF.preload("/models/sixtwelve.glb");
useGLTF.preload("/models/library.glb");
useGLTF.preload("/models/monty.glb");
useGLTF.preload("/models/car.glb");

function Model({ url, alphaTest = 0.5 }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m) {
            m.side = THREE.DoubleSide;
            m.transparent = true;
            m.alphaTest = alphaTest;
            m.depthWrite = true;
            m.needsUpdate = true;
          }
        });
      }
    });
  }, [scene]);
  return <primitive object={scene} />;
}

// DEBUG: shows a magenta reference pillar on each NPC spot.
// Set to true while placing new characters, false otherwise.
const DEBUG_NPC = false;

function NpcModel({ url, x, z, floorY, rotY = 0, height = 1.8, yOffset = 0, scale, xNudge = 0, zNudge = 0 }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) m.side = THREE.DoubleSide; });
      }
    });
  }, [scene]);

  function AnimatedModel({ url, position, scale = 1 }) {
  const { scene, animations } = useGLTF(url);
  const mixer = useRef();
  useEffect(() => {
    if (animations.length) {
      mixer.current = new THREE.AnimationMixer(scene);
      animations.forEach((clip) => mixer.current.clipAction(clip).play());
    }
    scene.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
  }, [scene, animations]);
  useFrame((_, delta) => mixer.current?.update(delta));
  return <primitive object={scene} position={position} scale={scale} />;
}

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const auto = size.y > 0.0001 ? height / size.y : 1;
    const s = scale != null ? scale : auto;
    return { s, size, center, min: box.min.clone() };
  }, [scene, height, scale]);

  useEffect(() => {
    console.log(
      `[NPC ${url}] raw size x=${fit.size.x.toFixed(2)} y=${fit.size.y.toFixed(2)} z=${fit.size.z.toFixed(2)} | scale used=${fit.s.toFixed(3)} | min.y=${fit.min.y.toFixed(2)}`
    );
  }, [fit, url]);

  const px = -fit.center.x * fit.s + xNudge;
  const py = -fit.min.y * fit.s + yOffset;
  const pz = -fit.center.z * fit.s + zNudge;

  return (
    <group position={[x, floorY, z]} rotation={[0, rotY, 0]}>
      <primitive object={scene} scale={fit.s} position={[px, py, pz]} />
    </group>
  );
}

function Npcs({ location }) {
  return location.interactables
    .filter((i) => i.kind === "npc")
    .map((i) => (
      <group key={i.id}>
        {i.model ? (
          <NpcModel url={i.model} x={i.x} z={i.z} floorY={location.floorY}
            rotY={i.rotY || 0} height={i.height || 1.8} yOffset={i.yOffset || 0}
            scale={i.scale} xNudge={i.xNudge || 0} zNudge={i.zNudge || 0} />
        ) : (
          <mesh position={[i.x, location.floorY + 0.9, i.z]}>
            <cylinderGeometry args={[0.35, 0.35, 1.75, 14]} />
            <meshStandardMaterial color="#d8a23f" emissive="#7a5320" emissiveIntensity={0.6} />
          </mesh>
        )}
        {DEBUG_NPC && (
          <mesh position={[i.x, location.floorY + 1, i.z]}>
            <boxGeometry args={[0.3, 2, 0.3]} />
            <meshBasicMaterial color="magenta" />
          </mesh>
        )}
      </group>
    ));
}

function AnimatedModel({ url, position, scale = 1, rotation = [0, 0, 0] }) {
  const { scene, animations } = useGLTF(url);
  const mixer = useRef();
  useEffect(() => {
    if (animations.length) {
      mixer.current = new THREE.AnimationMixer(scene);
      animations.forEach((clip) => mixer.current.clipAction(clip).play());
    }
    scene.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
  }, [scene, animations]);
  useFrame((_, delta) => mixer.current?.update(delta));
  return <primitive object={scene} position={position} scale={scale} rotation={rotation} />;
}

function Player({ location, nearRef, setNear, pausedRef }) {
  const { camera, scene } = useThree();
  const keys = useRef({});
  const ray = useRef(new THREE.Raycaster());
  const bobPhase = useRef(0);
  const bobAmount = useRef(0);

  useEffect(() => {
    const down = (e) => (keys.current[e.code] = true);
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    camera.position.set(location.spawn[0], location.spawn[1], location.spawn[2]);
  }, [location.model, camera]);

  useFrame((_, delta) => {
    let near = null;
    for (const it of location.interactables) {
      if (Math.hypot(camera.position.x - it.x, camera.position.z - it.z) < it.radius) {
        near = it.id;
        break;
      }
    }
    if (near !== nearRef.current) {
      nearRef.current = near;
      setNear(near);
    }

    if (pausedRef.current) return;

    const running = keys.current["ShiftLeft"] || keys.current["ShiftRight"];
    const speed = (running ? SPEED_RUN : SPEED_WALK) * delta;
    const front = new THREE.Vector3();
    camera.getWorldDirection(front);
    front.y = 0;
    front.normalize();
    const right = new THREE.Vector3().crossVectors(front, new THREE.Vector3(0, 1, 0));
    const desired = new THREE.Vector3();
    if (keys.current["KeyW"]) desired.add(front);
    if (keys.current["KeyS"]) desired.sub(front);
    if (keys.current["KeyD"]) desired.add(right);
    if (keys.current["KeyA"]) desired.sub(right);
    const moving = desired.lengthSq() > 0;

    if (moving) {
      desired.normalize().multiplyScalar(speed);
      if (Math.abs(desired.x) > 0.0001) {
        ray.current.set(camera.position, new THREE.Vector3(Math.sign(desired.x), 0, 0));
        const hit = ray.current.intersectObjects(scene.children, true);
        if (!hit.length || hit[0].distance > BUFFER) camera.position.x += desired.x;
      }
      if (Math.abs(desired.z) > 0.0001) {
        ray.current.set(camera.position, new THREE.Vector3(0, 0, Math.sign(desired.z)));
        const hit = ray.current.intersectObjects(scene.children, true);
        if (!hit.length || hit[0].distance > BUFFER) camera.position.z += desired.z;
      }
    }

    ray.current.set(
      new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z),
      new THREE.Vector3(0, -1, 0)
    );
    const downHits = ray.current.intersectObjects(scene.children, true);
    if (downHits.length && downHits[0].distance < 4) {
      const baseY = downHits[0].point.y + location.eye;
      bobAmount.current += ((moving ? 1 : 0) - bobAmount.current) * Math.min(1, delta * 10);
      if (moving) bobPhase.current += delta * (running ? 14 : 9);
      const bob = Math.sin(bobPhase.current) * BOB_AMP * bobAmount.current;
      camera.position.y = baseY + bob;
    }
  });
  return null;
}

function Overlay({ title, children, onClose, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,6,4,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ width: wide ? 560 : 420, maxWidth: "92vw", maxHeight: "86vh",
        background: "#1a140d", border: "1px solid #3a2f1e", borderRadius: 6, padding: 22,
        display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: "#d8a23f", fontFamily: "monospace", fontSize: 15, letterSpacing: 2 }}>{title}</div>
          <button onClick={onClose} style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: 1,
            padding: "5px 10px", background: "transparent", color: "#8a7d63",
            border: "1px solid #3a2f1e", borderRadius: 4, cursor: "pointer" }}>CLOSE</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChatOverlay({ character, sessionId, messages, setMessages, onState, onClose }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const logRef = useRef();
  const log = messages[character] || [];

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, loading]);

  async function send() {
    const t = text.trim();
    if (!t || loading || !sessionId) return;
    setText("");
    setMessages((m) => ({ ...m, [character]: [...(m[character] || []), { role: "player", text: t }] }));
    setLoading(true);
    try {
      const data = await sendMessage(sessionId, character, t);
      setMessages((m) => ({ ...m, [character]: [...(m[character] || []), { role: "npc", text: data.reply }] }));
      if (data.state) onState(data.state);
    } catch (e) {
      setMessages((m) => ({ ...m, [character]: [...(m[character] || []), { role: "npc", text: "(...no answer. is the backend running?)" }] }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Overlay title={CHAR_NAMES[character] || character} onClose={onClose} wide>
      <div ref={logRef} style={{ flex: 1, overflowY: "auto", minHeight: 220, marginBottom: 12 }}>
        {log.length === 0 && (
          <div style={{ color: "#5a4f3b", fontFamily: "monospace", fontSize: 13, fontStyle: "italic" }}>
            Say something.
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, letterSpacing: 1, marginBottom: 3,
              color: m.role === "player" ? "#8a7d63" : "#d8a23f" }}>
              {m.role === "player" ? "YOU" : (CHAR_NAMES[character] || character).toUpperCase()}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55,
              color: m.role === "player" ? "#cdbf9e" : "#e8dcc0", fontFamily: "monospace" }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: "#8a7d63", fontFamily: "monospace" }}>...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Type, then Enter"
          style={{ flex: 1, fontFamily: "monospace", fontSize: 13, padding: "9px 12px",
            background: "#15120d", border: "1px solid #3a2f1e", borderRadius: 4, color: "#e8dcc0", outline: "none" }} />
        <button onClick={send} disabled={loading}
          style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: 1, padding: "0 16px",
            background: loading ? "#2a2117" : "#d8a23f", color: loading ? "#5a4f3b" : "#15120d",
            border: "none", borderRadius: 4, cursor: loading ? "default" : "pointer" }}>SEND</button>
      </div>
    </Overlay>
  );
}

export default function World() {
  const [locationId, setLocationId] = useState("home");
  const [near, setNear] = useState(null);
  const [panel, setPanel] = useState(null);
  const [chatChar, setChatChar] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [ending, setEnding] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState({});

  const nearRef = useRef(null);
  const pausedRef = useRef(false);
  const controlsRef = useRef();
  const location = LOCATIONS[locationId];
  pausedRef.current = panel !== null;

  useEffect(() => {
    newSession()
      .then((data) => { setSessionId(data.session_id); setGameState(data.state); })
      .catch((err) => console.error("Session failed:", err));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "KeyE" && !panel && nearRef.current) {
        const it = location.interactables.find((i) => i.id === nearRef.current);
        if (!it) return;
        if (it.kind === "board") setPanel("board");
        else if (it.kind === "travel") setPanel("travel");
        else if (it.kind === "npc") { setChatChar(it.character); setPanel("chat"); }
        else if (it.kind === "home") setLocationId("home");
      }
      if (e.code === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, location]);

  useEffect(() => {
    if (panel && controlsRef.current) controlsRef.current.unlock();
  }, [panel]);

  function travelTo(id) {
    setLocationId(id);
    setPanel(null);
  }
  async function handleAdvanceDay() {
  if (!sessionId || dayLoading) return;
  setDayLoading(true);
  try {
    const data = await advanceDay(sessionId);
    setGameState(data.state);
    if (data.ending) setEnding(data.ending);
  } catch (e) {
    console.error("advance-day failed:", e);
  } finally {
    setDayLoading(false);
  }
}

  const nearLabel = location.interactables.find((i) => i.id === near)?.label;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0807" }}>
      <Canvas camera={{ position: location.spawn, fov: 75 }}>
      <ambientLight intensity={location.ambient} />
        <directionalLight position={[10, 6, -10]} intensity={1.0} color="#ffd9b0" />
        <color attach="background" args={["#cf7338"]} />
        <Suspense fallback={null}>
        <Model url={location.model} alphaTest={location.alphaTest ?? 0.5} />
        </Suspense>
        <Npcs location={location} />
        {locationId === "home" && (
  <Suspense fallback={null}>
    <AnimatedModel url="/models/monty.glb" position={[-23.5, 0.3, -121.15]} scale={0.06} rotation={[0, Math.PI, 0]} />
  </Suspense>
)}
{locationId === "sheriff" && (
  <Suspense fallback={null}>
    <AnimatedModel url="/models/car.glb" position={[-10.4, -1.0, 42.8]} scale={0.35} rotation={[0, Math.PI, 0]} />
  </Suspense>
)}
        <Player location={location} nearRef={nearRef} setNear={setNear} pausedRef={pausedRef} />
        <PointerLockControls ref={controlsRef} />
        <EffectComposer>
          <Fisheye strength={0.1} />
          <ChromaticAberration offset={[0.0008, 0.0008]} />
          <Noise opacity={0.16} />
          <Vignette offset={0.25} darkness={0.7} />
        </EffectComposer>
      </Canvas>

      {near && !panel && (
        <div style={{ position: "absolute", bottom: "20%", left: 0, right: 0, textAlign: "center",
          color: "#e8dcc0", fontFamily: "monospace", fontSize: 16, textShadow: "0 2px 6px #000" }}>
          [E] {nearLabel}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 20, left: 20, color: "#fff",
        fontFamily: "monospace", fontSize: 12, opacity: 0.6 }}>
        Click to look · WASD move · Shift run · E interact
      </div>

      {panel === "board" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,6,4,0.92)",
          zIndex: 50, display: "flex", flexDirection: "column" }}>
          <button onClick={() => setPanel(null)} style={{ position: "absolute", top: 14, right: 18,
            fontFamily: "monospace", fontSize: 13, letterSpacing: 1, padding: "6px 12px",
            background: "transparent", color: "#d8a23f", border: "1px solid #3a2f1e",
            borderRadius: 4, cursor: "pointer", zIndex: 51 }}>CLOSE</button>
            <button onClick={handleAdvanceDay} disabled={dayLoading} style={{ position: "absolute", top: 14, right: 100,
  fontFamily: "monospace", fontSize: 13, letterSpacing: 1, padding: "6px 12px",
  background: "transparent", color: dayLoading ? "#5a4f3b" : "#d8a23f", border: "1px solid #3a2f1e",
  borderRadius: 4, cursor: dayLoading ? "default" : "pointer", zIndex: 51 }}>
  {dayLoading ? "..." : `Day ${gameState?.day ?? "?"} — Sleep / Advance`}
</button>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {gameState
              ? <CaseBoard state={gameState} />
              : <p style={{ color: "#8a7d63", fontFamily: "monospace", padding: 24 }}>
                  Connecting to the case files... is the backend running?
                </p>}
          </div>
        </div>
      )}

      {panel === "travel" && (
        <Overlay title="WHERE DO YOU WANT TO GO?" onClose={() => setPanel(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {TRAVEL.map((l) => (
              <button key={l.id} disabled={!l.ready} onClick={() => l.ready && travelTo(l.id)}
                style={{ fontFamily: "monospace", fontSize: 14, padding: "10px 14px", textAlign: "left",
                  background: "transparent", color: l.ready ? "#e8dcc0" : "#5a4f3b",
                  border: "1px solid #3a2f1e", borderRadius: 4, cursor: l.ready ? "pointer" : "not-allowed" }}>
                {l.label}{l.ready ? "" : "  -- coming soon"}
              </button>
            ))}
          </div>
        </Overlay>
      )}

      {panel === "chat" && chatChar && (
        <ChatOverlay
          character={chatChar}
          sessionId={sessionId}
          messages={messages}
          setMessages={setMessages}
          onState={setGameState}
          onClose={() => setPanel(null)}
        />
      )}
      {ending && (
  <div style={{ position: "fixed", inset: 0, background: "#0a0807", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
    color: "#e8dcc0", fontFamily: "monospace", textAlign: "center", padding: 40 }}>
    <div style={{ fontSize: 12, letterSpacing: 3, color: "#8a7d63", marginBottom: 12 }}>ENDING REACHED</div>
    <div style={{ fontSize: 28, color: "#d8a23f" }}>{ending}</div>
  </div>
)}
    </div>
  );
}