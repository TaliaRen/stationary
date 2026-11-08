import { useEffect, useRef, useState } from 'react';
import { addTick } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp } from '../lib/util';

// A rubber stamp standing on a sheet of paper, seen from above (viewBox 560 x 520).
// Tap it (or the paper): it presses straight down right where it is — no moving
// first. As it lifts off it is moved to another empty spot on the sheet, where it
// rests (hovering just above the paper) until the next tap.
const VB_W = 560;
const VB_H = 520;
const PAPER = { x: 175, y: 70, w: 300, h: 370, rot: 2 };
const INSET = 62; // keep imprints this far inside the paper edge
const IMPRINT_R = 50;
const MAX_IMPRINTS = 8;
const TAP_SLOP = 10; // px of movement before a press stops being a tap

// Timeline (seconds) of one stamp.
const T_PRESS = 0.1; // straight down from where it rests
const T_HOLD = 0.08;
const T_UP = 0.1;
const T_MOVE = 0.3; // carried to the next spot
const T_SETTLE = 0.14; // lowered to rest there
const T_TOTAL = T_PRESS + T_HOLD + T_UP + T_MOVE + T_SETTLE;
const REST_SCALE = 1.04; // resting just above the paper
const REST_LIFT = 0.25;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t) => t * t;
const lerp = (a, b, t) => a + (b - a) * t;

/** Pose at time `t`: stamp in place at `from`, then move on to `to`. */
function poseAt(t, from, to) {
  const arc = (a, b, k) => {
    const mx = (a.x + b.x) / 2;
    const my = Math.min(a.y, b.y) - 60;
    const u = 1 - k;
    return { x: u * u * a.x + 2 * u * k * mx + k * k * b.x, y: u * u * a.y + 2 * u * k * my + k * k * b.y };
  };
  let s = t;
  if (s < T_PRESS) {
    const k = easeIn(s / T_PRESS);
    return { x: from.x, y: from.y, rot: from.rot, scale: lerp(REST_SCALE, 0.97, k), lift: lerp(REST_LIFT, 0, k), pressed: s / T_PRESS > 0.75 };
  }
  s -= T_PRESS;
  if (s < T_HOLD) return { x: from.x, y: from.y, rot: from.rot, scale: 0.97, lift: 0, pressed: true };
  s -= T_HOLD;
  if (s < T_UP) {
    const k = ease(s / T_UP);
    return { x: from.x, y: from.y, rot: from.rot, scale: lerp(0.97, 1.12, k), lift: k };
  }
  s -= T_UP;
  if (s < T_MOVE) {
    const k = ease(s / T_MOVE);
    const p = arc(from, to, k);
    return { ...p, rot: lerp(from.rot, to.rot, k), scale: 1.12, lift: 1 };
  }
  s -= T_MOVE;
  const k = ease(clamp(s / T_SETTLE, 0, 1));
  return { x: to.x, y: to.y, rot: to.rot, scale: lerp(1.12, REST_SCALE, k), lift: lerp(1, REST_LIFT, k) };
}

// Paper-local point → item coordinates (paper is slightly rotated).
function fromPaper(px, py) {
  const a = (PAPER.rot * Math.PI) / 180;
  const cx = PAPER.x + PAPER.w / 2;
  const cy = PAPER.y + PAPER.h / 2;
  const dx = px - PAPER.w / 2;
  const dy = py - PAPER.h / 2;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}
const START = (() => {
  const [x, y] = fromPaper(PAPER.w * 0.6, PAPER.h * 0.68);
  return { x, y, rot: -6 };
})();

/** One inked impression with grainy, uneven coverage (unique noise per stamp). */
function Imprint({ m }) {
  const fid = `ink-${m.id}`;
  return (
    <g transform={`translate(${m.x} ${m.y}) rotate(${m.rot})`} style={{ mixBlendMode: 'multiply' }} opacity={m.fading ? 0 : m.ink} className="imprint">
      <defs>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={m.seed} result="grain" />
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={m.seed + 11} result="blot" />
          {/* Fine grain: mostly inked with tiny pinholes */}
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="grainA" />
          {/* Large blotches: occasionally a patch with little ink */}
          <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.6" result="blotA" />
          <feComposite in="grainA" in2="blotA" operator="arithmetic" k1="1" result="mask" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feComposite in="rough" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${fid})`} fill="none" stroke="#c4262c">
        <circle r={IMPRINT_R} strokeWidth="4.5" />
        <circle r={IMPRINT_R - 8} strokeWidth="1.4" />
        <text y="12" textAnchor="middle" className="stamp-ok" fill="#c4262c" stroke="none">
          OK
        </text>
      </g>
    </g>
  );
}

// ---- Stamp geometry: one oblique viewing direction for every part ----
const VIEW = { x: -0.3, y: -0.5 }; // screen offset per unit of height (we look slightly from lower-right)
const LIGHT = { x: 0.55, y: 0.75 }; // shadow offset per unit of height (light from upper-left)
const R_BASE = IMPRINT_R + 1;
const H_BASE = 20;
const H_COLLAR = 24;
const H_NECK = 46;
const H_KNOB = 58;
const R_KNOB = 21;
const P = (z) => ({ x: VIEW.x * z, y: VIEW.y * z });
/** Circles stacked from height z0 to z1 — draws a solid cylinder seen at an angle. */
const stack = (z0, z1, r, step = 1.5) => {
  const out = [];
  for (let z = z0; z < z1; z += step) out.push({ ...P(z), r });
  return out;
};
/** The stamp's shadow on the desk: the same parts projected along the light. */
const STAMP_SHADOW = (() => {
  const cs = [];
  const add = (z0, z1, r) => {
    for (let z = z0; z <= z1; z += 3) cs.push({ x: LIGHT.x * z, y: LIGHT.y * z, r });
  };
  add(0, H_BASE, R_BASE + 1);
  add(H_BASE, H_COLLAR, 14);
  add(H_COLLAR, H_NECK, 7.5);
  cs.push({ x: LIGHT.x * H_KNOB, y: LIGHT.y * H_KNOB, r: R_KNOB });
  return cs;
})();

let uid = 0;

export default function StampButton() {
  const svgRef = useRef(null);
  // One "OK" is already on the sheet when the page opens.
  const [imprints, setImprints] = useState(() => [{ id: ++uid, x: PAPER.x + PAPER.w * 0.38, y: PAPER.y + PAPER.h * 0.34, rot: -9, ink: 0.86, seed: 37 }]);
  const [count, setCount] = useState(1);
  const [pose, setPose] = useState({ ...START, scale: REST_SCALE, lift: REST_LIFT });
  const rest = useRef(START); // where the stamp currently stands on the paper
  const [announce, setAnnounce] = useState('');
  const running = useRef(false);
  const queued = useRef(null);
  const imprintsRef = useRef(imprints);
  imprintsRef.current = imprints;
  const down = useRef(null);

  // Pick the candidate spot farthest from existing imprints (and `extra` points).
  const freeSpot = (extra = []) => {
    const live = [...imprintsRef.current.filter((m) => !m.fading), ...extra];
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 40; i++) {
      const [x, y] = fromPaper(INSET + Math.random() * (PAPER.w - INSET * 2), INSET + Math.random() * (PAPER.h - INSET * 2));
      const d = live.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), 1e9);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    return best;
  };

  // Stamp right where the stamp stands, then move it on to a fresh spot.
  const run = () => {
    if (running.current) {
      queued.current = true; // queue at most one
      return;
    }
    running.current = true;
    const from = rest.current;
    const [nx, ny] = freeSpot([{ x: from.x, y: from.y }]);
    const to = { x: nx, y: ny, rot: (Math.random() - 0.5) * 16 };
    rest.current = to;
    let t = 0;
    let stamped = false;
    addTick((dt) => {
      t += dt;
      const p = poseAt(Math.min(t, T_TOTAL), from, to);
      setPose(p);
      if (!stamped && p.pressed) {
        stamped = true;
        sfx.stampThud();
        const m = { id: ++uid, x: from.x, y: from.y, rot: from.rot + (Math.random() - 0.5) * 10, ink: 0.75 + Math.random() * 0.2, seed: Math.floor(Math.random() * 900) };
        setImprints((list) => {
          const liveCount = list.filter((q) => !q.fading).length;
          if (liveCount < MAX_IMPRINTS) return [...list, m];
          // Too many: the oldest one slowly fades away.
          const oldest = list.find((q) => !q.fading);
          setTimeout(() => setImprints((l) => l.filter((q) => q.id !== oldest.id)), 1400);
          return [...list.map((q) => (q.id === oldest.id ? { ...q, fading: true } : q)), m];
        });
        setCount((c) => c + 1);
        setAnnounce(String(Date.now()));
      }
      if (t >= T_TOTAL) {
        running.current = false;
        if (queued.current) {
          queued.current = false;
          run();
        }
        return false;
      }
      return true;
    });
  };

  // Tap handling: respond on release if the pointer barely moved.
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const isTap = (e) => {
    const d = down.current;
    down.current = null;
    return d && d.id === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP;
  };
  // Tapping the stamp or anywhere on its sheet stamps once, in place.
  const onStampUp = (e) => {
    if (isTap(e)) run();
  };
  const onPaperUp = onStampUp;
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.repeat) return;
    run();
  };

  // Clear the live-region text shortly after so repeated stamps are re-announced.
  useEffect(() => {
    if (!announce) return;
    const t = setTimeout(() => setAnnounce(''), 700);
    return () => clearTimeout(t);
  }, [announce]);

  const { x, y, rot, scale, lift } = pose;
  const top = 1; // always standing upright on the paper
  const alpha = 1;
  const sdx = 2 + 16 * lift;
  const sdy = 3 + 22 * lift;
  const sBlur = 3 + 7 * lift;
  const sOpacity = 0.42 - 0.2 * lift;

  return (
    <div className="item" role="button" tabIndex={0} aria-label="确认（盖章）" onKeyDown={onKeyDown}>
      <span className="sr-only" aria-live="polite">
        {announce ? '已确认' : ''}
      </span>
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
        <defs>
          <filter id="stp-paper-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feOffset dx="4" dy="6" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.13  0 0 0 0 0.05  0 0 0 0.3 0" />
          </filter>
          <filter id="stp-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={sBlur} />
            <feOffset dx={sdx} dy={sdy} />
            <feColorMatrix type="matrix" values={`0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 ${sOpacity} 0`} />
          </filter>
          <radialGradient id="stp-wood" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#c08a58" />
            <stop offset="0.55" stopColor="#93603a" />
            <stop offset="1" stopColor="#5e391c" />
          </radialGradient>
          <linearGradient id="stp-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4a4e55" />
            <stop offset="0.5" stopColor="#2b2e33" />
            <stop offset="1" stopColor="#17191c" />
          </linearGradient>
        </defs>

        {/* Paper (tap anywhere on it to stamp there) */}
        <g className="hit" onPointerDown={onDown} onPointerUp={onPaperUp}>
          <g transform={`rotate(${PAPER.rot} ${PAPER.x + PAPER.w / 2} ${PAPER.y + PAPER.h / 2})`}>
            <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} filter="url(#stp-paper-shadow)" />
            <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} fill="#fdfbf6" stroke="#c9bda5" strokeWidth="0.6" />
            <text x={PAPER.x + 26} y={PAPER.y + 40} className="stp-head">
              APPROVAL SHEET
            </text>
            <rect x={PAPER.x + 26} y={PAPER.y + 52} width={PAPER.w - 52} height="1.2" fill="#8f877c" opacity="0.5" />
          </g>
          {imprints.map((m) => (
            <Imprint key={m.id} m={m} />
          ))}
        </g>


        {/* Desk shadow, cast by the same 3D shape toward the lower right */}
        <g filter="url(#stp-shadow)">
          <g transform={`translate(${x} ${y}) scale(${scale})`}>
            {STAMP_SHADOW.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={c.r} />
            ))}
          </g>
        </g>

        {/* The stamp: built bottom-up along one viewing direction so every part
            joins cleanly — rubber pad, round wooden base, collar, neck, ball knob. */}
        <g className="hit" onPointerDown={onDown} onPointerUp={onStampUp} transform={`translate(${x} ${y}) scale(${scale})`}>
          <defs>
            <linearGradient id="stp-top" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d6a874" />
              <stop offset="0.6" stopColor="#b5824f" />
              <stop offset="1" stopColor="#966537" />
            </linearGradient>
            <radialGradient id="stp-ball" cx="0.36" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#e2b585" />
              <stop offset="0.55" stopColor="#a8723f" />
              <stop offset="1" stopColor="#6e4423" />
            </radialGradient>
          </defs>
          <circle r="84" fill="transparent" />
          {/* rubber pad */}
          {stack(0, 3, R_BASE + 1).map((c, i) => (
            <circle key={`r${i}`} cx={c.x} cy={c.y} r={c.r} fill="#b3302a" />
          ))}
          {/* base: side wall, then the top face with turned rings */}
          {stack(3, H_BASE, R_BASE).map((c, i) => (
            <circle key={`b${i}`} cx={c.x} cy={c.y} r={c.r} fill="#7d5130" />
          ))}
          <circle cx={P(H_BASE).x} cy={P(H_BASE).y} r={R_BASE} fill="url(#stp-top)" />
          <circle cx={P(H_BASE).x} cy={P(H_BASE).y} r={R_BASE - 1.5} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
          {[R_BASE - 12, R_BASE - 22].map((r) => (
            <circle key={r} cx={P(H_BASE).x} cy={P(H_BASE).y} r={r} fill="none" stroke="#7a4e2a" strokeOpacity="0.28" strokeWidth="1" />
          ))}
          {/* collar */}
          {stack(H_BASE, H_COLLAR, 14).map((c, i) => (
            <circle key={`c${i}`} cx={c.x} cy={c.y} r={c.r} fill="#6a4222" />
          ))}
          <circle cx={P(H_COLLAR).x} cy={P(H_COLLAR).y} r="14" fill="#9a6a3e" />
          {/* neck */}
          {stack(H_COLLAR, H_NECK, 7.5).map((c, i) => (
            <circle key={`n${i}`} cx={c.x} cy={c.y} r={c.r} fill="#83552f" />
          ))}
          {/* ball knob */}
          <circle cx={P(H_KNOB).x} cy={P(H_KNOB).y} r={R_KNOB} fill="url(#stp-ball)" />
          <ellipse cx={P(H_KNOB).x - 7} cy={P(H_KNOB).y - 8} rx="7" ry="4.5" fill="#fff" opacity="0.45" transform={`rotate(-35 ${P(H_KNOB).x - 7} ${P(H_KNOB).y - 8})`} />
        </g>
      </svg>
    </div>
  );
}
