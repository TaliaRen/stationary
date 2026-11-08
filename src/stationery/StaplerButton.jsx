import { useEffect, useRef, useState } from 'react';
import { addTick, useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, mixColor, svgPoint, capture } from '../lib/util';
import { CHROME, CylinderGradient, DeskShadow } from '../lib/svg';

// A desk stapler biting the top-left corner of a paper stack (viewBox 680 x 600).
// The stapler is drawn in local coordinates — tail hinge at x≈0, nose at x≈400,
// centre line y=0 — then rotated onto the desk.
const VB_W = 680;
const VB_H = 600;
const TX = 52;
const TY = 74;
const ROT = 30;
const STAPLER_T = `translate(${TX} ${TY}) rotate(${ROT})`;
const HINGE_X = 24;

const DOWN_CFG = { stiffness: 1100, damping: 42, precision: 0.002 };
const UP_CFG = { stiffness: 520, damping: 15, precision: 0.002 };
const POP_CFG = { stiffness: 600, damping: 14, precision: 0.002 };

// Base: a broad flat plate, squared at the back, rounded anvil end at the front.
const BASE_D = 'M8,-58 H338 C384,-58 412,-34 412,0 C412,34 384,58 338,58 H8 C0,58 -8,50 -8,42 V-42 C-8,-50 0,-58 8,-58 Z';
// Top arm: wide over the hinge, tapering towards a squared nose.
// It stops short of the base so the chrome anvil plate shows in front of it.
const COVER_D = 'M18,-38 H282 L336,-31 C352,-29 362,-20 362,-9 V9 C362,20 352,29 336,31 L282,38 H18 C8,38 2,31 2,24 V-24 C2,-31 8,-38 18,-38 Z';
const NOSE_D = 'M304,-34 L336,-31 C352,-29 362,-20 362,-9 V9 C362,20 352,29 336,31 L304,34 Z';

function toGlobal(lx, ly) {
  const a = (ROT * Math.PI) / 180;
  return [TX + lx * Math.cos(a) - ly * Math.sin(a), TY + lx * Math.sin(a) + ly * Math.cos(a)];
}
const BADGE = toGlobal(296, -50);

/** Expanding press ripple, like a material button's ink wave. */
function Ripple({ x, y, onDone }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let elapsed = 0;
    return addTick((dt) => {
      elapsed += dt;
      const k = Math.min(1, elapsed / 0.6);
      setT(k);
      if (k >= 1) {
        onDone();
        return false;
      }
      return true;
    });
  }, []);
  const e = 1 - Math.pow(1 - t, 3);
  return <circle cx={x} cy={y} r={8 + e * 210} fill="#ffffff" opacity={0.45 * (1 - t)} />;
}

/** Paper stack: several sheets with visible thickness and a printed top page. */
function PaperStack() {
  const sheets = [5, 4, 3, 2, 1, 0];
  return (
    <g transform="translate(-62 -46) rotate(3 485 385)">
      <g filter="url(#st-paper-shadow)">
        <rect x="360" y="210" width="256" height="352" />
      </g>
      {sheets.map((k) => (
        <rect
          key={k}
          x={360 + k * 1.1}
          y={210 + k * 1.5}
          width="250"
          height="348"
          fill={k === 0 ? '#fdfbf6' : k % 2 ? '#ece6da' : '#f4efe5'}
          stroke="#b9ad98"
          strokeOpacity={k === 0 ? 0.25 : 0.4}
          strokeWidth="0.6"
        />
      ))}
      {/* Printed text on the top sheet */}
      <rect x="394" y="330" width="120" height="7" rx="2" fill="#5d564d" opacity="0.6" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x="394" y={354 + i * 13} width={i % 5 === 4 ? 96 : 182 - (i % 3) * 14} height="3.4" rx="1.7" fill="#8f877c" opacity="0.45" />
      ))}
    </g>
  );
}

let uid = 0;

export default function StaplerButton() {
  const [count, setCount] = useState(0);
  const [staples, setStaples] = useState([]);
  const [ripples, setRipples] = useState([]);
  const coverRef = useRef(null);
  const st = useRef({ bottomed: true, wantUp: false, pointer: null });

  const press = useSpring(0, DOWN_CFG);
  const pop = useSpring(0, POP_CFG);

  const releaseNow = () => {
    st.current.wantUp = false;
    press.to(0, UP_CFG);
    sfx.stapleRelease();
  };

  // Fire the staple exactly when the arm reaches the bottom.
  useEffect(
    () =>
      press.listen((x) => {
        const s = st.current;
        if (!s.bottomed && x > 0.94) {
          s.bottomed = true;
          sfx.stapleCrunch();
          setCount((c) => c + 1);
          pop.set(0.55);
          pop.to(1, POP_CFG);
          const id = ++uid;
          setStaples((list) => {
            const n = list.length;
            // Each new staple lands a little further along the corner.
            return [
              ...list.slice(-7),
              { id, x: 426 + (n % 4) * 15 + (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 6, r: (Math.random() - 0.5) * 6 },
            ];
          });
          if (s.wantUp) releaseNow();
        }
      }),
    [],
  );

  const down = (lx, ly) => {
    const s = st.current;
    s.bottomed = false;
    s.wantUp = false;
    press.to(1, DOWN_CFG);
    sfx.staplePress();
    const id = ++uid;
    setRipples((rs) => [...rs.slice(-3), { id, x: lx, y: ly }]);
  };
  const up = () => {
    // Every press completes: if released early, rebound after the bottom.
    if (st.current.bottomed) releaseNow();
    else st.current.wantUp = true;
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capture(e);
    st.current.pointer = e.pointerId;
    const p = svgPoint(coverRef.current, e);
    down(p.x, p.y);
  };
  const onPointerUp = (e) => {
    if (st.current.pointer !== e.pointerId) return;
    st.current.pointer = null;
    up();
  };
  const onKeyDown = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    down(228, 0);
  };
  const onKeyUp = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    up();
  };

  const p = press.x;
  const pc = clamp(p, 0, 1);
  // Pressing pivots the arm down around the rear hinge: it shrinks slightly
  // (further from the eye) and its shadow tightens towards the base.
  const coverT = `translate(${HINGE_X} 0) scale(${1 - 0.035 * p} ${1 - 0.03 * p}) translate(${-HINGE_X} 0)`;
  const sdx = 13 * (1 - 0.72 * pc);
  const sdy = 17 * (1 - 0.72 * pc);
  const faceColor = mixColor('#4a72c4', '#2a4c8f', pc);
  const badgeScale = clamp(pop.x, 0, 2);

  return (
    <div
      className="item"
      role="button"
      tabIndex={0}
      aria-label={`订书机 Button，已订 ${count} 枚`}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
        <defs>
          <DeskShadow id="st-paper-shadow" dx={4} dy={5} blur={5} opacity={0.3} contact={0.3} contactBlur={1} />
          <DeskShadow id="st-base-shadow" dx={10} dy={13} blur={10} opacity={0.42} contact={0.65} contactBlur={2} />
          <DeskShadow id="st-cover-shadow" dx={sdx} dy={sdy} blur={9 - 5 * pc} opacity={0.45 + 0.1 * pc} contact={0} />
          {/* Black enamelled arm with a chrome magazine nose */}
          <CylinderGradient id="st-steel" stops={[[0, '#2a2d32'], [0.1, '#7d848d'], [0.22, '#4a4f57'], [0.5, '#2c3036'], [0.85, '#17191c'], [1, '#22252a']]} />
          <CylinderGradient id="st-steel-dark" stops={CHROME} />
          <CylinderGradient id="st-base" stops={[[0, '#55595f'], [0.18, '#3a3d42'], [0.6, '#232529'], [1, '#121315']]} />
          <CylinderGradient id="st-chrome" stops={CHROME} />
          <linearGradient id="st-face-gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </linearGradient>
          <clipPath id="st-cover-clip">
            <path d={COVER_D} />
          </clipPath>
        </defs>

        {/* Desk shadow of the base */}
        <g filter="url(#st-base-shadow)">
          <path d={BASE_D} transform={STAPLER_T} />
        </g>

        <g className="hit" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {/* Base + chrome anvil + rubber feet edge */}
          <g transform={STAPLER_T}>
            <path d={BASE_D} fill="url(#st-base)" />
            <path d={BASE_D} fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
            {/* Chrome anvil plate with the two staple-folding grooves */}
            <path d="M318,-44 H342 C380,-44 404,-26 404,0 C404,26 380,44 342,44 H318 Z" fill="url(#st-chrome)" />
            <path d="M386,-12 q8,6 0,12 M386,2 q8,6 0,12" fill="none" stroke="#5c636b" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </g>

        {/* Paper is clamped in the stapler's throat: over the base, under the arm */}
        <PaperStack />

        {/* Staples in the paper corner */}
        <g transform={STAPLER_T}>
          {staples.map((s) => (
            <g key={s.id} transform={`translate(${s.x} ${s.y}) rotate(${s.r})`}>
              <g className="staple-in">
                <rect x="-2" y="-12" width="4" height="24" rx="1.2" fill="#3a2410" opacity="0.25" transform="translate(1.2 1.6)" />
                <rect x="-2" y="-12" width="4" height="24" rx="1.2" fill="url(#st-chrome)" stroke="#5f666e" strokeWidth="0.6" />
                <rect x="-2.6" y="-12.5" width="5.2" height="3" rx="1" fill="#9aa1a8" />
                <rect x="-2.6" y="9.5" width="5.2" height="3" rx="1" fill="#9aa1a8" />
              </g>
            </g>
          ))}
        </g>

        <g className="hit" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {/* Shadow of the raised arm on the base / desk */}
          <g filter="url(#st-cover-shadow)">
            <g transform={STAPLER_T}>
              <path d={COVER_D} transform={coverT} />
            </g>
          </g>

          {/* Hinge pin across the rear */}
          <g transform={STAPLER_T}>
            <rect x={HINGE_X - 18} y="-56" width="36" height="112" rx="8" fill="#2d3035" />
            <rect x={HINGE_X - 8} y="-58" width="16" height="116" rx="6" fill="url(#st-chrome)" />
            <circle cx={HINGE_X} cy="-55" r="5.5" fill="#d9dde1" stroke="#6b7178" strokeWidth="1" />
            <circle cx={HINGE_X} cy="55" r="5.5" fill="#b6bcc2" stroke="#6b7178" strokeWidth="1" />
          </g>

          {/* Top arm = the button */}
          <g transform={STAPLER_T}>
            <g transform={coverT} ref={coverRef}>
              {/* Side wall of the arm, visible on the shaded lower edge */}
              <path d={COVER_D} fill="#101114" transform="translate(-2 7)" />
              <path d={COVER_D} fill="url(#st-steel)" />
              <path d={COVER_D} fill="#1b2433" opacity={0.12 * pc} />
              {/* Brushed-steel streaks */}
              {[-36, -28, -20, -12, 12, 20, 28, 36].map((y) => (
                <line key={y} x1="44" x2="150" y1={y} y2={y} stroke="#fff" strokeOpacity="0.06" strokeWidth="0.8" />
              ))}
              {/* Raised ridge along the top of the arm */}
              <rect x="40" y="-28" width="110" height="5" rx="2.5" fill="#fff" opacity="0.18" />
              {/* Front cap with the staple outlet */}
              <path d={NOSE_D} fill="url(#st-steel-dark)" />
              <rect x="356" y="-14" width="6" height="28" rx="2.5" fill="#16181b" />
              <text x="60" y="-18" className="st-emboss">
                HD-10
              </text>

              {/* Press pad */}
              <rect x="160" y="-27" width="136" height="54" rx="18" fill="#1b2a47" opacity="0.5" transform="translate(1 2)" />
              <rect x="160" y="-27" width="136" height="54" rx="18" fill={faceColor} />
              <rect x="160" y="-27" width="136" height="54" rx="18" fill="url(#st-face-gloss)" />
              <rect x="160" y="-27" width="136" height="54" rx="18" fill="none" stroke={pc > 0.3 ? '#14254a' : '#8fb0ee'} strokeOpacity="0.55" strokeWidth="1.2" />
              <text x="228" y="7" textAnchor="middle" className="st-label">
                Staple
              </text>

              <g clipPath="url(#st-cover-clip)">
                {ripples.map((r) => (
                  <Ripple key={r.id} x={r.x} y={r.y} onDone={() => setRipples((rs) => rs.filter((q) => q.id !== r.id))} />
                ))}
              </g>
            </g>
          </g>
        </g>

        {/* Count badge */}
        {count > 0 && (
          <g transform={`translate(${BADGE[0]} ${BADGE[1]}) scale(${badgeScale})`} style={{ pointerEvents: 'none' }}>
            <circle r="17" cx="2" cy="3" fill="#3a2410" opacity="0.28" />
            <circle r="16" fill="#e5412f" stroke="#fff" strokeWidth="2.6" />
            <circle r="11" cx="-3" cy="-4" fill="#fff" opacity="0.15" />
            <text y="5.6" textAnchor="middle" className="st-badge">
              {count > 99 ? '99+' : count}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
