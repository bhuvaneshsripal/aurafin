import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, Sparkles } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { easeOutCubic, mulberry32, ramp, scrollState, smooth } from './growthMath';

/* ----------------------------------------------------------------------------
   Layout constants (world units). Ground sits at BASE_Y.
   Left: coin stacks. Right: compounding graph. Centre: golden tree.
---------------------------------------------------------------------------- */
const BASE_Y = -1.4;
const COIN_R = 0.28;
const COIN_T = 0.055;

/* ----------------------------------------------------------------------------
   Shared geometry and materials. Built once and reused by every instance,
   which keeps draw calls and GPU memory low.
---------------------------------------------------------------------------- */
const coinBody = new CylinderGeometry(COIN_R, COIN_R, COIN_T, 48);
const coinRing = new TorusGeometry(COIN_R * 0.68, 0.012, 8, 56);
const goldMat = new MeshStandardMaterial({ color: '#e2b75a', metalness: 1, roughness: 0.24, envMapIntensity: 1.5 });
const goldBright = new MeshStandardMaterial({ color: '#fff1bf', metalness: 1, roughness: 0.14, envMapIntensity: 1.8 });
const barkMat = new MeshStandardMaterial({ color: '#c18f2c', metalness: 0.9, roughness: 0.42 });
const emeraldMat = new MeshStandardMaterial({
  color: '#0e7f5a',
  metalness: 0.15,
  roughness: 0.3,
  emissive: '#065f46',
  emissiveIntensity: 0.55,
  transparent: true,
  opacity: 0.92,
});
const emeraldGlow = new MeshStandardMaterial({
  color: '#34d399',
  metalness: 0.2,
  roughness: 0.25,
  emissive: '#10b981',
  emissiveIntensity: 1.6,
});
const floorMat = new MeshStandardMaterial({ color: '#060d19', roughness: 0.55, metalness: 0.3 });

/** One gold coin: a disc with a raised rim ring on each face. */
function Coin() {
  return (
    <>
      <mesh geometry={coinBody} material={goldMat} castShadow />
      <mesh
        geometry={coinRing}
        material={goldBright}
        position={[0, COIN_T / 2 + 0.002, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={coinRing}
        material={goldBright}
        position={[0, -COIN_T / 2 - 0.002, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </>
  );
}

/* ----------------------------------------------------------------------------
   1. The seed: a small glowing coin that lifts, then dissolves into the rest.
---------------------------------------------------------------------------- */
function Seed() {
  const group = useRef<Group>(null);
  const glow = useRef<Mesh>(null);

  useFrame((state) => {
    const p = scrollState.smooth;
    const t = state.clock.elapsedTime;
    const vis = 1 - smooth(ramp(p, 0.16, 0.34));
    const intro = 0.5 + 0.2 * smooth(ramp(p, 0, 0.12));
    if (group.current) {
      group.current.visible = vis > 0.002;
      group.current.scale.setScalar(Math.max(vis * intro, 0.0001));
      group.current.position.y = -0.15 + smooth(ramp(p, 0, 0.22)) * 0.55;
      group.current.rotation.set(0.25, t * 0.9, 0);
    }
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06);
  });

  return (
    <group ref={group}>
      <Coin />
      <mesh ref={glow}>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.07} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------------------------------
   2. Coin stacks: three columns that grow taller as the scroll advances.
---------------------------------------------------------------------------- */
const STACK_X = [-2.5, -1.8, -1.1];
const STACK_N = 16;
const STACK_STEP = 0.075;

function Stacks() {
  const refs = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const p = scrollState.smooth;
    const fade = 1 - smooth(ramp(p, 0.72, 0.9));
    STACK_X.forEach((_, c) => {
      // Columns start one after another, so the growth reads as staggered.
      const height = smooth(ramp(p, 0.14 + c * 0.05, 0.5 + c * 0.05)) * STACK_N;
      for (let i = 0; i < STACK_N; i++) {
        const g = refs.current[c * STACK_N + i];
        if (!g) continue;
        const s = smooth(height - i) * fade;
        g.visible = s > 0.002;
        g.scale.setScalar(Math.max(s, 0.0001));
      }
    });
  });

  return (
    <>
      {STACK_X.flatMap((x, c) =>
        Array.from({ length: STACK_N }, (_, i) => (
          <group
            key={`${c}-${i}`}
            ref={(el) => {
              refs.current[c * STACK_N + i] = el;
            }}
            position={[x, BASE_Y + COIN_T / 2 + i * STACK_STEP, 0]}
          >
            <Coin />
          </group>
        )),
      )}
    </>
  );
}

/* ----------------------------------------------------------------------------
   3. Compounding graph: a glowing line that draws itself, with bars that
   rise beneath it. The curve is an illustrative exponential shape, not data.
---------------------------------------------------------------------------- */
const GRAPH_N = 40;
const TUBE_SEGS = 90;
const TUBE_RADIAL = 8;
const graphY = (t: number) => (Math.exp(2.6 * t) - 1) / (Math.exp(2.6) - 1);
const graphPoint = (t: number) => new Vector3(0.7 + 2.9 * t, BASE_Y + 3.3 * graphY(t), 0);
const graphCurve = new CatmullRomCurve3(
  Array.from({ length: GRAPH_N }, (_, i) => graphPoint(i / (GRAPH_N - 1))),
);
const graphTube = new TubeGeometry(graphCurve, TUBE_SEGS, 0.04, TUBE_RADIAL, false);
const BAR_T = [0.12, 0.3, 0.48, 0.66, 0.84];
const BAR_H = BAR_T.map((t) => graphPoint(t).y - BASE_Y);
const barBox = new BoxGeometry(0.2, 1, 0.2);
barBox.translate(0, 0.5, 0); // pivot at the bottom so scale.y grows upward

function GrowthGraph() {
  const tube = useRef<Mesh>(null);
  const tip = useRef<Group>(null);
  const bars = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const p = scrollState.smooth;
    const fade = 1 - smooth(ramp(p, 0.72, 0.9));
    const f = smooth(ramp(p, 0.34, 0.66)) * fade;

    if (tube.current) {
      tube.current.visible = f > 0.002;
      // Indexed tube geometry is built segment by segment, so the draw range
      // reveals the line progressively without rebuilding any geometry.
      tube.current.geometry.setDrawRange(0, Math.max(1, Math.floor(f * TUBE_SEGS)) * TUBE_RADIAL * 6);
    }
    if (tip.current) {
      tip.current.visible = f > 0.01;
      if (f > 0.01) tip.current.position.copy(graphCurve.getPointAt(Math.min(f, 1)));
    }
    BAR_T.forEach((_, i) => {
      const g = bars.current[i];
      if (!g) return;
      const v = smooth(f * 1.6 - i * 0.12);
      g.visible = v > 0.002;
      g.scale.y = Math.max(0.0001, BAR_H[i] * v);
    });
  });

  return (
    <>
      <mesh ref={tube} geometry={graphTube} material={emeraldGlow} castShadow />
      <group ref={tip}>
        <mesh>
          <sphereGeometry args={[0.1, 20, 20]} />
          <meshBasicMaterial color="#d1fae5" />
        </mesh>
      </group>
      {BAR_T.map((t, i) => (
        <group
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          position={[graphPoint(t).x, BASE_Y, 0]}
        >
          <mesh geometry={barBox} material={emeraldMat} castShadow />
        </group>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------------------
   4. Golden tree: branches grown from a seeded recursion, with coin leaves
   placed as an instanced mesh. Scales up from the ground in the final act.
---------------------------------------------------------------------------- */
interface Limb {
  a: Vector3;
  b: Vector3;
  r0: number;
  r1: number;
}

function buildTree(seed: number, depth: number) {
  const rnd = mulberry32(seed);
  const limbs: Limb[] = [];
  const tips: Vector3[] = [];
  const up = new Vector3(0, 1, 0);

  const grow = (origin: Vector3, dir: Vector3, len: number, radius: number, level: number) => {
    const end = origin.clone().addScaledVector(dir, len);
    limbs.push({ a: origin, b: end, r0: radius, r1: radius * 0.7 });
    if (level >= depth) {
      tips.push(end);
      return;
    }
    const kids = level === 0 ? 3 : rnd() > 0.45 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      // Tilt the child away from its parent around a random perpendicular axis.
      const axis = new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(dir).normalize();
      const spread = level === 0 ? 0.5 + rnd() * 0.25 : 0.38 + rnd() * 0.4;
      const nd = dir.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, spread));
      nd.y += 0.12; // a slight upward bias keeps the canopy lifting
      nd.normalize();
      grow(end, nd, len * (0.7 + rnd() * 0.06), radius * 0.7, level + 1);
    }
  };

  grow(new Vector3(0, 0, 0), up, 1.2, 0.17, 0);
  return { limbs, tips };
}

function leafLayout(tips: Vector3[], perTip: number, seed: number) {
  const rnd = mulberry32(seed);
  const out: { pos: Vector3; rot: [number, number, number]; s: number }[] = [];
  for (const tip of tips) {
    for (let k = 0; k < perTip; k++) {
      out.push({
        pos: tip.clone().add(new Vector3((rnd() - 0.5) * 0.7, (rnd() - 0.2) * 0.55, (rnd() - 0.5) * 0.7)),
        rot: [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI],
        s: 0.85 + rnd() * 0.4,
      });
    }
  }
  return out;
}

function GoldenTree({ leafPerTip }: { leafPerTip: number }) {
  const { limbs, tips } = useMemo(() => buildTree(11, 4), []);
  const limbMeshes = useMemo(
    () =>
      limbs.map((l) => {
        const dir = l.b.clone().sub(l.a);
        const len = dir.length();
        return {
          geo: new CylinderGeometry(l.r1, l.r0, len, 8, 1),
          mid: l.a.clone().add(l.b).multiplyScalar(0.5),
          quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()),
        };
      }),
    [limbs],
  );
  const leaves = useMemo(() => leafLayout(tips, leafPerTip, 23), [tips, leafPerTip]);
  const leafGeo = useMemo(() => new CylinderGeometry(0.17, 0.17, 0.024, 28), []);

  const group = useRef<Group>(null);
  const leafRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = leafRef.current;
    if (!mesh) return;
    const d = new Object3D();
    leaves.forEach((L, i) => {
      d.position.copy(L.pos);
      d.rotation.set(L.rot[0], L.rot[1], L.rot[2]);
      d.scale.setScalar(L.s);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [leaves]);

  useFrame((state) => {
    const p = scrollState.smooth;
    const g = easeOutCubic(ramp(p, 0.7, 0.94));
    if (!group.current) return;
    group.current.visible = g > 0.002;
    group.current.scale.setScalar(Math.max(g * 1.2, 0.0001));
    group.current.rotation.y = state.clock.elapsedTime * 0.12;
  });

  return (
    <group ref={group} position={[0, BASE_Y, 0]}>
      {limbMeshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={barkMat} position={m.mid} quaternion={m.quat} castShadow />
      ))}
      <instancedMesh ref={leafRef} args={[leafGeo, goldMat, leaves.length]} castShadow />
    </group>
  );
}

/** Soft warm glow behind the tree, drawn from a small generated gradient (no image download). */
function Halo() {
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(253, 230, 138, 1)');
      g.addColorStop(0.35, 'rgba(253, 230, 138, 0.35)');
      g.addColorStop(1, 'rgba(253, 230, 138, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new CanvasTexture(c);
    return new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  const plane = useMemo(() => new PlaneGeometry(6.4, 6.4), []);

  useFrame(() => {
    mat.opacity = 0.2 * easeOutCubic(ramp(scrollState.smooth, 0.72, 0.96));
  });

  return <mesh geometry={plane} material={mat} position={[0, 0.9, -1.6]} />;
}

/* ----------------------------------------------------------------------------
   5. Up arrow: an extruded, bevelled arrow that rises beside the tree.
---------------------------------------------------------------------------- */
const arrowMat = new MeshStandardMaterial({
  color: '#f7d774',
  metalness: 0.85,
  roughness: 0.22,
  emissive: '#b7791f',
  emissiveIntensity: 0.6,
});

const arrowGeo = (() => {
  const s = new Shape();
  s.moveTo(0, 1.25);
  s.lineTo(0.72, 0.35);
  s.lineTo(0.3, 0.35);
  s.lineTo(0.3, -0.95);
  s.lineTo(-0.3, -0.95);
  s.lineTo(-0.3, 0.35);
  s.lineTo(-0.72, 0.35);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.center();
  return g;
})();

function UpArrow() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const a = smooth(ramp(scrollState.smooth, 0.84, 0.98));
    group.current.visible = a > 0.002;
    group.current.scale.setScalar(Math.max(a * 1.15, 0.0001));
    group.current.position.y = 0.2 - (1 - a) * 0.8;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.25;
  });

  return (
    <group ref={group} position={[2.2, 0.2, 0.2]}>
      <mesh geometry={arrowGeo} material={arrowMat} castShadow />
    </group>
  );
}

/* ----------------------------------------------------------------------------
   6. Floating coins that drift around the composition in the growth act.
---------------------------------------------------------------------------- */
const FLOATERS = Array.from({ length: 14 }, (_, i) => {
  const r = mulberry32(900 + i);
  return {
    a: r() * Math.PI * 2,
    R: 2.6 + r() * 1.7,
    y: -0.4 + r() * 3.2,
    spd: 0.16 + r() * 0.22,
    sc: 0.5 + r() * 0.45,
    bob: 0.6 + r() * 0.8,
  };
});

function FloatingCoins() {
  const refs = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    const vis = smooth(ramp(scrollState.smooth, 0.5, 0.7));
    const t = state.clock.elapsedTime;
    FLOATERS.forEach((f, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ang = f.a + t * f.spd;
      // Keep floaters behind the composition (z <= 0) so none passes close to the camera and blooms.
      g.position.set(Math.cos(ang) * f.R, f.y + Math.sin(t * f.bob + i) * 0.14, -Math.abs(Math.sin(ang)) * f.R);
      g.rotation.set(t * 0.6 + i, t * f.spd * 2, 0);
      g.visible = vis > 0.002;
      g.scale.setScalar(Math.max(f.sc * vis, 0.0001));
    });
  });

  return (
    <>
      {FLOATERS.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <Coin />
        </group>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------------------
   Camera: a smooth path through five keyframes. Progress is damped so the move
   stays fluid. Portrait screens pull back so the composition still fits.
---------------------------------------------------------------------------- */
const CAM_POS = [
  new Vector3(0, 0.35, 4.4),
  new Vector3(1.9, 1.5, 6.3),
  new Vector3(-1.6, 2.3, 8.2),
  new Vector3(0.3, 3.1, 10.2),
  new Vector3(0.9, 3.4, 12.2),
];
const CAM_LOOK = [
  new Vector3(0, -0.2, 0),
  new Vector3(0, -0.1, 0),
  new Vector3(0, 0.6, 0),
  new Vector3(0, 1.2, 0),
  new Vector3(0.1, 1.4, 0),
];
const camPosCurve = new CatmullRomCurve3(CAM_POS);
const camLookCurve = new CatmullRomCurve3(CAM_LOOK);

function CameraRig() {
  const tmpPos = useMemo(() => new Vector3(), []);
  const tmpLook = useMemo(() => new Vector3(), []);

  useFrame((state, dt) => {
    const s = scrollState;
    // Catch up quickly so fast scrolling never leaves the scene behind the captions.
    // Clamp dt so a dropped frame or a backgrounded tab cannot make the step overshoot.
    const step = Math.min(dt, 1 / 30);
    s.smooth += (s.progress - s.smooth) * (1 - Math.exp(-step * 14));
    if (Math.abs(s.progress - s.smooth) < 0.0005) s.smooth = s.progress;
    const p = s.smooth;

    const { width, height } = state.size;
    const aspect = width / height;
    const zoom = aspect < 0.7 ? 1.6 : aspect < 1.1 ? 1.25 : 1;

    camPosCurve.getPoint(p, tmpPos);
    camLookCurve.getPoint(p, tmpLook);
    // On phones the scene is only the top part of the screen (copy sits below),
    // so aim lower to lift the ground-level subject into the visible area.
    if (aspect < 1.1) tmpLook.y -= 1.1;
    tmpPos.sub(tmpLook).multiplyScalar(zoom).add(tmpLook);

    // On wide screens the copy sits on the left, so slide the whole view
    // sideways (a translation, not a rotation) to keep the subject clear of it.
    if (aspect >= 1.1) {
      const dx = 0.1 * tmpPos.distanceTo(tmpLook);
      tmpPos.x -= dx;
      tmpLook.x -= dx;
    }

    const t = state.clock.elapsedTime;
    tmpPos.x += Math.sin(t * 0.31) * 0.16;
    tmpPos.y += Math.sin(t * 0.23) * 0.07;

    state.camera.position.lerp(tmpPos, 1 - Math.exp(-step * 12));
    state.camera.lookAt(tmpLook);
  });

  return null;
}

/* ----------------------------------------------------------------------------
   Ground: a dark reflective-looking floor with a faded grid for depth.
---------------------------------------------------------------------------- */
function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BASE_Y - 0.01, 0]} receiveShadow material={floorMat}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      <Grid
        position={[0, BASE_Y, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#16384f"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#23607f"
        fadeDistance={16}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
    </>
  );
}

/* ----------------------------------------------------------------------------
   Render pacing. The canvas runs in 'demand' mode and this component requests
   a frame each animation tick, but only while the section is on screen.
   Toggling R3F's own frameloop prop does not reliably restart a stopped loop,
   so pausing is handled here instead.
---------------------------------------------------------------------------- */
function Ticker({ paused }: { paused: boolean }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const tick = () => {
      invalidate();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, invalidate]);

  return null;
}

/* ----------------------------------------------------------------------------
   Scene root
---------------------------------------------------------------------------- */
interface GrowthSceneProps {
  tier: 'high' | 'low';
  /** True when the section is off-screen. Stops the render loop to save battery. */
  paused: boolean;
  onContextLost: () => void;
}

export default function GrowthScene({ tier, paused, onContextLost }: GrowthSceneProps) {
  const high = tier === 'high';

  return (
    <Canvas
      className="gj-canvas"
      frameloop="demand"
      dpr={high ? [1, 2] : [1, 1.25]}
      shadows={high ? 'percentage' : false}
      camera={{ position: [0, 0.35, 4.4], fov: 38, near: 0.1, far: 80 }}
      gl={{ antialias: high, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // If the GPU drops the context, hand control back so the page shows the 2D fallback.
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <color attach="background" args={['#050a14']} />
      <fog attach="fog" args={['#050a14', 10, 26]} />

      <Ticker paused={paused} />
      <CameraRig />

      <ambientLight intensity={0.3} color="#8fb4ff" />
      <directionalLight
        position={[4, 9, 6]}
        intensity={2.2}
        color="#ffe2a8"
        castShadow={high}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0005}
      />
      <pointLight position={[-5, 3, -4]} intensity={24} distance={20} color="#34d399" />
      <pointLight position={[3, -0.5, 4]} intensity={8} distance={12} color="#f5c15c" />

      {/* Procedural reflections only. Nothing is fetched from a CDN. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} color="#fff1cf" position={[0, 6, 4]} scale={[9, 4, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#6ee7b7" position={[-7, 2, -2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 4, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#fde68a" position={[5, 3, 5]} scale={3} />
      </Environment>

      <Seed />
      <Stacks />
      <GrowthGraph />
      <GoldenTree leafPerTip={high ? 6 : 3} />
      <Halo />
      <UpArrow />
      <FloatingCoins />
      <Floor />

      <Sparkles
        count={high ? 150 : 60}
        scale={[10, 7, 10]}
        size={3}
        speed={0.3}
        color="#fde68a"
        opacity={0.8}
        position={[0, 1, 0]}
      />

      {high && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.75} luminanceSmoothing={0.25} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
