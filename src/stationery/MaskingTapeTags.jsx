import { useEffect, useRef, useState } from 'react';
import { useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp } from '../lib/util';
import { DeskShadow } from '../lib/svg';

// A roll of washi / masking tape. Tapping the roll pulls a strip out, tears it
// off and sticks it down right beside the roll as a tag with an ×.
// Each tear uses up tape, so the roll gets visibly thinner.
// Tapping a stuck tag peels it off and the others close the gap.
const WORDS = ['Travel', 'Coffee', 'Design', 'Books', 'Cats', 'Running'];
const STYLES = [
  { bg: '#f1e2bf', print: '#d6b778', ink: '#5e4a26', kind: 'dots' },
  { bg: '#f7d2dc', print: '#e899b0', ink: '#7a3346', kind: 'stripes' },
  { bg: '#cfe8da', print: '#89c2a5', ink: '#2f5e48', kind: 'flowers' },
  { bg: '#cfe0f4', print: '#97b9e2', ink: '#2f4f78', kind: 'grid' },
  { bg: '#f8eaa8', print: '#e0c75e', ink: '#5e4f10', kind: 'dots' },
  { bg: '#e3d8f2', print: '#b8a6de', ink: '#4e3d74', kind: 'stripes' },
];
const MAX = 3; // at most three tags on the desk
const GAP = 12;
const CH = 44; // strip height
const ROLL_R = 80;
const CORE_R = 48;
const CLOSE_W = 30; // space for the × at the right end

const PULL_CFG = { stiffness: 95, damping: 19, precision: 0.01 };
const FLY_CFG = { stiffness: 190, damping: 20, precision: 0.05 };
const ROT_CFG = { stiffness: 140, damping: 12, precision: 0.05 };
const PEEL_CFG = { stiffness: 90, damping: 16, precision: 0.005 };
const SPIN_CFG = { stiffness: 220, damping: 10, precision: 0.05 };
const SHRINK_CFG = { stiffness: 160, damping: 18, precision: 0.05 };
const SHRINK_PER_TEAR = 4; // tape thickness used per strip
const MIN_R = CORE_R + 9;

const stripWidth = (word) => Math.round(word.length * 13 + 24 + CLOSE_W);

/** Strip outline with ragged, hand-torn ends. */
function tornPath(w, h) {
  const l = -w / 2;
  const r = w / 2;
  const top = -h / 2;
  const n = 7;
  let d = `M${l + 3},${top} L${r - 3},${top}`;
  for (let i = 1; i <= n; i++) d += ` L${r - (i % 2 ? Math.random() * 6 : Math.random() * 2)},${top + (h * i) / n}`;
  d += ` L${l + 3},${-top}`;
  for (let i = n - 1; i >= 0; i--) d += ` L${l + (i % 2 ? Math.random() * 6 : Math.random() * 2)},${top + (h * i) / n}`;
  return `${d} Z`;
}

function PrintPatterns() {
  return STYLES.map((s, i) => (
    <pattern key={i} id={`tag-print-${i}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform={s.kind === 'stripes' ? 'rotate(40)' : undefined}>
      {s.kind === 'dots' && (
        <>
          <circle cx="3" cy="3" r="1.6" fill={s.print} />
          <circle cx="9" cy="9" r="1.6" fill={s.print} />
        </>
      )}
      {s.kind === 'stripes' && <rect x="0" y="0" width="4" height="12" fill={s.print} />}
      {s.kind === 'grid' && <path d="M0,0.5 H12 M0.5,0 V12" stroke={s.print} strokeWidth="1" />}
      {s.kind === 'flowers' && (
        <g fill={s.print}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={6 + Math.cos((a * Math.PI) / 180) * 2.2} cy={6 + Math.sin((a * Math.PI) / 180) * 2.2} r="1.3" />
          ))}
        </g>
      )}
    </pattern>
  ));
}

function TapeStrip({ chip, tx, ty, onRemove, onRemoved }) {
  const w = chip.w;
  const anchor = chip.anchor;
  // Pull-out start: the strip slides out leftwards from under the roll.
  const pullX = (p) => anchor[0] + w / 2 - p * w;
  const pull = useSpring(0, PULL_CFG);
  // Preset tags start already stuck in place.
  const x = useSpring(chip.preset ? tx : pullX(1), FLY_CFG);
  const y = useSpring(chip.preset ? ty : anchor[1], FLY_CFG);
  const r = useSpring(chip.preset ? chip.rot : -3, ROT_CFG);
  const landedInit = chip.preset;
  const peel = useSpring(0, PEEL_CFG);
  const [phase, setPhase] = useState(chip.preset ? 'fly' : 'pull'); // pull → fly/stuck
  const landed = useRef(landedInit);
  const st = STYLES[chip.style];

  useEffect(() => {
    if (chip.preset) return;
    sfx.tapePeel();
    pull.to(1, PULL_CFG, () => {
      // Torn off: now it flies to its place beside the roll.
      sfx.tapeTear();
      setPhase('fly');
    });
  }, []);
  useEffect(() => {
    if (phase === 'pull' || chip.removing) return;
    r.to(chip.rot, ROT_CFG);
    x.to(tx, FLY_CFG);
    y.to(ty, FLY_CFG, () => {
      if (!landed.current) {
        landed.current = true;
        sfx.tapeStick();
      }
    });
  }, [phase, tx, ty]);
  useEffect(() => {
    if (!chip.removing) return;
    sfx.tapePeel();
    peel.to(1, PEEL_CFG, onRemoved);
  }, [chip.removing]);

  const pulling = phase === 'pull';
  const X = pulling ? pullX(clamp(pull.x, 0, 1.05)) : x.x;
  const Y = pulling ? anchor[1] : y.x;
  const dist = pulling ? 0 : Math.hypot(tx - x.x, ty - y.x);
  const lift = clamp(dist / 200, 0, 1);
  // Peel off: one end lifts first, then the strip is pulled away.
  const pp = clamp(peel.x, 0, 1);
  const p1 = clamp(pp / 0.4, 0, 1);
  const p2 = clamp((pp - 0.4) / 0.6, 0, 1);
  const raise = Math.max(lift, p1 * 0.6 + p2);

  const onKey = (e) => {
    if (['Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) {
      e.preventDefault();
      onRemove();
    }
  };

  return (
    <g clipPath={pulling ? `url(#tag-out-of-roll-${chip.id})` : undefined}>
      {pulling && (
        <clipPath id={`tag-out-of-roll-${chip.id}`}>
          <rect x="-400" y="-400" width={anchor[0] + 400} height="2000" />
        </clipPath>
      )}
      <g
        className="hit chip"
        role="button"
        tabIndex={chip.removing || pulling ? -1 : 0}
        aria-label={`Remove tag ${chip.word}`}
        onClick={chip.removing || pulling ? undefined : onRemove}
        onKeyDown={onKey}
        opacity={1 - p2}
        transform={`translate(${X + 80 * p2} ${Y - 180 * p2}) rotate(${r.x}) rotate(${-16 * p1 - 30 * p2} ${-w / 2} 0) scale(${1 + 0.12 * raise})`}
      >
        <path d={chip.path} fill="#3a2410" opacity={0.14 + 0.08 * raise} transform={`translate(${2 + 12 * raise} ${3 + 16 * raise})`} />
        <path d={chip.path} fill={st.bg} opacity="0.94" />
        <path d={chip.path} fill={`url(#tag-print-${chip.style})`} opacity="0.5" />
        <path d={chip.path} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
        <text x={-w / 2 + 14} y="8" className="tag-text" fill={st.ink}>
          {chip.word}
        </text>
        {/* × close mark (no ring) */}
        <g transform={`translate(${w / 2 - CLOSE_W / 2 - 2} 0)`} stroke={st.ink} strokeWidth="1.8" strokeLinecap="round" opacity="0.8">
          <line x1="-3.6" y1="-3.6" x2="3.6" y2="3.6" />
          <line x1="3.6" y1="-3.6" x2="-3.6" y2="3.6" />
        </g>
      </g>
    </g>
  );
}

let uid = 0;

const PRESET = 1; // one tag already on the desk when the page opens

export default function MaskingTapeTags({ vbW = 500, vbH = 440, roll = [140, 340], area = [20, 40, 400] }) {
  const [chips, setChips] = useState(() =>
    WORDS.slice(0, PRESET).map((word, i) => {
      const w = stripWidth(word);
      return { id: ++uid, word, anchor: [0, 0], style: (i * 5 + 1) % STYLES.length, w, rot: [-4, 3, -2][i], path: tornPath(w, CH), removing: false, preset: true };
    }),
  );
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const nextIdx = useRef(PRESET);
  const spin = useSpring(0, SPIN_CFG);
  const radius = useSpring(ROLL_R - PRESET * SHRINK_PER_TEAR, SHRINK_CFG);
  const torn = useRef(PRESET);
  const [rx, ry] = roll;
  const R = radius.x;

  const tear = () => {
    const full = chipsRef.current.filter((c) => !c.removing).length >= MAX;
    if (full) {
      spin.kick(-120);
      sfx.tapeTear(false);
      return; // the row is full: nothing more is stuck down
    }
    spin.kick(-420); // the roll turns as the strip unrolls
    // Strips come off the top of the roll; anything right of anchor x is hidden under it.
    const r0 = radius.target;
    const anchor = [rx - r0 * 0.64, ry - r0 + CH / 2 + 2];
    torn.current += 1;
    radius.to(Math.max(MIN_R, ROLL_R - torn.current * SHRINK_PER_TEAR), SHRINK_CFG);
    const i = nextIdx.current++;
    const word = WORDS[i % WORDS.length];
    const w = stripWidth(word);
    const chip = { id: ++uid, word, anchor, style: (i * 5 + 1) % STYLES.length, w, rot: (Math.random() - 0.5) * 8, path: tornPath(w, CH), removing: false };
    setChips((cs) => [...cs, chip]);
  };
  const remove = (id) => setChips((cs) => cs.map((c) => (c.id === id ? { ...c, removing: true } : c)));
  const removed = (id) => setChips((cs) => cs.filter((c) => c.id !== id));

  // Slots beside the roll: each line is right-aligned to the area's right edge
  // (next to the roll), wrapping onto further lines.
  const slots = {};
  const [ax, ay, aw] = area;
  const lines = [[]];
  let used = 0;
  for (const c of chips) {
    if (c.removing) continue;
    if (used + c.w > aw && lines[lines.length - 1].length) {
      lines.push([]);
      used = 0;
    }
    lines[lines.length - 1].push(c);
    used += c.w + GAP;
  }
  lines.forEach((line, li) => {
    const total = line.reduce((sum, c) => sum + c.w, 0) + GAP * Math.max(0, line.length - 1);
    let cx = ax + aw - total;
    for (const c of line) {
      slots[c.id] = [cx + c.w / 2, ay + li * (CH + 12) + CH / 2];
      cx += c.w + GAP;
    }
  });
  const nextStyleIdx = (nextIdx.current * 5 + 1) % STYLES.length;
  const nextStyle = STYLES[nextStyleIdx];
  const ring = `M${-R},0 a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0 Z M${-CORE_R},0 a${CORE_R},${CORE_R} 0 1,1 ${CORE_R * 2},0 a${CORE_R},${CORE_R} 0 1,1 ${-CORE_R * 2},0 Z`;
  const activeCount = chips.filter((c) => !c.removing).length;

  return (
    <div className="item" role="group" aria-label={`Masking tape Tag, ${activeCount} tags`}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`}>
        <defs>
          <DeskShadow id="tag-roll-shadow" dx={9} dy={12} blur={8} opacity={0.4} contact={0.55} contactBlur={1.6} />
          <PrintPatterns />
          <radialGradient id="tag-roll-shade" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="0.8" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#5a3d1c" stopOpacity="0.25" />
          </radialGradient>
        </defs>

        {/* The roll */}
        <g
          className="hit"
          role="button"
          tabIndex={0}
          aria-label="Tear off a tag"
          transform={`translate(${rx} ${ry}) rotate(${spin.x * 0.12})`}
          onClick={tear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              tear();
            }
          }}
        >
          <g filter="url(#tag-roll-shadow)">
            <path d={ring} fillRule="evenodd" />
          </g>
          <path d={ring} fillRule="evenodd" fill={nextStyle.bg} opacity="0.92" />
          <path d={ring} fillRule="evenodd" fill={`url(#tag-print-${nextStyleIdx})`} opacity="0.45" />
          {[54, 59, 64, 69, 74, 79].filter((rr) => rr < R - 1).map((rr) => (
            <circle key={rr} r={rr} fill="none" stroke="#6b4a24" strokeOpacity="0.09" strokeWidth="1" />
          ))}
          <path d={ring} fillRule="evenodd" fill="url(#tag-roll-shade)" />
          <circle r={CORE_R + 3} fill="none" stroke="#c49b67" strokeWidth="7" />
          <circle r={CORE_R} fill="none" stroke="#8a6237" strokeOpacity="0.6" strokeWidth="1.2" />
          {/* Loose end lifting off the roll */}
          <g transform={`rotate(-38) translate(0 ${-R + 1})`}>
            <path d="M0,0 L34,-2 L37,4 L33,9 L37,14 L34,19 L0,19 Z" fill={nextStyle.bg} opacity="0.92" />
            <path d="M0,0 L34,-2 L37,4 L33,9 L37,14 L34,19 L0,19 Z" fill={`url(#tag-print-${nextStyleIdx})`} opacity="0.45" />
          </g>
          <circle r={ROLL_R + 6} fill="transparent" />
        </g>

        {chips.map((c) => {
          const slot = slots[c.id] || [ax, ay];
          return <TapeStrip key={c.id} chip={c} tx={slot[0]} ty={slot[1]} onRemove={() => remove(c.id)} onRemoved={() => removed(c.id)} />;
        })}
      </svg>
    </div>
  );
}
