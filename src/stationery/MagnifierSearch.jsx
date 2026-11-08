import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, svgPoint, capture } from '../lib/util';
import { CHROME, CylinderGradient, DeskShadow } from '../lib/svg';

// A newspaper clipping printed in small type and a magnifying glass (viewBox 640 x 480).
// Drag the glass over the slip to read it; the hidden sentence lights up like a
// search hit when the lens finds it.
const VB_W = 640;
const VB_H = 480;
const NOTE = { x: 30, y: 36, w: 380, h: 350, rot: -4 };
const LENS_R = 98;
const ZOOM = 3.3;
const EDGE_ZOOM = 2.7; // the rim magnifies a little less → curved-glass distortion
const HANDLE_ANGLE = 40;
const FS = 8; // body font size
const LH = 12.8;

const BODY = [
  'At three o\u2019clock the sun slid in through the window and lay across',
  'the wooden desk. Dust turned slowly in the light, and I decided to',
  'write down what every object on this desk did today.',
  'The tape measure says it measured twelve things. Its longest pull',
  'reached ten centimetres before it snapped back with a loud clack.',
  'The stapler is proud: it counts every staple, and the little red',
  'badge on its arm keeps climbing. The notebook flips between To-do,',
  'Sketch and Notes, and its three tabs take turns standing tallest.',
  'The pen clicks and clicks; its green window blinks like a signal.',
  'The tape roll waits quietly for someone to tear off a word.',
  'The sharpener hates to be rushed: a good point takes patience.',
  'The magnifier is always looking for things \u2014 a lost eraser, tiny',
  null, // the line with the hidden sentence
  'Now put the glass back where it was and pretend nothing happened.',
  'P.S. The coffee is cold, the cat is asleep, and the run is moved',
  'to tomorrow. If you read this far, you have very good eyes.',
];
const HIDDEN = { before: 'print, and one hidden sentence. Psst \u2014 ', phrase: 'you found me', after: '! Well spotted.' };

/** The printed slip, in its own (unrotated) coordinates. */
function NoteContent({ hit, box, phraseRef }) {
  const { w, h } = NOTE;
  const top = 82;
  return (
    <g>
      <path
        d={`M2,1 L${w * 0.3},0 L${w * 0.6},2 L${w - 1},0 L${w},${h * 0.4} L${w - 2},${h} L${w * 0.5},${h - 1} L0,${h} L1,${h * 0.5} Z`}
        fill="#fbf7ec"
      />
      <path d={`M2,1 L${w * 0.3},0 L${w * 0.6},2 L${w - 1},0 L${w},${h * 0.4} L${w - 2},${h} L${w * 0.5},${h - 1} L0,${h} L1,${h * 0.5} Z`} fill="none" stroke="#c9bda5" strokeWidth="0.6" />
      <text x={w / 2} y="32" textAnchor="middle" className="note-title">
        A Quiet Afternoon on the Desk
      </text>
      <text x={w / 2} y="51" textAnchor="middle" className="note-text" fill="#8a8172">
        Saturday, 7 November 2026 · Sunny · 3:15 pm
      </text>
      <line x1="16" x2={w - 16} y1="62" y2="62" stroke="#5d564d" strokeOpacity="0.5" strokeWidth="0.6" />
      {box && <rect x={box.x - 1.5} y={box.y - 1} width={box.width + 3} height={box.height + 2} rx="1.5" fill="#ffe25e" opacity={0.9 * hit} />}
      {BODY.map((line, i) =>
        line ? (
          <text key={i} x="16" y={top + i * LH} className="note-text">
            {line}
          </text>
        ) : (
          <text key={i} x="16" y={top + i * LH} className="note-text">
            {HIDDEN.before}
            <tspan ref={phraseRef}>{HIDDEN.phrase}</tspan>
            {HIDDEN.after}
          </text>
        ),
      )}
      <text x={w / 2} y={h - 12} textAnchor="middle" className="note-text" fill="#9a907f">
        — Page 7 · The Desk Gazette —
      </text>
    </g>
  );
}

const NOTE_T = `translate(${NOTE.x} ${NOTE.y}) rotate(${NOTE.rot} ${NOTE.w / 2} ${NOTE.h / 2})`;

/** Item coordinates → slip coordinates (inverse of NOTE_T). */
function toNote(px, py) {
  const a = (-NOTE.rot * Math.PI) / 180;
  const dx = px - NOTE.x - NOTE.w / 2;
  const dy = py - NOTE.y - NOTE.h / 2;
  return [NOTE.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), NOTE.h / 2 + dx * Math.sin(a) + dy * Math.cos(a)];
}

const FOLLOW_CFG = { stiffness: 650, damping: 36, precision: 0.05 };
const HIT_CFG = { stiffness: 300, damping: 24, precision: 0.005 };

export default function MagnifierSearch() {
  const svgRef = useRef(null);
  const phraseRef = useRef(null);
  const [box, setBox] = useState(null);
  const lx = useSpring(NOTE.x + NOTE.w - 4, FOLLOW_CFG);
  const ly = useSpring(NOTE.y + 26, FOLLOW_CFG);
  const hit = useSpring(0, HIT_CFG);
  const drag = useRef(null);

  // Measure where the hidden phrase was laid out (after web fonts settle).
  useLayoutEffect(() => {
    const measure = () => {
      try {
        const b = phraseRef.current?.getBBox();
        if (b && b.width) setBox({ x: b.x, y: b.y, width: b.width, height: b.height });
      } catch {
        /* not rendered yet */
      }
    };
    measure();
    document.fonts?.ready.then(measure);
  }, []);

  // Search hit: the lens centre is over the phrase.
  let found = false;
  if (box) {
    const [nx, ny] = toNote(lx.x, ly.x);
    found = Math.abs(nx - (box.x + box.width / 2)) < box.width * 0.42 && Math.abs(ny - (box.y + box.height / 2)) < 9;
  }
  useEffect(() => {
    hit.to(found ? 1 : 0, HIT_CFG);
    if (found) sfx.ding(true);
  }, [found]);

  const moveTo = (x, y) => {
    lx.to(clamp(x, 24, VB_W - 24), FOLLOW_CFG);
    ly.to(clamp(y, 24, VB_H - 24), FOLLOW_CFG);
  };
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capture(e);
    const p = svgPoint(svgRef.current, e);
    drag.current = { id: e.pointerId, dx: p.x - lx.target, dy: p.y - ly.target };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = svgPoint(svgRef.current, e);
    moveTo(p.x - d.dx, p.y - d.dy);
  };
  const onPointerUp = (e) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 3 : 10;
    const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!m) return;
    e.preventDefault();
    moveTo(lx.target + m[0], ly.target + m[1]);
  };

  const cx = lx.x;
  const cy = ly.x;
  const h = clamp(hit.x, 0, 1);
  const zoomT = (z) => `translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})`;
  const ringD = `M${cx - LENS_R},${cy} a${LENS_R},${LENS_R} 0 1,0 ${LENS_R * 2},0 a${LENS_R},${LENS_R} 0 1,0 ${-LENS_R * 2},0 Z`;
  const edgeR = LENS_R * 0.8;
  const annulus = `${ringD} M${cx - edgeR},${cy} a${edgeR},${edgeR} 0 1,1 ${edgeR * 2},0 a${edgeR},${edgeR} 0 1,1 ${-edgeR * 2},0 Z`;
  const handle = (
    <>
      <rect x={LENS_R + 4} y="-9" width="30" height="18" rx="3" />
      <rect x={LENS_R + 30} y="-14" width="148" height="28" rx="14" />
    </>
  );

  return (
    <div
      className="item passthrough"
      role="application"
      tabIndex={0}
      aria-label={found ? 'Magnifier Search: found “you found me”' : 'Magnifier Search, move the lens with the arrow keys to read the tiny print'}
      onKeyDown={onKeyDown}
    >
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
        <defs>
          <DeskShadow id="mg-note-shadow" dx={4} dy={5} blur={4} opacity={0.3} contact={0.3} contactBlur={1} />
          <DeskShadow id="mg-shadow" dx={20} dy={26} blur={10} opacity={0.42} contact={0} />
          <clipPath id="mg-lens-clip">
            <circle cx={cx} cy={cy} r={LENS_R - 3} />
          </clipPath>
          <clipPath id="mg-edge-clip">
            <path d={annulus} fillRule="evenodd" clipRule="evenodd" />
          </clipPath>
          <radialGradient id="mg-glass" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.6" stopColor="#dff0ff" stopOpacity="0" />
            <stop offset="0.88" stopColor="#9fc3e0" stopOpacity="0.16" />
            <stop offset="1" stopColor="#30475e" stopOpacity="0.4" />
          </radialGradient>
          <CylinderGradient id="mg-rim" stops={[[0, '#55595f'], [0.2, '#e4e7ea'], [0.45, '#2c2f34'], [1, '#141518']]} />
          <CylinderGradient id="mg-chrome" stops={CHROME} />
          <CylinderGradient id="mg-grip" stops={[[0, '#3a2414'], [0.18, '#a8744a'], [0.35, '#6d4426'], [0.8, '#3d2513'], [1, '#2a180c']]} />
        </defs>

        {/* The slip */}
        <g filter="url(#mg-note-shadow)">
          <rect x={NOTE.x} y={NOTE.y} width={NOTE.w} height={NOTE.h} transform={`rotate(${NOTE.rot} ${NOTE.x + NOTE.w / 2} ${NOTE.y + NOTE.h / 2})`} />
        </g>
        <g transform={NOTE_T}>
          <NoteContent hit={h} box={box} phraseRef={phraseRef} />
        </g>

        {/* Raised glass casts a soft shadow of its frame and handle */}
        <g filter="url(#mg-shadow)">
          <circle cx={cx} cy={cy} r={LENS_R} fill="none" stroke="#000" strokeWidth="10" />
          <g transform={`translate(${cx} ${cy}) rotate(${HANDLE_ANGLE})`}>{handle}</g>
        </g>

        <g
          className="hit"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Magnified view through the glass */}
          {/* Backdrop: magnified desk, so the unmagnified slip never shows through the glass */}
          <circle cx={cx} cy={cy} r={LENS_R - 2} fill="#d8bb90" />
          <g clipPath="url(#mg-lens-clip)">
            <g transform={zoomT(ZOOM)}>
              <g transform={NOTE_T}>
                <NoteContent hit={h} box={box} />
              </g>
            </g>
          </g>
          <g clipPath="url(#mg-edge-clip)">
            <g transform={zoomT(EDGE_ZOOM)}>
              <g transform={NOTE_T}>
                <NoteContent hit={h} box={box} />
              </g>
            </g>
          </g>
          {/* Glass: edge tint, highlight */}
          <circle cx={cx} cy={cy} r={LENS_R - 3} fill="url(#mg-glass)" />
          <path
            d={`M${cx - LENS_R * 0.72},${cy - LENS_R * 0.2} A${LENS_R * 0.75},${LENS_R * 0.75} 0 0 1 ${cx - LENS_R * 0.1},${cy - LENS_R * 0.72}`}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.75"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx={cx + LENS_R * 0.42} cy={cy + LENS_R * 0.45} r="4" fill="#fff" opacity="0.35" />

          {/* Frame */}
          <circle cx={cx} cy={cy} r={LENS_R} fill="none" stroke="url(#mg-rim)" strokeWidth="10" />
          <circle cx={cx} cy={cy} r={LENS_R - 5} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />

          {/* Handle with a printed search icon */}
          <g transform={`translate(${cx} ${cy}) rotate(${HANDLE_ANGLE})`}>
            <rect x={LENS_R + 4} y="-9" width="30" height="18" rx="3" fill="url(#mg-chrome)" />
            <rect x={LENS_R + 30} y="-14" width="148" height="28" rx="14" fill="url(#mg-grip)" />
            <rect x={LENS_R + 30} y="-14" width="6" height="28" fill="url(#mg-chrome)" />
            <g transform={`translate(${LENS_R + 110} 0) rotate(${-HANDLE_ANGLE})`} stroke="#f6eddc" strokeWidth="2" fill="none" strokeLinecap="round">
              <circle cx="-2" cy="-2" r="5.5" />
              <line x1="2" y1="2" x2="7.5" y2="7.5" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
