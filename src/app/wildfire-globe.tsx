"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Rough provincial/territorial centroids - just enough to scatter glowing
// hotspot dots recognizably over Canada's shape, not a precise atlas.
const HOTSPOTS: [number, number][] = [
  [54.7, -125.6], // BC
  [55.0, -115.0], // AB
  [55.0, -106.0], // SK
  [55.0, -98.0], // MB
  [50.0, -85.0], // ON
  [52.0, -71.0], // QC
  [46.5, -66.0], // NB
  [45.0, -63.0], // NS
  [53.0, -60.0], // NL
  [64.0, -135.0], // YT
  [65.0, -119.0], // NT
  [70.0, -90.0], // NU
];

// Loose network linking neighbouring hotspots, west to east - a decorative
// "telemetry links" read, not a claim about real data relationships.
const ARCS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [5, 8], [9, 10], [10, 11], [1, 9],
];

function latLonToVec3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 90) * (Math.PI / 180);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function arcPoints(start: THREE.Vector3, end: THREE.Vector3, lift: number, segments = 24) {
  const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(start.length() + lift);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  return curve.getPoints(segments);
}

function ArcLines({ positions }: { positions: THREE.Vector3[] }) {
  const matRefs = useRef<THREE.LineBasicMaterial[]>([]);
  const arcs = useMemo(
    () => ARCS.map(([a, b]) => arcPoints(positions[a], positions[b], 0.22)),
    [positions],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    matRefs.current.forEach((mat, i) => {
      if (!mat) return;
      mat.opacity = 0.15 + (Math.sin(t * 1.3 + i * 1.7) * 0.5 + 0.5) * 0.35;
    });
  });

  return (
    <>
      {arcs.map((points, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            ref={(el) => {
              if (el) matRefs.current[i] = el;
            }}
            color="#ffb020"
            transparent
            opacity={0.3}
          />
        </line>
      ))}
    </>
  );
}

function Globe() {
  const groupRef = useRef<THREE.Group>(null);
  const hotspotRefs = useRef<THREE.Mesh[]>([]);

  const positions = useMemo(() => HOTSPOTS.map(([lat, lon]) => latLonToVec3(lat, lon, 1.52)), []);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
      // Subtle mouse-parallax tilt on top of the constant spin - r3f tracks
      // pointer position over the canvas automatically (state.pointer, -1..1),
      // no extra listeners needed. Damped with lerp so it drifts, not snaps.
      const targetTiltX = state.pointer.y * 0.15;
      const targetTiltZ = -state.pointer.x * 0.12;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetTiltX, delta * 2);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetTiltZ, delta * 2);
    }
    const t = state.clock.elapsedTime;
    hotspotRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = 1 + Math.sin(t * 2 + i) * 0.35;
      mesh.scale.setScalar(s);
    });
  });

  return (
    <group ref={groupRef}>
      {/* Wireframe globe */}
      <mesh>
        <icosahedronGeometry args={[1.5, 3]} />
        <meshBasicMaterial color="#4a3020" wireframe transparent opacity={0.35} />
      </mesh>
      {/* Faint solid core so the wireframe reads as a sphere, not a net */}
      <mesh>
        <icosahedronGeometry args={[1.48, 3]} />
        <meshBasicMaterial color="#0d0b09" transparent opacity={0.6} />
      </mesh>
      {/* Telemetry link arcs between hotspots */}
      <ArcLines positions={positions} />
      {/* Hotspot embers over Canada */}
      {positions.map((pos, i) => (
        <mesh
          key={i}
          position={pos}
          ref={(el) => {
            if (el) hotspotRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshBasicMaterial color="#ff5a1f" />
        </mesh>
      ))}
    </group>
  );
}

export function WildfireGlobe() {
  return (
    <Canvas
      camera={{ position: [0, 0.3, 4], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1} />
      <Globe />
    </Canvas>
  );
}
