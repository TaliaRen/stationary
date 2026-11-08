import { useEffect, useRef, useState } from 'react';
import { addTick, useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, mixColor, capture } from '../lib/util';
import { CHROME, CylinderGradient, DeskShadow } from '../lib/svg';

// A handheld pencil sharpener with a blunt pencil in it (viewBox 560 x 300).
// Hold to sharpen: the pencil turns and creeps in, shavings pile up, and a thin
// progress bar printed on the barrel fills with a percentage — a progress bar.
const VB_W = 560;
const VB_H = 300;
const BX = 40; // sharpener block
const BY = 58;
const BW = 132;
const BH = 108;
const PY = BY + BH / 2; // pencil centre line
const PR = 17; // pencil hex circumradius (about as thick as the pen)
const PL = 340; // pencil length
const INSERT = 128; // pencil tip x at 0 % (inside the block)
const PUSH = 26; // creeps in this far while sharpening
const OUT = 86; // pops out this far at 100 %
const DURATION = 4.2; // seconds of holding for a full sharpen
const TRACK = [140, 262]; // progress bar position along the pencil
const MAX_SHAVINGS = 40;

const OUT_CFG = { stiffness: 260, damping: 14, precision: 0.05 };
const SLIDE_CFG = { stiffness: 200, damping: 24, precision: 0.5 };
const ASIDE_CFG = { stiffness: 140, damping: 15, precision: 0.002 };
// Where a finished pencil is laid down: below and beside the sharpener.
const ASIDE = { dx: 34, dy: 82, rot: 6 };
const FALL_CFG = { stiffness: 110, damping: 12, precision: 0.002 };

// Pencil shavings: a thin unrolled cone of wood — a ruffled fan with the
// painted rim (yellow) on its wavy outer edge and a dark graphite speck at the tip.
const SHAVINGS = [0, 1, 2, 3].map((v) => {
  const span = (200 + v * 35) * (Math.PI / 180);
  const R = 12 + v * 1.6;
  const waves = 7 + v;
  const outer = [];
  for (let i = 0; i <= 40; i++) {
    const a = (span * i) / 40;
    const r = R + Math.sin(a * waves + v) * 1.7;
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const inner = [
    [Math.cos(span) * 2.2, Math.sin(span) * 2.2],
    [2.2, 0],
  ];
  const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
  const fan = `M${pts(outer)} L${pts(inner)} Z`;
  const rim = `M${pts(outer)}`;
  const grain = [0.2, 0.45, 0.7].map((f) => {
    const a = span * f;
    return `M${(Math.cos(a) * 3).toFixed(1)},${(Math.sin(a) * 3).toFixed(1)} L${(Math.cos(a) * (R - 2)).toFixed(1)},${(Math.sin(a) * (R - 2)).toFixed(1)}`;
  });
  return { fan, rim, grain };
});

function Shaving({ s }) {
  const k = useSpring(0, FALL_CFG);
  useEffect(() => {
    k.to(1, FALL_CFG);
  }, []);
  const t = clamp(k.x, 0, 1.2);
  const x = s.x0 + (s.x1 - s.x0) * t;
  const y = s.y0 + (s.y1 - s.y0) * t - 34 * Math.sin(Math.PI * clamp(t, 0, 1));
  const shape = SHAVINGS[s.v];
  return (
    <g transform={`translate(${x} ${y}) rotate(${s.rot + 160 * t}) scale(${s.scale})`}>
      <path d={shape.fan} fill="#3a2410" opacity="0.2" transform="translate(1.4 2)" />
      <path d={shape.fan} fill="url(#sh-wood)" stroke="#c99a5c" strokeWidth="0.4" />
      {shape.grain.map((g, i) => (
        <path key={i} d={g} stroke="#c3925a" strokeOpacity="0.45" strokeWidth="0.6" />
      ))}
      <path d={shape.rim} fill="none" stroke="#f2b70f" strokeWidth="2.6" strokeLinejoin="round" />
      <path d={shape.rim} fill="none" stroke="#9a6a10" strokeOpacity="0.55" strokeWidth="0.6" transform="scale(1.08)" />
      <circle r="1.5" fill="#45474c" />
    </g>
  );
}

/** Hexagonal pencil barrel seen from above; `turn` rotates the facets. */
function Facets({ x0, x1, turn }) {
  const faces = [];
  for (let k = 0; k < 6; k++) {
    const a1 = turn + (k * Math.PI) / 3;
    const a2 = a1 + Math.PI / 3;
    const m = a1 + Math.PI / 6;
    const nz = Math.cos(m);
    if (nz <= 0.02) continue;
    const ny = Math.sin(m);
    const y1 = PR * Math.sin(a1);
    const y2 = PR * Math.sin(a2);
    const light = clamp(-0.45 * ny + 0.9 * nz, 0.15, 1);
    faces.push(
      <rect key={k} x={x0} y={Math.min(y1, y2)} width={x1 - x0} height={Math.abs(y2 - y1) + 0.4} fill={mixColor('#b8860b', '#ffd84a', light)} />,
      <line key={`e${k}`} x1={x0} x2={x1} y1={y1} y2={y1} stroke="#8a6200" strokeOpacity="0.35" strokeWidth="0.8" />,
    );
  }
  return faces;
}

let uid = 0;

/** Rotate a shadow offset into the tilted group so it still falls to the lower right on screen. */
function shadowOffset(dx, dy, angle) {
  const a = (-angle * Math.PI) / 180;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

export default function SharpenerProgress({ angle = 0 }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [shavings, setShavings] = useState([]);
  const pRef = useRef(0);
  const turn = useRef(0);
  const holding = useRef(false);
  const doneRef = useRef(false);
  const sound = useRef(null);
  const nextShaving = useRef(0.03);
  const pending = useRef(null);
  const [, force] = useState(0);
  const withdraw = useSpring(0, OUT_CFG);
  const slide = useSpring(0, SLIDE_CFG);
  const aside = useSpring(0, ASIDE_CFG);

  const timers = useRef([]);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  useEffect(
    () => () => {
      sound.current?.stop();
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const spawnShaving = () => {
    const id = ++uid;
    setShavings((list) => [
      ...list.slice(-(MAX_SHAVINGS - 1)),
      {
        id,
        v: id % 4,
        x0: BX + 58,
        y0: BY + 34,
        x1: BX - 30 + Math.random() * 170,
        y1: BY + BH + 28 + Math.random() * 46,
        rot: Math.random() * 360,
        scale: 0.85 + Math.random() * 0.5,
      },
    ]);
  };

  const finish = () => {
    holding.current = false;
    sound.current?.stop();
    sound.current = null;
    doneRef.current = true;
    setDone(true);
    sfx.ding();
    withdraw.to(OUT, OUT_CFG);
    // Then it is set down beside the sharpener (and stays there).
    later(420, () => aside.to(1, ASIDE_CFG, () => sfx.penDrop('wood')));
  };

  const start = () => {
    if (holding.current || doneRef.current) return;
    holding.current = true;
    sound.current = sfx.sharpen();
    addTick((dt) => {
      if (!holding.current) return false;
      pRef.current = Math.min(1, pRef.current + dt / DURATION);
      turn.current += dt * 9;
      if (pRef.current >= nextShaving.current) {
        nextShaving.current += 0.045;
        spawnShaving();
      }
      setProgress(pRef.current);
      force((n) => n + 1);
      if (pRef.current >= 1) {
        finish();
        return false;
      }
      return true;
    });
  };
  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    sound.current?.stop();
    sound.current = null;
  };

  // Start over: the pencil goes back into the sharpener as a fresh blunt one.
  const reset = () => {
    pRef.current = 0;
    nextShaving.current = 0.03;
    turn.current = 0;
    doneRef.current = false;
    setProgress(0);
    setDone(false);
    aside.to(0, ASIDE_CFG);
    withdraw.to(0, SLIDE_CFG, () => sfx.tapeStick());
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capture(e);
    // Remember whether this press began on a finished pencil (tap = swap pencils).
    pending.current = { id: e.pointerId, wasDone: doneRef.current };
    if (!doneRef.current) start();
  };
  const onPointerUp = (e, cancelled) => {
    const pd = pending.current;
    if (!pd || pd.id !== e.pointerId) return;
    pending.current = null;
    if (pd.wasDone && !cancelled) reset();
    else stop();
  };
  const onKeyDown = (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) start();
    } else if (e.key === 'Enter' && doneRef.current) {
      e.preventDefault();
      reset();
    }
  };
  const onKeyUp = (e) => {
    if (e.key === ' ') stop();
  };

  const p = progress;
  const pct = Math.round(p * 100);
  const sharp = p; // tip cone grows with progress
  const jitter = holding.current ? Math.sin(turn.current * 7) * 0.5 : 0;
  const px = INSERT - PUSH * p + withdraw.x + slide.x; // pencil tip x
  const as = clamp(aside.x, -0.1, 1.15);
  const asideT = `translate(${ASIDE.dx * as} ${ASIDE.dy * as}) rotate(${ASIDE.rot * as} ${px + PL / 2} ${PY})`;
  const cone = 6 + 30 * sharp;
  const bodyEnd = PL - 40;
  const shBlock = shadowOffset(10, 13, angle);
  const shPencil = shadowOffset(6, 9, angle);

  return (
    <div
      className="item"
      role="button"
      tabIndex={0}
      aria-label={done ? '铅笔已削好，按回车换一支新铅笔' : '卷笔刀 Progress，按住空格削铅笔'}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <span className="sr-only" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="削笔进度" />
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
        <defs>
          <DeskShadow id="sh-shadow" dx={shBlock[0]} dy={shBlock[1]} blur={8} opacity={0.42} contact={0.6} contactBlur={1.6} />
          <DeskShadow id="sh-pencil-shadow" dx={shPencil[0]} dy={shPencil[1]} blur={5} opacity={0.38} contact={0.5} contactBlur={1.2} />
          <linearGradient id="sh-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0675a" />
            <stop offset="0.45" stopColor="#d23a2e" />
            <stop offset="1" stopColor="#8f1f17" />
          </linearGradient>
          <CylinderGradient id="sh-chrome" stops={CHROME} />
          <radialGradient id="sh-wood" cx="0" cy="0" r="16" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f6e2bf" />
            <stop offset="0.7" stopColor="#e8c48f" />
            <stop offset="1" stopColor="#d7a86a" />
          </radialGradient>
          <CylinderGradient id="sh-eraser" stops={[[0, '#f7b3b8'], [0.3, '#f08f98'], [1, '#b85660']]} />
          <linearGradient id="sh-hole" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#3a0d09" />
            <stop offset="1" stopColor="#1a0503" />
          </linearGradient>
        </defs>

        <g transform={`rotate(${angle} ${VB_W / 2} ${VB_H / 2})`}>
        <g className="hit" onPointerDown={onPointerDown} onPointerUp={(e) => onPointerUp(e, false)} onPointerCancel={(e) => onPointerUp(e, true)}>
          <rect x={BX - 20} y={BY - 20} width={VB_W - BX} height={BH + 40} fill="transparent" />

          {/* Shadows */}
          <g filter="url(#sh-shadow)">
            <rect x={BX} y={BY} width={BW} height={BH} rx="14" />
          </g>
          {/* Shadow follows the pencil's real outline (pointed when sharpened) */}
          <g filter="url(#sh-pencil-shadow)">
            <path
              transform={`${asideT} translate(${px} ${PY})`}
              d={`M${6 - 7 * p},0 L${cone},${-PR * 0.88} L${PL - 6},${-PR} Q${PL},${-PR} ${PL},${-PR + 6} L${PL},${PR - 6} Q${PL},${PR} ${PL - 6},${PR} L${cone},${PR * 0.88} Z`}
            />
          </g>

          {/* Pencil */}
          <g transform={`${asideT} translate(${px} ${PY + jitter})`}>
            {/* Sharpened cone + graphite (grows with progress) */}
            <path d={`M${cone},${-PR * 0.86} L6,-2.6 L6,2.6 L${cone},${PR * 0.86} Z`} fill="#e7c08a" />
            <path d={`M${cone},${-PR * 0.86} L6,-2.6 L6,0 L${cone},0 Z`} fill="#fff" opacity="0.18" />
            <path d={`M6,-2.6 L${6 - 7 * sharp},-0.5 L${6 - 7 * sharp},0.5 L6,2.6 Z`} fill="#3b3d42" />
            {/* Painted barrel with rotating facets */}
            <Facets x0={cone} x1={bodyEnd} turn={turn.current} />
            {/* Scalloped paint edge where the cone starts */}
            {sharp > 0.05 && <path d={`M${cone},${-PR} q-5,${PR / 2} 0,${PR} q-5,${PR / 2} 0,${PR}`} fill="#e7c08a" stroke="#c99a2e" strokeWidth="0.6" />}
            {/* Ferrule + eraser */}
            <rect x={bodyEnd} y={-PR - 0.5} width="22" height={PR * 2 + 1} fill="url(#sh-chrome)" />
            {[bodyEnd + 5, bodyEnd + 11, bodyEnd + 17].map((fx) => (
              <line key={fx} x1={fx} x2={fx} y1={-PR} y2={PR} stroke="#6c737a" strokeWidth="1" />
            ))}
            <rect x={bodyEnd + 21} y={-PR + 0.5} width="20" height={PR * 2 - 1} rx="5" fill="url(#sh-eraser)" />

            {/* Progress bar printed on the barrel */}
            <rect x={TRACK[0]} y="-3.2" width={TRACK[1] - TRACK[0]} height="6.4" rx="3.2" fill="#3d3214" opacity="0.28" />
            <rect x={TRACK[0]} y="-3.2" width={Math.max(6.4, (TRACK[1] - TRACK[0]) * p)} height="6.4" rx="3.2" fill="#2f9e5f" opacity={p > 0 ? 1 : 0} />
            {Array.from({ length: 9 }, (_, i) => TRACK[0] + ((i + 1) * (TRACK[1] - TRACK[0])) / 10).map((tx) => (
              <line key={tx} x1={tx} x2={tx} y1="-3.2" y2="-1" stroke="#3d3214" strokeOpacity="0.4" strokeWidth="0.7" />
            ))}
            <text x={TRACK[1] + 6} y="4.3" className="sh-pct">
              {pct}%
            </text>
          </g>

          {/* Sharpener block (covers the inserted tip) */}
          <rect x={BX + 2} y={BY + 6} width={BW} height={BH} rx="14" fill="#6e160f" />
          <rect x={BX} y={BY} width={BW} height={BH} rx="14" fill="url(#sh-body)" />
          <path d={`M${BX + 14},${BY + 6} Q${BX + 40},${BY + 2} ${BX + 80},${BY + 4}`} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
          {/* Grip ridges */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={BX + 12} x2={BX + 30} y1={BY + 54 + i * 9} y2={BY + 54 + i * 9} stroke="#7a1a12" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
          ))}
          {/* Pencil hole on the right face */}
          <rect x={BX + BW - 12} y={PY - 17} width="12" height="34" rx="3" fill="url(#sh-hole)" />
          {/* Steel blade, screw and the shavings slot */}
          <g transform={`rotate(-5 ${BX + 72} ${BY + 34})`}>
            <rect x={BX + 36} y={BY + 22} width="78" height="26" rx="2" fill="url(#sh-chrome)" />
            <rect x={BX + 36} y={BY + 44} width="78" height="5" fill="#1a0503" />
            <circle cx={BX + 76} cy={BY + 33} r="6" fill="url(#sh-chrome)" stroke="#5f666e" strokeWidth="1" />
            <line x1={BX + 72} x2={BX + 80} y1={BY + 33} y2={BY + 33} stroke="#4a5058" strokeWidth="1.6" />
          </g>

          {shavings.map((s) => (
            <Shaving key={s.id} s={s} />
          ))}
        </g>
        </g>
      </svg>
    </div>
  );
}
