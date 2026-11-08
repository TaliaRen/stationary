import { useRef, useState } from 'react';
import { useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, mixColor, svgPoint, capture } from '../lib/util';
import { CHROME, CylinderGradient, DeskShadow } from '../lib/svg';

// A retractable ballpoint pen drawn along the local x axis (tail at -x, tip at +x).
// The toggle lives in a small clear window in the barrel: a dot slides OFF → ON.
const R = 20; // barrel radius
const WIN_X0 = 20;
const WIN_X1 = 80;
const WIN_H = 18;
const DOT_R = 6.5;
const DOT_MIN = WIN_X0 + 11;
const DOT_MAX = WIN_X1 - 11;
const TIP_TRAVEL = 16;
const PRESS_DEPTH = 10;
const ON_SINK = 9; // when ON the plunger stays partly pushed in (shorter), like a real click pen
const PEN_LEN = 568;
const PAD = 56;

const DOT_CFG = { stiffness: 520, damping: 22, precision: 0.03 };
const PRESS_CFG = { stiffness: 1400, damping: 40, precision: 0.02 };
const REBOUND_CFG = { stiffness: 700, damping: 11, precision: 0.02 }; // bouncy latch when clicking ON
const RETURN_CFG = { stiffness: 700, damping: 26, precision: 0.02 }; // long spring-back when clicking OFF: only a slight bounce
const MIN_PRESS_MS = 70; // a quick tap still pushes the button all the way down
const BOUNCE_KICK = -280; // upward flick on release so the button visibly bounces

const OFF_COLOR = '#8a9098';
const ON_COLOR = '#35d17f';

export default function PenToggle({ angle = -8 }) {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const penRef = useRef(null);
  const drag = useRef(null);
  const dot = useSpring(DOT_MIN, DOT_CFG);
  const plunger = useSpring(0, PRESS_CFG);

  // Bounding box of the rotated pen (+ room for the shadow).
  const a = (angle * Math.PI) / 180;
  const vbW = Math.round(PEN_LEN * Math.abs(Math.cos(a)) + 2 * R * Math.abs(Math.sin(a)) + PAD * 2);
  const vbH = Math.round(PEN_LEN * Math.abs(Math.sin(a)) + 2 * R * Math.abs(Math.cos(a)) + PAD * 2);
  const T = `translate(${vbW / 2 - 6} ${vbH / 2 - 8}) rotate(${angle})`;

  const commit = (next) => {
    dot.to(next ? DOT_MAX : DOT_MIN, DOT_CFG);
    if (next !== onRef.current) {
      onRef.current = next;
      setOn(next);
      sfx.penClick(next);
    }
  };
  // Plunger rest position depends on state; a press always sinks PRESS_DEPTH below it.
  const rest = () => (onRef.current ? ON_SINK : 0);
  const pressedAt = useRef(0);
  const press = () => {
    pressedAt.current = performance.now();
    plunger.to(rest() + PRESS_DEPTH, PRESS_CFG);
  };
  // Let go: spring back up to the rest position with a small bounce — but only
  // after the press has really bottomed out, even for a very quick tap.
  const release = () => {
    const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - pressedAt.current));
    setTimeout(() => {
      // Clicking ON latches the button half-in: give it a visible bounce there.
      // Clicking OFF it springs a long way back out, so keep that bounce small.
      if (onRef.current) {
        plunger.to(rest(), REBOUND_CFG);
        plunger.kick(BOUNCE_KICK);
      } else {
        plunger.to(rest(), RETURN_CFG);
      }
    }, wait);
  };

  // Tap anywhere on the pen to click it; drag along it to slide the dot.
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capture(e);
    drag.current = { id: e.pointerId, x0: svgPoint(penRef.current, e).x, d0: dot.x, moved: false };
    press();
    sfx.penPress();
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Drag along the pen's own axis (pointer converted into rotated pen coordinates).
    const dx = svgPoint(penRef.current, e).x - d.x0;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      release();
    }
    if (d.moved) dot.set(clamp(d.d0 + dx * 0.6, DOT_MIN - 2, DOT_MAX + 2));
  };
  const finish = (e, cancelled) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) commit(dot.x > (DOT_MIN + DOT_MAX) / 2);
    else if (!cancelled) commit(!onRef.current);
    release();
  };
  const onKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      press();
      commit(!onRef.current);
      setTimeout(release, 90);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      commit(true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commit(false);
    }
  };

  const praw = (dot.x - DOT_MIN) / (DOT_MAX - DOT_MIN);
  const p = clamp(praw, 0, 1);
  const tipOut = TIP_TRAVEL * clamp(praw, -0.05, 1.12) - TIP_TRAVEL;
  const win = mixColor(OFF_COLOR, ON_COLOR, p);
  const px = plunger.x;

  return (
    <div className="item" role="switch" aria-checked={on} aria-label="圆珠笔 Toggle" tabIndex={0} onKeyDown={onKeyDown}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} aria-hidden="true">
        <defs>
          <DeskShadow id="pen-shadow" dx={10} dy={14} blur={9} opacity={0.4} contact={0.6} contactBlur={1.6} />
          <CylinderGradient
            id="pen-body"
            stops={[[0, '#2c2f35'], [0.1, '#6a7079'], [0.2, '#a3aab3'], [0.32, '#474b53'], [0.62, '#25282d'], [0.88, '#141518'], [1, '#26292e']]}
          />
          <CylinderGradient id="pen-chrome" stops={CHROME} />
          <CylinderGradient
            id="pen-grip"
            stops={[[0, '#1c1e21'], [0.18, '#4b4f55'], [0.32, '#24262a'], [0.75, '#111214'], [1, '#1c1d20']]}
          />
          <linearGradient id="pen-win-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.45" />
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="pen-dot" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.7" stopColor="#e8eaec" />
            <stop offset="1" stopColor="#a9aeb4" />
          </radialGradient>
          <radialGradient id="pen-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={ON_COLOR} stopOpacity="0.55" />
            <stop offset="1" stopColor={ON_COLOR} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Desk shadow from the pen silhouette (unrotated filter = global light direction) */}
        <g filter="url(#pen-shadow)">
          <g transform={T}>
            <rect x={-284 + px} y="-11" width="56" height="22" rx="10" />
            <rect x="-240" y={-R} width="478" height={R * 2} rx="6" />
            <path d="M236,-19.5 C250,-19 262,-10 270,-6 L270,6 C262,10 250,19 236,19.5 Z" />
            <rect x={258 + tipOut} y="-4" width="26" height="8" rx="3" />
          </g>
        </g>

        <g
          ref={penRef}
          transform={T}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
        >

          {/* Plunger (push button) */}
          <g transform={`translate(${px} 0)`}>
            <rect x="-284" y="-11" width="56" height="22" rx="10" fill="url(#pen-body)" />
            <rect x="-282" y="-6" width="10" height="12" rx="5" fill="#fff" opacity="0.12" />
          </g>

          {/* Barrel */}
          <rect x="-230" y={-R} width="468" height={R * 2} fill="url(#pen-body)" />
          {/* Tail ring */}
          <rect x="-242" y={-R - 0.5} width="14" height={R * 2 + 1} rx="3" fill="url(#pen-chrome)" />

          {/* Pocket clip */}
          <rect x="-230" y="-2" width="132" height="10" rx="5" fill="#000" opacity="0.4" transform="translate(2 3)" />
          <rect x="-238" y="-8.5" width="38" height="17" rx="4" fill="url(#pen-chrome)" />
          <rect x="-206" y="-4.5" width="106" height="9" rx="4.5" fill="url(#pen-chrome)" />
          <circle cx="-102" cy="0" r="6.5" fill="url(#pen-chrome)" />
          <circle cx="-103.5" cy="-2" r="2" fill="#fff" opacity="0.8" />

          {/* Toggle window: clear slot with a sliding dot */}
          {p > 0.02 && <ellipse cx={(WIN_X0 + WIN_X1) / 2} cy="0" rx={(WIN_X1 - WIN_X0) / 2 + 24} ry="22" fill="url(#pen-glow)" opacity={p} />}
          <rect x={WIN_X0 - 3} y={-WIN_H / 2 - 3} width={WIN_X1 - WIN_X0 + 6} height={WIN_H + 6} rx={(WIN_H + 6) / 2} fill="url(#pen-chrome)" />
          <rect x={WIN_X0} y={-WIN_H / 2} width={WIN_X1 - WIN_X0} height={WIN_H} rx={WIN_H / 2} fill={win} />
          <rect x={WIN_X0} y={-WIN_H / 2} width={WIN_X1 - WIN_X0} height={WIN_H} rx={WIN_H / 2} fill="url(#pen-win-shade)" />
          <circle cx={dot.x + 1} cy="1.6" r={DOT_R} fill="#000" opacity="0.3" />
          <circle cx={dot.x} cy="0" r={DOT_R} fill="url(#pen-dot)" />
          <rect x={WIN_X0 + 6} y={-WIN_H / 2 + 2} width={WIN_X1 - WIN_X0 - 12} height="4.5" rx="2.25" fill="#fff" opacity="0.5" />

          {/* Printed state labels */}
          <text x={WIN_X0 - 12} y="4" textAnchor="end" className="pen-label" fill={on ? '#7b818a' : '#ffffff'}>
            OFF
          </text>
          <text x={WIN_X1 + 12} y="4" textAnchor="start" className="pen-label" fill={on ? '#6ff0a8' : '#7b818a'}>
            ON
          </text>

          {/* Front ring + rubber grip */}
          <rect x="146" y={-R - 0.3} width="6" height={R * 2 + 0.6} fill="url(#pen-chrome)" />
          <rect x="152" y={-R + 1} width="84" height={R * 2 - 2} fill="url(#pen-grip)" />
          {Array.from({ length: 12 }, (_, i) => 158 + i * 6.5).map((gx) => (
            <g key={gx}>
              <line x1={gx} x2={gx} y1={-R + 2} y2={R - 2} stroke="#000" strokeOpacity="0.55" strokeWidth="2" />
              <line x1={gx + 2} x2={gx + 2} y1={-R + 3} y2={R - 3} stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />
            </g>
          ))}

          {/* Writing tip (slides out of the cone) */}
          <g transform={`translate(${tipOut} 0)`}>
            <path d="M258,-4.2 L281,-1.8 L281,1.8 L258,4.2 Z" fill="url(#pen-chrome)" />
            <circle cx="282" cy="0" r="1.9" fill="#2a2e33" />
          </g>

          {/* Conical nose */}
          <rect x="234" y={-R} width="5" height={R * 2} fill="url(#pen-chrome)" />
          <path d="M238,-19.5 C251,-19 262,-10 270,-6 L270,6 C262,10 251,19 238,19.5 Z" fill="url(#pen-chrome)" />
          <ellipse cx="269.5" cy="0" rx="1.6" ry="5.5" fill="#2a2d31" />

          {/* Touch target (on top, invisible) covering the whole pen */}
          <rect className="hit" x="-306" y="-44" width="604" height="88" fill="transparent" />
        </g>
      </svg>
    </div>
  );
}
