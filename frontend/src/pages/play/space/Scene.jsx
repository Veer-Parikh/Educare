import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { BODIES, BY_ID, PLANETS } from "./planets";
import { makeGlowTexture, makePlanetTexture, makeRingTexture, rng } from "./textures";

// The real orbital speeds from the data are tiny; scale them so motion reads.
const ORBIT_SCALE = 14;
const SPIN_SCALE = 40;
const BRAND = "#FFC700";
const ORIGIN = new THREE.Vector3();

const hitRadius = (b) => (b.id === "sun" ? b.radius * 1.05 : b.hasRings ? b.radius + 2 : Math.max(b.radius * 1.6, b.radius + 1));
const isPortrait = (size) => size.width / size.height < 0.8;
const homeFor = (portrait, out) => (portrait ? out.set(0, 92, 112) : out.set(0, 36, 80));

/** Disposes procedurally created textures when the owner unmounts. */
function useProcTexture(factory, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(factory, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function pointerHandlers(id, { onSelect, hoverRef, setCursor }) {
  return {
    onClick: (e) => {
      e.stopPropagation();
      onSelect(id);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      hoverRef.current = id;
      setCursor("pointer");
    },
    onPointerOut: () => {
      if (hoverRef.current === id) hoverRef.current = null;
      setCursor("");
    },
  };
}

/** Invisible, slightly larger sphere so small planets are easy to tap. */
function HitSphere({ body, ctx }) {
  return (
    <mesh {...pointerHandlers(body.id, ctx)}>
      <sphereGeometry args={[hitRadius(body), 16, 12]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

function SelectionRing({ radius }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.25;
  });
  return (
    <Billboard>
      <mesh>
        <ringGeometry args={[radius * 1.32, radius * 1.4, 64]} />
        <meshBasicMaterial ref={mat} color={BRAND} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** Sonar-style pulse that marks the mission target. */
function TargetBeacon({ radius }) {
  const mesh = useRef();
  const mat = useRef();
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 2) / 2;
    if (mesh.current) mesh.current.scale.setScalar(1 + t * 1.6);
    if (mat.current) mat.current.opacity = 0.7 * (1 - t);
  });
  return (
    <Billboard>
      <mesh ref={mesh}>
        <ringGeometry args={[radius * 1.25, radius * 1.33, 64]} />
        <meshBasicMaterial ref={mat} color={BRAND} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

function OrbitPath({ radius, highlight }) {
  const geometry = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color={highlight ? BRAND : "#ffffff"} transparent opacity={highlight ? 0.55 : 0.11} depthWrite={false} />
    </lineLoop>
  );
}

function SaturnRings({ radius }) {
  const inner = radius * 1.25;
  const outer = radius * 2.3;
  const geometry = useMemo(() => {
    const geo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return geo;
  }, [inner, outer]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tex = useProcTexture(() => makeRingTexture(9), []);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial map={tex} color="#e6d6b0" side={THREE.DoubleSide} transparent depthWrite={false} />
    </mesh>
  );
}

function Moon({ paused }) {
  const pivot = useRef();
  useFrame((_, dt) => {
    if (!paused && pivot.current) pivot.current.rotation.y += Math.min(dt, 0.1) * 0.9;
  });
  return (
    <group ref={pivot}>
      <mesh position={[2.3, 0.15, 0]}>
        <sphereGeometry args={[0.34, 24, 16]} />
        <meshStandardMaterial color="#bdbab4" roughness={1} />
      </mesh>
    </group>
  );
}

function Sun({ body, selected, ctx }) {
  const mesh = useRef();
  const tex = useProcTexture(() => makePlanetTexture(body), [body]);
  const glow = useProcTexture(() => makeGlowTexture(), []);
  const hover = useRef(1);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    if (!mesh.current) return;
    mesh.current.rotation.y += dt * body.rotationSpeed * SPIN_SCALE;
    const target = ctx.hoverRef.current === body.id ? 1.03 : 1;
    hover.current += (target - hover.current) * Math.min(1, dt * 10);
    mesh.current.scale.setScalar(hover.current);
  });
  return (
    <group>
      <mesh ref={mesh}>
        <sphereGeometry args={[body.radius, 48, 32]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <sprite scale={[body.radius * 5.4, body.radius * 5.4, 1]}>
        <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
      </sprite>
      <HitSphere body={body} ctx={ctx} />
      {selected ? <SelectionRing radius={body.radius} /> : null}
    </group>
  );
}

function Planet({ body, paused, selected, isTarget, positions, ctx }) {
  const holder = useRef();
  const spin = useRef();
  const tilt = useRef();
  const hover = useRef(1);
  const angle = useRef(null);
  const tex = useProcTexture(() => makePlanetTexture(body), [body]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    if (angle.current === null) angle.current = Math.atan2(-positions.current[body.id].z, positions.current[body.id].x);
    if (!paused) angle.current += body.orbitSpeed * ORBIT_SCALE * dt;
    const x = Math.cos(angle.current) * body.orbitRadius;
    const z = -Math.sin(angle.current) * body.orbitRadius;
    holder.current?.position.set(x, 0, z);
    positions.current[body.id].set(x, 0, z);
    if (spin.current) spin.current.rotation.y += body.rotationSpeed * SPIN_SCALE * dt;
    const target = ctx.hoverRef.current === body.id ? 1.1 : 1;
    hover.current += (target - hover.current) * Math.min(1, dt * 10);
    tilt.current?.scale.setScalar(hover.current);
  });

  return (
    <>
      <OrbitPath radius={body.orbitRadius} highlight={selected || isTarget} />
      <group ref={holder} position={positions.current[body.id].toArray()}>
        <group ref={tilt} rotation={[0, 0, body.tilt ?? 0]}>
          <mesh ref={spin}>
            <sphereGeometry args={[body.radius, 40, 28]} />
            <meshStandardMaterial map={tex} roughness={0.92} metalness={0} />
          </mesh>
          {body.atmosphere ? (
            <mesh scale={1.07}>
              <sphereGeometry args={[body.radius, 32, 20]} />
              <meshBasicMaterial color={body.atmosphere} transparent opacity={0.16} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          ) : null}
          {body.hasRings ? <SaturnRings radius={body.radius} /> : null}
        </group>
        {body.id === "earth" ? <Moon paused={paused} /> : null}
        <HitSphere body={body} ctx={ctx} />
        {selected ? <SelectionRing radius={body.hasRings ? body.radius * 1.8 : body.radius} /> : null}
        {isTarget && !selected ? <TargetBeacon radius={body.hasRings ? body.radius * 1.8 : body.radius} /> : null}
      </group>
    </>
  );
}

function AsteroidBelt({ paused }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const n = 900;
    const r = rng(7);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = 29.5 + (r() + r() - 1) * 2.2;
      arr[i * 3] = Math.cos(a) * rad;
      arr[i * 3 + 1] = (r() - 0.5) * 0.9;
      arr[i * 3 + 2] = Math.sin(a) * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, dt) => {
    if (!paused && ref.current) ref.current.rotation.y += 0.003 * ORBIT_SCALE * Math.min(dt, 0.1);
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.16} color="#9d9483" sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

/**
 * Camera choreography:
 *  - fly:   glide to a 3/4 view of the selected body (controls off)
 *  - track: follow the moving body; the user can still orbit/zoom around it
 *  - home:  glide back to the overview (cancelled as soon as the user drags)
 *  - free:  plain OrbitControls
 */
function CameraRig({ selectedId, positions, homeNonce, autoRotate }) {
  const { camera, size } = useThree();
  const controls = useRef();
  const rig = useRef({ mode: "home", t: 0 });
  const v = useMemo(
    () => ({ last: new THREE.Vector3(), desired: new THREE.Vector3(), out: new THREE.Vector3(), tan: new THREE.Vector3(), home: new THREE.Vector3(), delta: new THREE.Vector3() }),
    [],
  );

  useEffect(() => {
    rig.current = { mode: selectedId ? "fly" : "home", t: 0 };
  }, [selectedId, homeNonce]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.minDistance = 0.5;
    c.maxDistance = 400;
    const onStart = () => {
      if (rig.current.mode === "home") {
        rig.current.mode = "free";
        c.minDistance = 8;
        c.maxDistance = 190;
      }
    };
    c.addEventListener("start", onStart);
    return () => c.removeEventListener("start", onStart);
  }, []);

  useFrame((_, raw) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(raw, 0.1);
    const s = rig.current;
    s.t += dt;
    const portrait = isPortrait(size);
    const fov = portrait ? 62 : 50;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    c.autoRotate = autoRotate && !selectedId;
    c.autoRotateSpeed = 0.35;
    const k = 1 - Math.exp(-dt * 3);

    if (selectedId && (s.mode === "fly" || s.mode === "track")) {
      const body = BY_ID[selectedId];
      const p = positions.current[selectedId];
      if (s.mode === "fly") {
        c.enabled = false;
        const dist = body.view * (portrait ? 1.4 : 1);
        if (selectedId === "sun") {
          v.desired.set(0.55, 0.42, 1).normalize().multiplyScalar(dist);
        } else {
          // Sun-side three-quarter view: mostly lit, with the terminator visible.
          v.out.copy(p).normalize();
          v.tan.set(-v.out.z, 0, v.out.x);
          v.desired.copy(v.out).multiplyScalar(-0.5).addScaledVector(v.tan, 0.8).setY(0.42).normalize().multiplyScalar(dist).add(p);
        }
        c.target.lerp(p, Math.min(1, k * 1.5));
        camera.position.lerp(v.desired, k);
        camera.lookAt(c.target);
        const arrived = camera.position.distanceTo(v.desired) < body.radius * 0.1 && c.target.distanceTo(p) < body.radius * 0.05;
        if (arrived || s.t > 3.2) {
          s.mode = "track";
          v.last.copy(p);
          c.minDistance = body.radius * 1.6;
          c.maxDistance = body.view * 4;
          c.enablePan = false;
          c.enabled = true;
        }
      } else {
        // OrbitControls already updated this frame; carry camera + target along with the body.
        v.delta.copy(p).sub(v.last);
        camera.position.add(v.delta);
        c.target.add(v.delta);
        v.last.copy(p);
      }
    } else if (s.mode === "home") {
      c.enabled = true;
      c.enablePan = true;
      homeFor(portrait, v.home);
      c.target.lerp(ORIGIN, k);
      camera.position.lerp(v.home, k * 0.8);
      camera.lookAt(c.target);
      if (camera.position.distanceTo(v.home) < 1 || s.t > 4.5) {
        s.mode = "free";
        c.minDistance = 8;
        c.maxDistance = 190;
      }
    } else if (!c.enabled) {
      c.enabled = true;
    }
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} rotateSpeed={0.6} zoomSpeed={0.8} />;
}

/** Positions the DOM name labels over their bodies each frame (no React renders). */
function LabelTracker({ labelRefs, positions, hoverRef, selectedId, labelsOn }) {
  const { camera, size } = useThree();
  const v = useMemo(() => ({ p: new THREE.Vector3(), up: new THREE.Vector3() }), []);
  useFrame(() => {
    v.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const b of BODIES) {
      const el = labelRefs.current[b.id];
      if (!el) continue;
      const hovered = hoverRef.current === b.id;
      const show = (labelsOn || hovered) && selectedId !== b.id;
      if (show) {
        v.p.copy(positions.current[b.id]).addScaledVector(v.up, (b.hasRings ? b.radius * 1.3 : b.radius * 1.15) + 0.5);
        v.p.project(camera);
        if (v.p.z < 1 && v.p.z > -1) {
          const x = (v.p.x * 0.5 + 0.5) * size.width;
          const y = (-v.p.y * 0.5 + 0.5) * size.height;
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          el.style.opacity = hovered ? "1" : "0.72";
          continue;
        }
      }
      if (el.style.opacity !== "0") el.style.opacity = "0";
    }
  });
  return null;
}

/**
 * Shifts the rendered view (not the camera) so the focused body stays visible
 * beside the side panel (desktop) or above the bottom sheet (mobile).
 */
function ViewShift({ shift }) {
  const { camera, size } = useThree();
  const cur = useRef({ x: 0, y: 0 });
  useFrame((_, raw) => {
    const k = 1 - Math.exp(-Math.min(raw, 0.1) * 6);
    const c = cur.current;
    const tx = shift.x;
    const ty = shift.y * size.height;
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    if (Math.abs(c.x) < 0.5 && Math.abs(c.y) < 0.5 && tx === 0 && ty === 0) {
      c.x = 0;
      c.y = 0;
      if (camera.view?.enabled) camera.clearViewOffset();
      return;
    }
    camera.setViewOffset(size.width, size.height, c.x, c.y, size.width, size.height);
  });
  return null;
}

export function SpaceScene({ selectedId, onSelect, hoverRef, setCursor, positions, paused, labelRefs, labelsOn, missionId, homeNonce, autoRotate, shift }) {
  const ctx = useMemo(() => ({ onSelect, hoverRef, setCursor }), [onSelect, hoverRef, setCursor]);
  return (
    <>
      <color attach="background" args={["#05060a"]} />
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={3} decay={0} color="#fff3dc" />
      <hemisphereLight args={["#9fb4ff", "#1a1208", 0.12]} />
      <Stars radius={210} depth={80} count={4000} factor={7} saturation={0} fade speed={0.5} />
      <Sun body={BY_ID.sun} selected={selectedId === "sun"} ctx={ctx} />
      {PLANETS.map((p) => (
        <Planet key={p.id} body={p} paused={paused} selected={selectedId === p.id} isTarget={missionId === p.id} positions={positions} ctx={ctx} />
      ))}
      <AsteroidBelt paused={paused} />
      <CameraRig selectedId={selectedId} positions={positions} homeNonce={homeNonce} autoRotate={autoRotate} />
      <LabelTracker labelRefs={labelRefs} positions={positions} hoverRef={hoverRef} selectedId={selectedId} labelsOn={labelsOn} />
      <ViewShift shift={shift} />
    </>
  );
}
