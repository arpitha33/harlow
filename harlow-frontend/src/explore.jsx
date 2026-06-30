import { Suspense, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL = "/models/house.glb";

function Model() {
    const { scene } = useGLTF(MODEL);
    useEffect(() => {
      scene.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m) {
              m.side = THREE.DoubleSide;
              m.transparent = true;
              m.alphaTest = 0.5;
              m.needsUpdate = true;
            }
          });
        }
      });
    }, [scene]);
    return <primitive object={scene} />;
  }
useGLTF.preload(MODEL);

function FlyPlayer({ hudRef }) {
  const { camera } = useThree();
  const keys = useRef({});
  useEffect(() => {
    const down = (e) => { keys.current[e.code] = true; if (e.code === "Space") e.preventDefault(); };
    const up = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useFrame((_, delta) => {
    const speed = 10 * delta;
    const front = new THREE.Vector3();
    camera.getWorldDirection(front);
    front.y = 0;
    front.normalize();
    const right = new THREE.Vector3().crossVectors(front, new THREE.Vector3(0, 1, 0));
    const move = new THREE.Vector3();
    if (keys.current["KeyW"]) move.add(front);
    if (keys.current["KeyS"]) move.sub(front);
    if (keys.current["KeyD"]) move.add(right);
    if (keys.current["KeyA"]) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
    }
    if (keys.current["Space"]) camera.position.y += speed;
    if (keys.current["ShiftLeft"]) camera.position.y -= speed;
    if (hudRef.current) {
      const p = camera.position;
      hudRef.current.textContent = `x: ${p.x.toFixed(1)}   y: ${p.y.toFixed(1)}   z: ${p.z.toFixed(1)}`;
    }
  });
  return null;
}

export default function Explore() {
  const hudRef = useRef();
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0807" }}>
      <Canvas camera={{ position: [0, 5, 10], fov: 70 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} />
        <Suspense fallback={null}><Model /></Suspense>
        <FlyPlayer hudRef={hudRef} />
        <PointerLockControls />
      </Canvas>
      <div ref={hudRef} style={{ position: "absolute", top: 12, left: 12, color: "#9f9",
        fontFamily: "monospace", fontSize: 13, background: "rgba(0,0,0,0.5)", padding: "6px 10px" }}>
        x: –   y: –   z: –
      </div>
      <div style={{ position: "absolute", bottom: 20, left: 20, color: "#fff",
        fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>
        Click to look · WASD move · Space up · Shift down
      </div>
    </div>
  );
}