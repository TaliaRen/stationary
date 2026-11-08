import { useEffect, useReducer, useRef, useState } from 'react';
import { Spring, useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, lerp } from '../lib/util';

// A canvas pencil case (top view, lying horizontally) as a dropdown. The zipper
// runs along the top long edge. Tap to unzip: the pens tumble out beside the case
// (the options). Tap one to choose it: it pops up, the others go back, the chosen
// one goes back last, and the case zips shut. The chosen pen's name is written
// on the case (the dropdown's current value).

const PENS = [
  { key: 'pencil', name: 'Pencil', L: 250, T: 16, material: 'wood' },
  { key: 'fountain', name: 'Fountain pen', L: 230, T: 17, material: 'metal' },
  { key: 'marker', name: 'Marker', L: 220, T: 30, material: 'plastic' },
  { key: 'highlighter', name: 'Highlighter', L: 205, T: 24, material: 'plastic' },
];
const TAP_SLOP = 10;
const STAGGER = 50; // ms between pens

const OUT_CFG = { stiffness: 260, damping: 17, precision: 0.002 };
const IN_CFG = { stiffness: 300, damping: 30, precision: 0.002 };
const ZIP_CFG = { stiffness: 140, damping: 24, precision: 0.002 };
const LIFT_CFG = { stiffness: 500, damping: 22, precision: 0.002 };

// Deterministic scatter: tipped out messily (big angles, uneven gaps), the same
// every time, plus a tiny random wobble per opening.
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seeded(20261107);
const SCATTER = PENS.map((_, i) => ({ angle: (rnd() - 0.5) * 44 + (i % 2 ? 9 : -7), dx: (rnd() - 0.5) * 110, dy: (rnd() - 0.5) * 0.45 }));

const rot = (x, y, deg) => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** Cylinder-ish stick: base fill with a top highlight and a bottom shade. */
function Stick({ x0, x1, h, fill, rx = 0, shine = 0.35 }) {
  return (
    <g>
      <rect x={x0} y={-h} width={x1 - x0} height={h * 2} rx={rx} fill={fill} />
      <rect x={x0 + rx * 0.3} y={-h * 0.82} width={Math.max(0, x1 - x0 - rx * 0.6)} height={h * 0.45} rx={Math.min(rx, h * 0.2)} fill="#fff" opacity={shine} />
      <rect x={x0} y={h * 0.35} width={x1 - x0} height={h * 0.65} rx={Math.min(rx, h * 0.6)} fill="#000" opacity="0.18" />
    </g>
  );
}

/** Each pen drawn horizontally: tip at x = 0, tail at x = L, centred on y = 0. */
function PenArt({ k }) {
  switch (k) {
    case 'pencil':
      return (
        <g>
          <path d="M26,-8 L6,-2.6 L6,2.6 L26,8 Z" fill="#e7c08a" />
          <path d="M6,-2.6 L0,-0.5 L0,0.5 L6,2.6 Z" fill="#3b3d42" />
          <rect x="26" y="-8" width="189" height="5.3" fill="#ffd84a" />
          <rect x="26" y="-2.7" width="189" height="5.4" fill="#f0bf2a" />
          <rect x="26" y="2.7" width="189" height="5.3" fill="#c99a12" />
          <path d="M26,-8 q-4,4 0,8 q-4,4 0,8" fill="#e7c08a" />
          <Stick x0={215} x1={233} h={8.3} fill="#b9bfc5" shine={0.6} />
          <line x1="221" x2="221" y1="-8" y2="8" stroke="#7d848b" />
          <line x1="227" x2="227" y1="-8" y2="8" stroke="#7d848b" />
          <Stick x0={232} x1={250} h={7.8} fill="#f08f98" rx={3} />
        </g>
      );
    case 'fountain':
      return (
        <g>
          <path d="M0,0 L22,-6 L31,-6.2 L31,6.2 L22,6 Z" fill="#d9b04a" />
          <path d="M0,0 L22,-6 L31,-6.2 L31,-2 Z" fill="#fff" opacity="0.35" />
          <line x1="3" y1="0" x2="23" y2="0" stroke="#5a4310" strokeWidth="0.8" />
          <circle cx="23" cy="0" r="1.3" fill="#5a4310" />
          <Stick x0={30} x1={64} h={6.6} fill="#1b1c1f" shine={0.25} />
          <Stick x0={62} x1={230} h={8.5} fill="#151618" rx={8} shine={0.3} />
          <rect x="62" y="-8.6" width="3" height="17.2" fill="#d9b04a" />
          <rect x="140" y="-8.6" width="4" height="17.2" fill="#d9b04a" />
          <rect x="158" y="-2.4" width="62" height="4.8" rx="2.4" fill="#e3bd57" />
          <circle cx="160" cy="0" r="3.4" fill="#e3bd57" />
        </g>
      );
    case 'ballpoint':
      return (
        <g>
          <path d="M0,0 L15,-3.6 L15,3.6 Z" fill="#c2c7cd" />
          <Stick x0={14} x1={64} h={5.8} fill="#6f9cf2" shine={0.4} />
          {[22, 30, 38, 46, 54].map((x) => (
            <line key={x} x1={x} x2={x} y1="-5.8" y2="5.8" stroke="#2f5fd0" strokeOpacity="0.5" />
          ))}
          <Stick x0={62} x1={224} h={6.5} fill="#2f5fd0" rx={6} />
          <rect x="150" y="-1.8" width="58" height="3.6" rx="1.8" fill="#dfe3e8" />
          <Stick x0={222} x1={240} h={4.6} fill="#f3f4f6" rx={3} shine={0.5} />
        </g>
      );
    case 'marker':
      return (
        <g>
          <Stick x0={0} x1={74} h={15} fill="#18191b" rx={14} shine={0.22} />
          <rect x="20" y="-2.5" width="46" height="5" rx="2.5" fill="#2c2e32" />
          <Stick x0={72} x1={220} h={14} fill="#f5f5f2" rx={10} shine={0.6} />
          <rect x="110" y="-10" width="76" height="20" rx="3" fill="#1b1b1b" opacity="0.9" />
          <text x="148" y="4" textAnchor="middle" className="pc-brand">
            MARKER
          </text>
        </g>
      );
    case 'highlighter':
      return (
        <g>
          <path d="M0,-4 L10,-10 L19,-10 L19,10 L7,10 Z" fill="#f4e84a" />
          <Stick x0={18} x1={72} h={12} fill="#f2d633" rx={4} shine={0.4} />
          <Stick x0={70} x1={205} h={11} fill="#ffe94d" rx={6} shine={0.45} />
          <rect x="96" y="-2" width="90" height="4" rx="2" fill="#d4b81f" />
        </g>
      );
    case 'brush':
    default:
      return (
        <g>
          <path d="M0,0 C6,-2 18,-5.6 34,-5 L34,5 C18,5.6 6,2 0,0 Z" fill="#2b2420" />
          <path d="M6,-1 C14,-3 24,-4.4 34,-4" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.8" />
          <Stick x0={33} x1={47} h={5.4} fill="#8a6a3a" />
          <Stick x0={46} x1={300} h={5} fill="#cfb57a" rx={4} shine={0.45} />
          {[112, 182, 252].map((x) => (
            <g key={x}>
              <rect x={x} y="-5.4" width="3.4" height="10.8" rx="1" fill="#9c8248" />
              <line x1={x + 4} x2={x + 4} y1="-4.6" y2="4.6" stroke="#f3e2b0" strokeOpacity="0.7" />
            </g>
          ))}
          <path d="M300,0 c18,-10 32,6 22,18 c-6,8 -15,3 -12,-3" fill="none" stroke="#c62b2b" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M312,15 l-3,12 M315,16 l0,12 M318,15 l3,11" stroke="#c62b2b" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
  }
}

export default function PencilCaseDropdown({
  vbW = 640,
  vbH = 480,
  caseAt = [20, 10],
  caseSize = [180, 450],
  pensAt = [230, 20],
  slotH = 72,
  nameSize = 20,
}) {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState('closed'); // closed | opening | open | closing
  const [active, setActive] = useState(0);
  const [wobble, setWobble] = useState(PENS.map(() => 0));
  const phaseRef = useRef('closed');
  const selRef = useRef(0);
  const timers = useRef([]);
  const down = useRef(null);
  const [, force] = useReducer((n) => n + 1, 0);

  const zip = useSpring(0, ZIP_CFG);
  // Per-pen springs: a = in the case → out on the desk, lift = pick-up pop.
  const springs = useRef(null);
  if (!springs.current) {
    springs.current = PENS.map(() => ({ a: new Spring(0, OUT_CFG), lift: new Spring(0, LIFT_CFG) }));
  }
  useEffect(() => {
    const offs = springs.current.flatMap((s) => [s.a.listen(force), s.lift.listen(force)]);
    return () => {
      offs.forEach((off) => off());
      springs.current.forEach((s) => [s.a, s.lift].forEach((sp) => sp.stop()));
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const setPh = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const open = () => {
    if (phaseRef.current !== 'closed') return;
    setPh('opening');
    setWobble(PENS.map(() => (Math.random() - 0.5) * 4));
    setActive(selRef.current);
    sfx.zipper(0.4, true);
    zip.to(1, ZIP_CFG);
    PENS.forEach((p, i) => {
      later(260 + i * STAGGER, () => {
        const s = springs.current[i];
        s.a.to(1, OUT_CFG);
        later(170, () => sfx.penDrop(p.material));
      });
    });
    later(260 + PENS.length * STAGGER + 250, () => setPh('open'));
  };

  // Put everything back; `j` (the chosen pen) goes back last.
  const closeWith = (j, chosen) => {
    if (phaseRef.current !== 'open') return;
    setPh('closing');
    let t = 0;
    if (chosen) {
      const s = springs.current[j];
      s.lift.to(1, LIFT_CFG);
      later(160, () => s.lift.to(0, LIFT_CFG));
      t = 180;
    }
    const order = PENS.map((_, i) => i).reverse().filter((i) => i !== j);
    order.forEach((i, k) => later(t + k * STAGGER, () => springs.current[i].a.to(0, IN_CFG)));
    t += order.length * STAGGER + 120;
    later(t, () => {
      springs.current[j].a.to(0, IN_CFG);
      if (chosen && j !== selRef.current) {
        selRef.current = j;
        setSelected(j);
      }
    });
    later(t + 260, () => {
      sfx.zipper(0.25, false);
      zip.to(0, ZIP_CFG, () => setPh('closed'));
    });
  };

  const toggle = () => {
    if (phaseRef.current === 'closed') open();
    else if (phaseRef.current === 'open') closeWith(selRef.current, false);
  };

  // Tap = press and release within TAP_SLOP px.
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const tapped = (e) => {
    const d = down.current;
    down.current = null;
    return d && d.id === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP;
  };

  const onKeyDown = (e) => {
    const ph = phaseRef.current;
    if (ph === 'closed' && ['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      open();
    } else if (ph === 'open') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : PENS.length - 1)) % PENS.length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeWith(active, true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeWith(selRef.current, false);
      }
    }
  };

  // ---------- geometry ----------
  const [cx0, cy0] = caseAt;
  const [cw, ch] = caseSize;
  const zipY = cy0 + 24; // zipper along the top long edge
  const zipL = cx0 + 24;
  const zipR = cx0 + cw - 24;
  const zipClosedX = zipL + 8; // fully zipped
  const z = clamp(zip.x, -0.05, 1.05);
  const sliderX = lerp(zipClosedX, zipR, z);

  const poseOf = (i) => {
    const p = PENS[i];
    const s = springs.current[i];
    const sc = SCATTER[i];
    const out = { x: pensAt[0] + p.L / 2 + sc.dx, y: pensAt[1] + slotH * (i + 0.5) + sc.dy * slotH, ang: sc.angle + wobble[i] };
    const inn = { x: cx0 + cw / 2, y: cy0 + ch * (0.42 + i * 0.03), ang: 0 }; // stowed lengthwise, fully inside
    const a = clamp(s.a.x, -0.1, 1.15);
    return {
      x: lerp(inn.x, out.x, a),
      y: lerp(inn.y, out.y, a),
      ang: lerp(inn.ang, out.ang, clamp(a, 0, 1)),
      out: clamp(a, 0, 1), // how far out on the desk (shadow / name)
      lift: clamp(s.lift.x, 0, 1.2),
    };
  };

  const isOpen = phase !== 'closed';
  const gapMax = 6 + 16 * clamp(z, 0, 1);
  const gapPath = (() => {
    // Lens-shaped opening between the two zipper tapes, from the left end to the slider.
    const n = 16;
    const top = [];
    const bot = [];
    for (let k = 0; k <= n; k++) {
      const xx = lerp(zipL, sliderX, k / n);
      const w = k === 0 ? gapMax * 0.6 : gapMax * Math.sin((Math.PI * k) / n);
      top.push(`${xx.toFixed(1)},${(zipY - w / 2).toFixed(1)}`);
      bot.unshift(`${xx.toFixed(1)},${(zipY + w / 2).toFixed(1)}`);
    }
    return `M${top.join(' L')} L${bot.join(' L')} Z`;
  })();

  const teeth = [];
  for (let xx = zipL; xx <= zipR; xx += 5) {
    const opened = xx < sliderX;
    const k = opened ? (xx - zipL) / Math.max(1, sliderX - zipL) : 0;
    const off = opened ? (gapMax * Math.sin(Math.PI * k)) / 2 + 1 : 0;
    const side = Math.round((xx - zipL) / 5) % 2 ? 1 : -1;
    teeth.push(<rect key={xx} x={xx - 1.2} y={zipY + side * (2.2 + off) - (side < 0 ? 4 : 0)} width="2.4" height="4" rx="0.8" fill="#c9ced4" stroke="#7d848b" strokeWidth="0.4" />);
  }

  const name = PENS[selected].name;

  return (
    <div
      className={`item${isOpen ? ' dropdown-open' : ''}`}
      role="combobox"
      tabIndex={0}
      aria-expanded={phase === 'open' || phase === 'opening'}
      aria-haspopup="listbox"
      aria-controls="pen-listbox"
      aria-activedescendant={phase === 'open' ? `pen-opt-${active}` : undefined}
      aria-label={`笔袋 Dropdown，当前：${name}`}
      onKeyDown={onKeyDown}
    >
      <svg viewBox={`0 0 ${vbW} ${vbH}`}>
        <defs>
          <pattern id="pc-canvas" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#d8c6a3" />
            <path d="M0,1 H4 M0,3 H4" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.8" />
            <path d="M1,0 V4 M3,0 V4" stroke="#6b5534" strokeOpacity="0.1" strokeWidth="0.8" />
          </pattern>
          <linearGradient id="pc-shade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#3a2410" stopOpacity="0.25" />
          </linearGradient>
          <filter id="pc-case-shadow" x="-20%" y="-10%" width="140%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="9" />
            <feOffset dx="11" dy="15" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.13  0 0 0 0 0.05  0 0 0 0.4 0" result="far" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="cb" />
            <feOffset in="cb" dx="2" dy="3" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.13  0 0 0 0 0.05  0 0 0 0.45 0" result="near" />
            <feMerge>
              <feMergeNode in="far" />
              <feMergeNode in="near" />
            </feMerge>
          </filter>
        </defs>

        {/* Tap anywhere off the pens to close (only while open) */}
        {phase === 'open' && (
          <rect
            className="hit"
            x={-4000}
            y={-4000}
            width={8000}
            height={8000}
            fill="transparent"
            onPointerDown={onDown}
            onPointerUp={(e) => tapped(e) && closeWith(selRef.current, false)}
          />
        )}

        {/* Pens (listbox). Drawn under the case so they slide out from inside it. */}
        <g role="listbox" id="pen-listbox" aria-label="笔">
          {PENS.map((p, i) => {
            const ps = poseOf(i);
            const shadowA = ps.out;
            const sd = 4 + 10 * ps.lift;
            const [lx, ly] = rot(p.L / 2 + 14, 0, ps.ang);
            return (
              <g
                key={p.key}
                role="option"
                id={`pen-opt-${i}`}
                aria-selected={selected === i}
                aria-label={p.name}
                className={phase === 'open' ? 'hit' : undefined}
                onPointerDown={onDown}
                onPointerUp={(e) => {
                  if (!tapped(e)) return;
                  if (phaseRef.current === 'open') closeWith(i, true);
                }}
              >
                {shadowA > 0.02 && (
                  <g transform={`translate(${ps.x + sd} ${ps.y + sd * 1.3}) rotate(${ps.ang}) translate(${-p.L / 2} 0)`} opacity={shadowA * (0.28 - 0.1 * ps.lift)}>
                    <rect x="0" y={-p.T / 2 - 1} width={p.L} height={p.T + 2} rx={p.T / 2} fill="#3a2410" />
                  </g>
                )}
                <g transform={`translate(${ps.x} ${ps.y}) rotate(${ps.ang}) scale(${1 + 0.05 * ps.lift}) translate(${-p.L / 2} 0)`}>
                  {/* Generous invisible hit area: at least slotH tall */}
                  <rect x="-10" y={-slotH / 2} width={p.L + 20} height={slotH} fill="transparent" />
                  <PenArt k={p.key} />
                </g>
                {ps.out > 0.05 && (
                  <text x={ps.x + lx} y={ps.y + ly + nameSize * 0.32} className="pc-name" style={{ fontSize: nameSize }} opacity={ps.out}>
                    {p.name}
                  </text>
                )}
                {phase === 'open' && active === i && (
                  <rect x={ps.x - p.L / 2 - 8} y={ps.y - slotH / 2 + 4} width={p.L + 16} height={slotH - 8} rx="10" fill="none" className="kbd-only" stroke="#4a3522" strokeDasharray="4 4" />
                )}
              </g>
            );
          })}
        </g>

        {/* The case */}
        <g
          className="hit"
          onPointerDown={onDown}
          onPointerUp={(e) => tapped(e) && toggle()}
        >
          <rect x={cx0} y={cy0} width={cw} height={ch} rx="34" filter="url(#pc-case-shadow)" />
          <rect x={cx0} y={cy0} width={cw} height={ch} rx="34" fill="url(#pc-canvas)" />
          <rect x={cx0} y={cy0} width={cw} height={ch} rx="34" fill="url(#pc-shade)" />
          <rect x={cx0 + 9} y={cy0 + 9} width={cw - 18} height={ch - 18} rx="27" fill="none" stroke="#8a7350" strokeWidth="1.3" strokeDasharray="5 4" />
          {/* Leather patch */}
          <rect x={cx0 + cw / 2 - 40} y={cy0 + ch / 2 - 22} width="56" height="38" rx="6" fill="#8a5a36" transform={`translate(-6 0)`} />
          <rect x={cx0 + cw / 2 - 43} y={cy0 + ch / 2 - 19} width="50" height="32" rx="4" fill="none" stroke="#e8cfa8" strokeOpacity="0.6" strokeDasharray="3 2.5" strokeWidth="1" />
          {/* Current value: the chosen pen's name, pencilled on the canvas */}
          <text x={cx0 + cw / 2 - 6} y={cy0 + ch / 2 + 46} textAnchor="middle" className="pc-case-name" style={{ fontSize: nameSize * 1.15 }}>
            {name}
          </text>
          {/* Zipper tape, opening, teeth */}
          <rect x={zipL - 6} y={zipY - 9} width={zipR - zipL + 12} height="18" rx="6" fill="#b9a47e" />
          <path d={gapPath} fill="#2e241b" />
          {teeth}
          {/* Slider + leather pull tag */}
          <g transform={`translate(${sliderX} ${zipY})`}>
            <rect x="-11" y="-8" width="22" height="16" rx="4" fill="#c4c9cf" stroke="#6c737a" strokeWidth="0.8" />
            <rect x="-7" y="-5" width="12" height="4" rx="2" fill="#fff" opacity="0.55" />
            <rect x="-4" y="9" width="8" height="10" rx="2" fill="#9aa1a8" />
            <path d="M-9,18 h18 l-3,32 h-12 Z" fill="#8a5a36" />
            <circle cx="0" cy="24" r="2.2" fill="#3a2410" />
          </g>
          {/* Big invisible touch target on the slider */}
          <circle cx={sliderX} cy={zipY + 18} r="34" fill="transparent" />
        </g>
      </svg>
    </div>
  );
}
