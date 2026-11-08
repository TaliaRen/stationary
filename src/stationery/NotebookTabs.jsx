import { useEffect, useRef, useState } from 'react';
import { useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, mixColor } from '../lib/util';
import { DeskShadow } from '../lib/svg';

// An open cloth-bound notebook (viewBox 900 x 660). Translucent plastic index
// tabs on the right page's top edge form the tab bar; the spread is the panel.
const VB_W = 900;
const VB_H = 660;
const SX = 450; // spine
const TOP = 86;
const PH = 532; // page height
const PW = 400; // page width
const LEFT = { x: SX - PW, y: TOP, w: PW, h: PH };
const RIGHT = { x: SX, y: TOP, w: PW, h: PH };
const TAB_W = 78;
const TAB_X = (i) => 560 + i * 92;
const TAB_LOW = 24;
const TAB_HIGH = 46;
const TAB_STUCK = 30; // part of the tab stuck onto the page

const TABS = [
  { label: 'To-do', strong: '#f7c531', pale: '#f8e6a4', ink: '#6b4d00' },
  { label: 'Sketch', strong: '#f2709b', pale: '#f6cbda', ink: '#7a1f3f' },
  { label: 'Notes', strong: '#3f9de6', pale: '#c4def3', ink: '#0f3a60' },
];
const SR_TEXT = ['To-do list: six items, two done.', 'Sketch: a small drawing of the sun over hills.', 'Notes: a few lines of handwritten notes.'];

const LIFT_CFG = { stiffness: 480, damping: 20, precision: 0.002 };
const FLIP_CFG = { stiffness: 110, damping: 21, precision: 0.01 };
const STAGGER = 130;

const PEN = { fill: 'none', stroke: '#4d453d', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Ruled({ x, y, w, h }) {
  const lines = [];
  for (let ly = y + 92; ly < y + h - 20; ly += 30) lines.push(ly);
  return lines.map((ly) => <line key={ly} x1={x + 26} x2={x + w - 26} y1={ly} y2={ly} stroke="#93b8d6" strokeOpacity="0.4" strokeWidth="1" />);
}

/** Right-hand page of section i (the tab's content). */
function RightPage({ i }) {
  const { x, y, w, h } = RIGHT;
  const row = (k) => y + 92 + k * 30;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fcf8ef" />
      <Ruled {...RIGHT} />
      <text x={x + 44} y={y + 74} className="nb-title">
        {TABS[i].label}
      </text>
      <rect x={x + 44} y={y + 84} width="84" height="5" rx="2.5" fill={TABS[i].strong} opacity="0.85" />
      {i === 0 &&
        [0, 1, 2, 3, 4, 5].map((k) => (
          <g key={k}>
            <rect x={x + 44} y={row(k + 1) - 18} width="15" height="15" rx="3" fill="none" stroke="#4d453d" strokeWidth="1.8" />
            {k < 2 && <path d={`M${x + 46},${row(k + 1) - 11} l5,5 l10,-13`} {...PEN} stroke="#2f9e5f" />}
            <line x1={x + 72} x2={x + 72 + [190, 150, 230, 120, 170, 90][k]} y1={row(k + 1) - 9} y2={row(k + 1) - 9} {...PEN} strokeOpacity={k < 2 ? 0.3 : 0.7} />
          </g>
        ))}
      {i === 1 && (
        <g>
          <circle cx={x + 270} cy={y + 170} r="24" {...PEN} stroke="#e08a2c" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={x + 270 + Math.cos(r) * 32}
                y1={y + 170 + Math.sin(r) * 32}
                x2={x + 270 + Math.cos(r) * 42}
                y2={y + 170 + Math.sin(r) * 42}
                {...PEN}
                stroke="#e08a2c"
              />
            );
          })}
          <path d={`M${x + 50},${y + 330} L${x + 130},${y + 220} L${x + 190},${y + 290} L${x + 236},${y + 246} L${x + 340},${y + 330}`} {...PEN} />
          <path d={`M${x + 110},${y + 330} q20,-14 40,0 t40,0 t40,0`} {...PEN} strokeOpacity="0.5" />
          <line x1={x + 44} x2={x + 250} y1={y + 392} y2={y + 392} {...PEN} strokeOpacity="0.45" />
          <line x1={x + 44} x2={x + 190} y1={y + 422} y2={y + 422} {...PEN} strokeOpacity="0.45" />
        </g>
      )}
      {i === 2 && (
        <g>
          <rect x={x + 42} y={row(1) - 20} width="96" height="16" rx="4" fill="#ffe36b" opacity="0.75" />
          {[260, 220, 290, 170, 240, 120, 210, 150].map((len, k) => (
            <line key={k} x1={x + 44} x2={x + 44 + len} y1={row(k + 1) - 9} y2={row(k + 1) - 9} {...PEN} strokeOpacity="0.7" />
          ))}
        </g>
      )}
    </g>
  );
}

/** Left-hand page of section i (what the previous sheet's back shows). */
function LeftPage({ i }) {
  const { x, y, w, h } = LEFT;
  const lens = [[210, 260, 180, 230, 140], [160, 240, 200], [250, 190, 270, 150, 220, 180]][i];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fbf7ed" />
      <Ruled {...LEFT} />
      {lens.map((len, k) => (
        <line key={k} x1={x + 40} x2={x + 40 + len} y1={y + 113 + k * 30} y2={y + 113 + k * 30} {...PEN} strokeOpacity="0.38" />
      ))}
      {i === 1 && <path d={`M${x + 80},${y + 330} c30,-60 90,-60 120,0 c-30,40 -90,40 -120,0 Z M${x + 80},${y + 330} L${x + 200},${y + 330}`} {...PEN} stroke="#3f8a55" strokeOpacity="0.7" />}
      <text x={x + w - 46} y={y + h - 24} className="nb-hand" opacity="0.5">
        {i * 2 + 2}
      </text>
    </g>
  );
}

/** Gutter shading + page curvature drawn on top of both pages. */
function Gutter() {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={SX - 60} y={TOP} width="60" height={PH} fill="url(#nb-gutter-l)" />
      <rect x={SX} y={TOP} width="60" height={PH} fill="url(#nb-gutter-r)" />
      <line x1={SX} x2={SX} y1={TOP} y2={TOP + PH} stroke="#5a4a36" strokeOpacity="0.35" strokeWidth="1.2" />
    </g>
  );
}

/** One sheet turning around the spine: front = right page k, back = left page k+1. */
function FlipPage({ fid, front, back, dir, delay, onDone, onCross }) {
  const s = useSpring(dir > 0 ? 0 : 1, FLIP_CFG);
  // Report the moment the sheet passes the spine so the parent can restack it.
  useEffect(() => {
    let crossed = false;
    return s.listen((x) => {
      if (!crossed && (dir > 0 ? x >= 0.5 : x <= 0.5)) {
        crossed = true;
        onCross();
      }
    });
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      sfx.pageFlip();
      s.to(dir > 0 ? 1 : 0, FLIP_CFG, onDone);
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const th = clamp(s.x, 0, 1);
  const phi = Math.PI * th;
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const curl = 0.3 * sn * dir; // the leading bottom corner turns first
  const xt = SX + PW * Math.cos(clamp(phi - curl * 0.35, 0, Math.PI));
  const xb = SX + PW * Math.cos(clamp(phi + curl, 0, Math.PI));
  const bulge = (c >= 0 ? 1 : -1) * 24 * sn;
  const xm = (xt + xb) / 2 + bulge;
  // Perspective: the lifted free edge comes closer to the eye, so it looks taller.
  const lift = 0.06 * PH * sn;
  const bot = TOP + PH;
  const midY = TOP + PH / 2;
  const d = `M${SX},${TOP} L${xt},${TOP - lift} Q${xm},${midY} ${xb},${bot + lift} L${SX},${bot} Z`;
  const showFront = c > 0;
  const k = Math.max(0.001, Math.abs(c));
  const clipId = `nb-flip-${fid}`;
  // The raised sheet's shadow falls to the lower right (light from the upper left).
  const sdx = 30 * sn;
  const sdy = 20 * sn;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {sn > 0.01 && (
        <g clipPath="url(#nb-pages-clip)" fill="#3a2410">
          <path d={d} transform={`translate(${sdx} ${sdy})`} opacity={0.09 * sn} />
          <path d={d} transform={`translate(${sdx * 0.6} ${sdy * 0.6})`} opacity={0.1 * sn} />
          <path d={d} transform={`translate(${sdx * 0.25} ${sdy * 0.25})`} opacity={0.12 * sn} />
        </g>
      )}
      <clipPath id={clipId}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${SX} ${midY}) scale(${k} ${1 + 0.06 * sn}) translate(${-SX} ${-midY})`}>
          {showFront ? <RightPage i={front} /> : <LeftPage i={back} />}
        </g>
        {/* Bend shading: fades to nothing at rest so landing is seamless */}
        <path d={d} fill={showFront ? 'url(#nb-bend-r)' : 'url(#nb-bend-l)'} opacity={sn} />
      </g>
      <path d={d} fill="none" stroke="#7a6a55" strokeOpacity={0.3 * sn} strokeWidth="1" />
    </g>
  );
}

/** Translucent plastic index tab with a glossy, slightly curled tip. */
function Tab({ i, lift }) {
  const h = TAB_LOW + (TAB_HIGH - TAB_LOW) * lift;
  const x = TAB_X(i);
  const t = TABS[i];
  const fill = mixColor(t.pale, t.strong, lift);
  const top = TOP - h;
  const stuckBot = TOP + TAB_STUCK;
  const outline = `M${x},${stuckBot} V${top + 7} Q${x},${top} ${x + 7},${top} H${x + TAB_W - 7} Q${x + TAB_W},${top} ${x + TAB_W},${top + 7} V${stuckBot} Z`;
  return (
    <g>
      {/* contact shadow on page/cover */}
      <path d={outline} fill="#3a2410" opacity="0.18" transform="translate(2.5 3.5)" />
      {/* Exposed part (opaque-ish) */}
      <path d={`M${x},${TOP} V${top + 7} Q${x},${top} ${x + 7},${top} H${x + TAB_W - 7} Q${x + TAB_W},${top} ${x + TAB_W},${top + 7} V${TOP} Z`} fill={fill} opacity="0.92" />
      {/* Stuck-on part: you can see the page through the plastic */}
      <rect x={x} y={TOP} width={TAB_W} height={TAB_STUCK} fill={fill} opacity="0.45" />
      <path d={outline} fill="none" stroke={t.strong} strokeOpacity="0.7" strokeWidth="1" />
      {/* Gloss + curled corner */}
      <rect x={x + 5} y={top + 3} width={TAB_W - 18} height="3" rx="1.5" fill="#fff" opacity="0.6" />
      <path d={`M${x + TAB_W - 14},${top} H${x + TAB_W - 7} Q${x + TAB_W},${top} ${x + TAB_W},${top + 7} V${top + 14} Z`} fill="#fff" opacity="0.4" />
      <path d={`M${x + TAB_W - 14},${top} L${x + TAB_W},${top + 14}`} stroke="#000" strokeOpacity="0.12" strokeWidth="1" />
      <text x={x + TAB_W / 2} y={top + 25 + 7 * lift} textAnchor="middle" className="nb-tab" fill={t.ink} opacity={0.55 + 0.45 * lift}>
        {t.label}
      </text>
    </g>
  );
}

let flipUid = 0;

export default function NotebookTabs() {
  const [selected, setSelected] = useState(0);
  const [base, setBase] = useState({ left: 0, right: 0 });
  const [flips, setFlips] = useState([]);
  const [crossed, setCrossed] = useState([]); // fids in the order they passed the spine
  const selRef = useRef(0);
  const tabRefs = useRef([]);
  const lifts = [useSpring(1, LIFT_CFG), useSpring(0, LIFT_CFG), useSpring(0, LIFT_CFG)];

  const select = (b) => {
    const a = selRef.current;
    if (b === a) return;
    selRef.current = b;
    setSelected(b);
    lifts.forEach((l, i) => l.to(i === b ? 1 : 0, LIFT_CFG));

    const list = [];
    if (b > a) {
      // Forward: sheets a … b-1 turn right → left. Right page shows b underneath.
      for (let k = a; k < b; k++) list.push({ fid: ++flipUid, front: k, back: k + 1, dir: 1, delay: (k - a) * STAGGER });
      setBase({ left: a, right: b });
      setFlips(list.reverse()); // the first sheet to turn is on top
      setCrossed([]);
    } else {
      // Backward: sheets a-1 … b turn left → right. Left page shows b underneath.
      for (let k = a - 1; k >= b; k--) list.push({ fid: ++flipUid, front: k, back: k + 1, dir: -1, delay: (a - 1 - k) * STAGGER });
      setBase({ left: b, right: a });
      setFlips(list.reverse());
      setCrossed([]);
    }
  };

  const onFlipDone = (f) => {
    setFlips((list) => list.filter((q) => q.fid !== f.fid));
    // A landed sheet becomes the page it now lies on.
    setBase((bs) => (f.dir > 0 ? { ...bs, left: f.back } : { ...bs, right: f.front }));
  };

  const onKeyDown = (e, i) => {
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % 3;
    else if (e.key === 'ArrowLeft') n = (i + 2) % 3;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = 2;
    if (n === null) return;
    e.preventDefault();
    select(n);
    tabRefs.current[n]?.focus();
  };

  const lv = lifts.map((l) => clamp(l.x, -0.2, 1.2));

  return (
    <>
      <div className="item" aria-hidden="true">
        {/* Static layer: the big desk shadow and cover never repaint while pages turn. */}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <defs>
            <clipPath id="nb-pages-clip">
              <rect x={LEFT.x} y={TOP} width={PW * 2} height={PH} />
            </clipPath>
            <DeskShadow id="nb-shadow" dx={12} dy={16} blur={13} opacity={0.4} contact={0.6} contactBlur={2.2} />
            <pattern id="nb-linen" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#2f4a6b" />
              <path d="M0,1.5 H6 M0,4.5 H6" stroke="#fff" strokeOpacity="0.06" strokeWidth="1" />
              <path d="M1.5,0 V6 M4.5,0 V6" stroke="#000" strokeOpacity="0.1" strokeWidth="1" />
            </pattern>
            <linearGradient id="nb-cover-light" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.28" />
            </linearGradient>
            <linearGradient id="nb-gutter-l" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5a4128" stopOpacity="0" />
              <stop offset="1" stopColor="#5a4128" stopOpacity="0.28" />
            </linearGradient>
            <linearGradient id="nb-gutter-r" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="#5a4128" stopOpacity="0" />
              <stop offset="0.6" stopColor="#5a4128" stopOpacity="0.06" />
              <stop offset="1" stopColor="#5a4128" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id="nb-page-light" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="1" stopColor="#7a5a30" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="nb-cast-r" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3a2410" stopOpacity="0.3" />
              <stop offset="1" stopColor="#3a2410" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="nb-cast-l" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="#3a2410" stopOpacity="0.3" />
              <stop offset="1" stopColor="#3a2410" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="nb-bend-r" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5a4128" stopOpacity="0.15" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="0.85" stopColor="#000" stopOpacity="0.05" />
              <stop offset="1" stopColor="#000" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id="nb-bend-l" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="#5a4128" stopOpacity="0.15" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="0.85" stopColor="#000" stopOpacity="0.05" />
              <stop offset="1" stopColor="#000" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id="nb-ribbon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8e1f1a" />
              <stop offset="0.4" stopColor="#d94a3d" />
              <stop offset="0.6" stopColor="#e8655a" />
              <stop offset="1" stopColor="#9b2620" />
            </linearGradient>
          </defs>

          {/* Desk shadow + cloth hard cover */}
          <g filter="url(#nb-shadow)">
            <rect x="26" y="70" width="848" height="564" rx="12" />
          </g>
          <rect x="26" y="70" width="848" height="564" rx="12" fill="url(#nb-linen)" />
          <rect x="26" y="70" width="848" height="564" rx="12" fill="url(#nb-cover-light)" />
          <rect x="27" y="71" width="846" height="562" rx="11" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="1.5" />
          <rect x={SX - 7} y="70" width="14" height="564" fill="#000" opacity="0.18" />

          {/* Page block thickness: stacked sheet edges on the outer sides */}
          {[6, 4.5, 3, 1.5].map((o) => (
            <g key={o}>
              <rect x={LEFT.x - o} y={TOP + o * 0.6} width={PW} height={PH} fill={o % 3 ? '#e8e0cd' : '#f0e9d8'} stroke="#b4a688" strokeOpacity="0.35" strokeWidth="0.5" />
              <rect x={RIGHT.x + o} y={TOP + o * 0.6} width={PW} height={PH} fill={o % 3 ? '#e8e0cd' : '#f0e9d8'} stroke="#b4a688" strokeOpacity="0.35" strokeWidth="0.5" />
            </g>
          ))}

        </svg>

        {/* Live layer (own compositing layer): pages, turning sheets, tabs. */}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="layer-top">
          <LeftPage i={base.left} />
          <RightPage i={base.right} />
          {/* Stacking: sheets still on their starting side keep their order (first to
              turn on top); once a sheet passes the spine it goes above them, and a
              later-landing sheet lies above an earlier one, like real paper. */}
          {[
            ...flips.filter((f) => !crossed.includes(f.fid)),
            ...crossed.map((id) => flips.find((f) => f.fid === id)).filter(Boolean),
          ].map((f) => (
            <FlipPage
              key={f.fid}
              {...f}
              onDone={() => onFlipDone(f)}
              onCross={() => setCrossed((c) => (c.includes(f.fid) ? c : [...c, f.fid]))}
            />
          ))}

          {/* Lighting, gutter and ribbon sit above the sheets, so a landing sheet
              looks identical to the page that replaces it (no flash). */}
          <rect x={LEFT.x} y={TOP} width={PW * 2} height={PH} fill="url(#nb-page-light)" />
          <Gutter />
          {/* Ribbon bookmark lying along the gutter and hanging off the bottom */}
          <path d={`M${SX + 6},${TOP} C${SX + 14},${TOP + 200} ${SX + 4},${TOP + 420} ${SX + 26},${TOP + PH + 4} L${SX + 34},${TOP + PH + 38} L${SX + 24},${TOP + PH + 30} L${SX + 16},${TOP + PH + 42} L${SX + 12},${TOP + PH + 6} C${SX - 6},${TOP + 420} ${SX + 2},${TOP + 200} ${SX - 4},${TOP} Z`} fill="url(#nb-ribbon)" />

          {[0, 1, 2].map((i) => i !== selected && <Tab key={i} i={i} lift={lv[i]} />)}
          <Tab i={selected} lift={lv[selected]} />
        </svg>
      </div>

      <div className="tablist" role="tablist" aria-label="Notebook Tab">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            ref={(el) => (tabRefs.current[i] = el)}
            type="button"
            role="tab"
            id={`nb-tab-${i}`}
            aria-selected={selected === i}
            aria-controls="nb-panel"
            tabIndex={selected === i ? 0 : -1}
            className="hotspot"
            style={{
              left: `${((TAB_X(i) - 6) / VB_W) * 100}%`,
              top: `${((TOP - TAB_HIGH - 8) / VB_H) * 100}%`,
              width: `${((TAB_W + 12) / VB_W) * 100}%`,
              height: `${((TAB_HIGH + 30) / VB_H) * 100}%`,
            }}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className="sr-only">{t.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="nb-panel" aria-labelledby={`nb-tab-${selected}`} className="sr-only">
        {SR_TEXT[selected]}
      </div>
    </>
  );
}
