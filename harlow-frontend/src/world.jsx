import { Suspense, useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, useGLTF, Sky } from "@react-three/drei";
import { EffectComposer, ChromaticAberration, Noise, Vignette, wrapEffect } from "@react-three/postprocessing";
import { Effect } from "postprocessing";
import * as THREE from "three";
import CaseBoard from "./CaseBoard.jsx";
import { newSession, sendMessage, advanceDay, setFlag } from "./api.js";

const SAVE_KEY = "harlow_save_v1";

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("save failed:", e);
  }
}

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

function ChatOverlay({ character, sessionId, messages, setMessages, onState, onClose, onTakeDeal, onAskJoin, onFixCar, day, worldEvents, cluesFound, relationships, fixingCar }) {
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
      {character === "owen" && onFixCar && (() => {
        const carFixed = cluesFound?.includes("car_fixed");
        const owenTrust = relationships?.owen?.trust ?? 0;
        if (carFixed) {
          return (
            <div style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12, color: "#7a9e6a" }}>
              [ the car is fixed ]
            </div>
          );
        }
        if (owenTrust >= 50) {
          return (
            <button onClick={onFixCar} disabled={fixingCar} style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12,
              letterSpacing: 1, padding: "9px 12px", background: "transparent", color: fixingCar ? "#5a4f3b" : "#d8a23f",
              border: "1px solid #3a2f1e", borderRadius: 4, cursor: fixingCar ? "default" : "pointer", textAlign: "left" }}>
              {fixingCar ? "..." : "[ ASK OWEN TO FIX THE CAR ]"}
            </button>
          );
        }
        return null;
      })()}
      {day >= 4 && cluesFound?.includes("car_fixed") && onAskJoin && (
        worldEvents?.includes(`party_${character}`) ? (
          <div style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12, color: "#7a9e6a" }}>
            [ {CHAR_NAMES[character] || character} is coming with you ]
          </div>
        ) : (
          <button onClick={() => onAskJoin(character)} style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12,
            letterSpacing: 1, padding: "9px 12px", background: "transparent", color: "#d8a23f",
            border: "1px solid #3a2f1e", borderRadius: 4, cursor: "pointer", textAlign: "left" }}>
            [ ASK {(CHAR_NAMES[character] || character).toUpperCase()} TO COME WITH YOU ]
          </button>
        )
      )}
      {character === "briggs" && onTakeDeal && (
        <button onClick={onTakeDeal} style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12,
          letterSpacing: 1, padding: "9px 12px", background: "transparent", color: "#a05a5a",
          border: "1px solid #3a2f1e", borderRadius: 4, cursor: "pointer", textAlign: "left" }}>
          [ TAKE HIS DEAL — close the case, stay in Harlow ]
        </button>
      )}
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

const INTRO_PANELS = [
  { art: "town",   caption: "HARLOW. POPULATION 800. ONE ROAD IN. ONE ROAD OUT." },
  { art: "poster", caption: "THIRTY-ONE PEOPLE HAVE VANISHED IN THE LAST EIGHTEEN MONTHS. OFFICIALLY, THEY JUST LEFT." },
  { art: "badge",  caption: "THREE INVESTIGATORS CAME BEFORE YOU. ONE QUIT. ONE TRANSFERRED. ONE NEVER LEFT." },
  { art: "car",    caption: "YOU'RE THE NEW DEPUTY. IT LOOKS LIKE A QUIET POSTING." },
  { art: "window", caption: "EVERYONE HERE IS FRIENDLY. EVERYONE HERE IS HIDING SOMETHING. YOU HAVE SEVEN DAYS TO FIND OUT WHICH IS TRUE." },
  { art: "fade",   caption: "WHATEVER HAPPENS NEXT, THEY'LL SAY IT WAS ROUTINE." },
];

function IntroArt({ type }) {
  const vb = "0 0 400 250";
  if (type === "town") {
    return (
      <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
        <rect width="400" height="250" fill="#0d0d10" />
        <circle cx="330" cy="46" r="24" fill="#cfcabb" opacity="0.85" />
        <rect x="0" y="150" width="400" height="100" fill="#050506" />
        {[20, 60, 100, 150, 200, 250, 290, 330, 365].map((x, i) => (
          <rect key={i} x={x} y={150 - (18 + (i % 3) * 22)} width="28" height={18 + (i % 3) * 22 + 100} fill="#111114" />
        ))}
      </svg>
    );
  }
  if (type === "poster") {
    return (
      <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
        <rect width="400" height="250" fill="#0a0a0c" />
        <rect x="140" y="55" width="120" height="150" fill="#17171a" stroke="#3a3a3d" strokeWidth="2" />
        <text x="200" y="90" textAnchor="middle" fill="#8a8a80" fontSize="13" fontFamily="monospace" letterSpacing="2">MISSING</text>
        <rect x="160" y="105" width="80" height="60" fill="#232326" />
        <line x1="148" y1="130" x2="252" y2="190" stroke="#050506" strokeWidth="6" />
        <line x1="252" y1="130" x2="148" y2="190" stroke="#050506" strokeWidth="6" />
      </svg>
    );
  }
  if (type === "badge") {
    return (
      <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
        <rect width="400" height="250" fill="#0a0a0c" />
        <polygon points="200,55 216,98 262,98 225,124 239,168 200,142 161,168 175,124 138,98 184,98"
          fill="#6a6350" opacity="0.9" />
        <circle cx="200" cy="112" r="18" fill="#0a0a0c" />
      </svg>
    );
  }
  if (type === "car") {
    return (
      <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
        <rect width="400" height="250" fill="#0a0a0c" />
        <rect x="90" y="150" width="220" height="45" rx="10" fill="#101012" />
        <rect x="130" y="118" width="120" height="42" rx="8" fill="#131316" />
        <circle cx="140" cy="200" r="16" fill="#050506" />
        <circle cx="260" cy="200" r="16" fill="#050506" />
        <circle cx="300" cy="163" r="9" fill="#d8c9a0" opacity="0.9" />
        <circle cx="300" cy="163" r="18" fill="#d8c9a0" opacity="0.2" />
      </svg>
    );
  }
  if (type === "window") {
    return (
      <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
        <rect width="400" height="250" fill="#08080a" />
        <rect x="40" y="15" width="320" height="220" fill="#0f0f12" />
        <rect x="178" y="65" width="44" height="60" fill="#d8a23f" opacity="0.85" />
        <line x1="200" y1="65" x2="200" y2="125" stroke="#0a0a0c" strokeWidth="2" />
        <line x1="178" y1="95" x2="222" y2="95" stroke="#0a0a0c" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox={vb} style={{ width: "100%", height: "100%" }}>
      <rect width="400" height="250" fill="#000000" />
    </svg>
  );
}

function IntroSequence({ onComplete }) {
  const [i, setI] = useState(0);
  const panel = INTRO_PANELS[i];
  const isLast = i === INTRO_PANELS.length - 1;

  function advance() {
    if (isLast) onComplete();
    else setI((n) => n + 1);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div onClick={advance} style={{ width: "100vw", height: "100vh", background: "#000",
      position: "relative", cursor: "pointer", overflow: "hidden", fontFamily: "monospace" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <IntroArt type={panel.art} />
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.16, mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        boxShadow: "inset 0 0 160px 60px rgba(0,0,0,0.85)" }} />
      <div style={{ position: "absolute", top: 24, left: 24, right: 24, maxWidth: 560,
        background: "#e8dcc0", border: "3px solid #000", padding: "10px 14px",
        color: "#0a0a0a", fontWeight: 700, fontSize: 14, letterSpacing: 0.5, lineHeight: 1.4 }}>
        {panel.caption}
      </div>
      <div style={{ position: "absolute", bottom: 24, right: 28, color: "#8a7d63", fontSize: 11, letterSpacing: 2 }}>
        {isLast ? "CLICK OR PRESS ENTER TO BEGIN" : "CLICK OR PRESS SPACE TO CONTINUE"}
      </div>
      <div style={{ position: "absolute", bottom: 24, left: 28, display: "flex", gap: 6 }}>
        {INTRO_PANELS.map((_, idx) => (
          <div key={idx} style={{ width: 6, height: 6, borderRadius: 3,
            background: idx === i ? "#d8a23f" : "#3a2f1e" }} />
        ))}
      </div>
    </div>
  );
}

function StartScreen({ onNewGame, onLoadGame, hasSave }) {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0807",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
      fontFamily: "monospace" }}>
      <div style={{ fontSize: 48, letterSpacing: 10, color: "#d8a23f", marginBottom: 8 }}>HARLOW</div>
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#8a7d63", marginBottom: 50 }}>
        SOMETHING IS WRONG WITH THIS TOWN
      </div>
      <button onClick={onNewGame} style={{ width: 260, marginBottom: 14, fontFamily: "monospace", fontSize: 14,
        letterSpacing: 2, padding: "14px 20px", background: "#d8a23f", color: "#15120d",
        border: "none", borderRadius: 4, cursor: "pointer" }}>
        NEW GAME
      </button>
      <button onClick={onLoadGame} disabled={!hasSave} style={{ width: 260, fontFamily: "monospace", fontSize: 14,
        letterSpacing: 2, padding: "14px 20px", background: "transparent",
        color: hasSave ? "#e8dcc0" : "#4a4030", border: "1px solid #3a2f1e", borderRadius: 4,
        cursor: hasSave ? "pointer" : "not-allowed" }}>
        LOAD GAME
      </button>
    </div>
  );
}

export default function World() {
  const [screen, setScreen] = useState("start"); // "start" | "game"
  const [hasSave, setHasSave] = useState(false);
  const [locationId, setLocationId] = useState("home");
  const [near, setNear] = useState(null);
  const [panel, setPanel] = useState(null);
  const [chatChar, setChatChar] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [ending, setEnding] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState({});
  const [fixingCar, setFixingCar] = useState(false);

  const nearRef = useRef(null);
  const pausedRef = useRef(false);
  const controlsRef = useRef();
  const location = LOCATIONS[locationId];
  pausedRef.current = panel !== null;

  useEffect(() => {
    const saved = loadSave();
    setHasSave(!!(saved && saved.sessionId));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    writeSave({ sessionId, gameState, locationId, messages });
  }, [sessionId, gameState, locationId, messages]);

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

  function startNewGame() {
    if (!window.confirm("Start a new game? This clears your current save.")) return;
    setEnding(null);
    setScreen("intro");
  }

  async function actuallyStartNewGame() {
    try {
      const data = await newSession();
      setSessionId(data.session_id);
      setGameState(data.state);
      setMessages({});
      setLocationId("home");
      setEnding(null);
      writeSave({ sessionId: data.session_id, gameState: data.state, locationId: "home", messages: {} });
      setHasSave(true);
      setScreen("game");
    } catch (e) {
      console.error("New game failed:", e);
    }
  }

  function beginIntro() {
    setEnding(null);
    setScreen("intro");
  }

  function loadGameFromMenu() {
    const saved = loadSave();
    if (!saved || !saved.sessionId) return;
    setSessionId(saved.sessionId);
    setGameState(saved.gameState);
    setLocationId(saved.locationId || "home");
    setMessages(saved.messages || {});
    setEnding(null);
    setScreen("game");
  }

  function handleSaveGame() {
    if (!sessionId) return;
    writeSave({ sessionId, gameState, locationId, messages });
    setHasSave(true);
    window.alert("Game saved.");
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

  // Deterministic story actions -- bypass the LLM classifier entirely so
  // these pivotal decisions don't depend on the model correctly inferring
  // intent from freeform chat.
  async function handleBroadcast() {
    if (!sessionId) return;
    if (!window.confirm("Send everything -- Ray's archive, Owen's documentation, the profile template -- to journalists and a federal tip line?")) return;
    try {
      const data = await setFlag(sessionId, "event", "broadcast_sent");
      setGameState(data.state);
      if (data.ending) setEnding(data.ending);
    } catch (e) {
      console.error("broadcast failed:", e);
    }
  }

  async function handleTakeDeal() {
    if (!sessionId) return;
    if (!window.confirm("Take Briggs' deal -- close the case as unsolved and stay in Harlow?")) return;
    try {
      const data = await setFlag(sessionId, "event", "deal_with_briggs");
      setGameState(data.state);
      if (data.ending) setEnding(data.ending);
    } catch (e) {
      console.error("take-deal failed:", e);
    }
  }

  async function handleFixCar() {
    if (!sessionId || fixingCar) return;
    setFixingCar(true);
    const playerLine = "I think we're going to need a way out of here. Can you fix up the car?";
    setMessages((m) => ({ ...m, owen: [...(m.owen || []), { role: "player", text: playerLine }] }));
    try {
      const chatData = await sendMessage(sessionId, "owen", playerLine);
      setMessages((m) => ({ ...m, owen: [...(m.owen || []), { role: "npc", text: chatData.reply }] }));
      const flagData = await setFlag(sessionId, "clue", "car_fixed");
      setGameState(flagData.state);
      if (flagData.ending) setEnding(flagData.ending);
    } catch (e) {
      console.error("fix-car failed:", e);
      setMessages((m) => ({ ...m, owen: [...(m.owen || []), { role: "npc", text: "(...no answer. is the backend running?)" }] }));
    } finally {
      setFixingCar(false);
    }
  }

  async function handleAskJoin(character) {
    if (!sessionId) return;
    try {
      const data = await setFlag(sessionId, "event", `party_${character}`);
      setGameState(data.state);
    } catch (e) {
      console.error("ask-join failed:", e);
    }
  }

  async function handleLeaveTonight() {
    const events = gameState?.world_events || [];
    const companions = events
      .filter((e) => e.startsWith("party_"))
      .map((e) => CHAR_NAMES[e.replace("party_", "")] || e);
    const names = companions.length ? companions.join(", ") : "just you and Owen";
    try {
      const data = await setFlag(sessionId, "event", "escaped_with_party");
      setGameState(data.state);
    } catch (e) {
      console.error("escape flag failed:", e);
    }
    setEnding({
      id: "escape",
      scene: `Night falls on Harlow. You load the car with ${names}, and pull out onto the logging road. The town's lights shrink behind you, then disappear behind the trees. You escaped.`,
    });
  }

  const nearLabel = location.interactables.find((i) => i.id === near)?.label;
  const hasRayArchive = (gameState?.clues_found || []).includes("ray_archive");
  const canLeaveTonight =
    (gameState?.day || 0) >= 5 &&
    (gameState?.clues_found || []).includes("car_fixed") &&
    (gameState?.world_events || []).includes("party_owen");

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0807" }}>
      {screen === "start" && (
        <StartScreen onNewGame={beginIntro} onLoadGame={loadGameFromMenu} hasSave={hasSave} />
      )}
      {screen === "intro" && (
        <IntroSequence onComplete={actuallyStartNewGame} />
      )}
      {screen === "game" && (
      <>
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
            <button onClick={startNewGame} style={{ position: "absolute", top: 54, right: 18,
  fontFamily: "monospace", fontSize: 12, letterSpacing: 1, padding: "6px 12px",
  background: "transparent", color: "#a05a5a", border: "1px solid #3a2f1e",
  borderRadius: 4, cursor: "pointer", zIndex: 51 }}>NEW GAME</button>
            <button onClick={handleSaveGame} style={{ position: "absolute", top: 54, right: 130,
  fontFamily: "monospace", fontSize: 12, letterSpacing: 1, padding: "6px 12px",
  background: "transparent", color: "#7a9e6a", border: "1px solid #3a2f1e",
  borderRadius: 4, cursor: "pointer", zIndex: 51 }}>SAVE GAME</button>
            {hasRayArchive && (
              <button onClick={handleBroadcast} style={{ position: "absolute", bottom: 20, right: 20,
                fontFamily: "monospace", fontSize: 13, letterSpacing: 1, padding: "10px 16px",
                background: "#d8a23f", color: "#15120d", border: "none", borderRadius: 4, cursor: "pointer", zIndex: 51 }}>
                SEND THE EVIDENCE
              </button>
            )}
            {canLeaveTonight && (
              <button onClick={handleLeaveTonight} style={{ position: "absolute", bottom: 20, left: 20,
                fontFamily: "monospace", fontSize: 13, letterSpacing: 1, padding: "10px 16px",
                background: "#d8a23f", color: "#15120d", border: "none", borderRadius: 4, cursor: "pointer", zIndex: 51 }}>
                LEAVE HARLOW TONIGHT
              </button>
            )}
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
          onTakeDeal={handleTakeDeal}
          onFixCar={handleFixCar}
          onAskJoin={handleAskJoin}
          day={gameState?.day || 0}
          worldEvents={gameState?.world_events || []}
          cluesFound={gameState?.clues_found || []}
          relationships={gameState?.relationships || {}}
          fixingCar={fixingCar}
        />
      )}
      {ending && (
  <div style={{ position: "fixed", inset: 0, background: "#0a0807", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
    color: "#e8dcc0", fontFamily: "monospace", textAlign: "center", padding: 40 }}>
    <div style={{ fontSize: 12, letterSpacing: 3, color: "#8a7d63", marginBottom: 12 }}>ENDING REACHED</div>
    <div style={{ fontSize: 28, color: "#d8a23f", marginBottom: 20 }}>{(ending.id || "").toUpperCase()}</div>
    <div style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 640, marginBottom: 30 }}>{ending.scene}</div>
    <button onClick={() => { setEnding(null); setScreen("start"); }} style={{ fontFamily: "monospace", fontSize: 13,
      letterSpacing: 2, padding: "12px 22px", background: "transparent", color: "#d8a23f",
      border: "1px solid #3a2f1e", borderRadius: 4, cursor: "pointer" }}>
      MAIN MENU
    </button>
  </div>
)}
      </>
      )}
    </div>
  );
}