import { useEffect, useRef, useState } from 'react';
import { addTick, useSpring } from '../lib/spring';
import { sfx } from '../lib/audio';
import { clamp, svgPoint, capture } from '../lib/util';
import { CHROME, CylinderGradient, DeskShadow } from '../lib/svg';

// A pocket tape measure seen from above (viewBox 600 x 300). The pulled-out
// blade is the slider's filled track, the steel hook is the thumb.
// The scale starts at 0 by the exit and grows outward.
const VB_W = 600;
const VB_H = 300;
const TY = 210; // blade centre line
const TH = 34; // blade width
const HOOK0 = 210; // hook position at 0 cm (right at the exit)
const PX = 34; // svg units per centimetre
const MAX = 10;
const ACCEL = 130; // rewind acceleration, cm/s²
const START = 4; // starts pulled out a little so it reads as a slider

const LEN_CFG = { stiffness: 700, damping: 30, precision: 0.002 };
const BOUNCE_CFG = { stiffness: 900, damping: 16, precision: 0.002 };
const BUBBLE_CFG = { stiffness: 520, damping: 24, precision: 0.002 };
const LOCK_CFG = { stiffness: 900, damping: 30, precision: 0.002 };
const JOLT_CFG = { stiffness: 650, damping: 14, precision: 0.02 };

/** Printed scale, fixed relative to the exit: 0, 1, 2 … outward. */
function Scale({ hookX }) {
  const els = [];
  for (let m = 0; m <= MAX * 10; m++) {
    const x = HOOK0 + (m / 10) * PX;
    if (x > hookX - 1) break;
    const cm = m % 10 === 0;
    const half = m % 5 === 0;
    const len = cm ? 15 : half ? 10 : 6;
    const top = TY - TH / 2;
    els.push(
      <line key={m} x1={x} x2={x} y1={top} y2={top + len} stroke="#16130e" strokeWidth={cm ? 1.4 : half ? 1 : 0.7} />,
      <line key={`b${m}`} x1={x} x2={x} y1={TY + TH / 2} y2={TY + TH / 2 - (cm ? 6 : half ? 4 : 2.5)} stroke="#16130e" strokeWidth={cm ? 1.2 : 0.6} />,
    );
    if (cm && m > 0) {
      els.push(
        <text key={`n${m}`} x={x + 3} y={TY + 9} className={m === 100 ? 'tm-num red' : 'tm-num'}>
          {m / 10}
        </text>,
      );
    }
  }
  return els;
}

export default function TapeMeasureSlider() {
  const [value, setValue] = useState(START);
  const valueRef = useRef(START);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const retracting = useRef(false);
  const hideTimer = useRef(0);

  const len = useSpring(START, LEN_CFG);
  const bubble = useSpring(1, BUBBLE_CFG);
  const lock = useSpring(0, LOCK_CFG);
  const jolt = useSpring(0, JOLT_CFG);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const showBubble = () => {
    clearTimeout(hideTimer.current);
    bubble.to(1, BUBBLE_CFG);
  };
  const hideBubbleSoon = (ms = 1200) => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      // The bubble stays while the tape is out; it only hides at zero.
      if (valueRef.current === 0) bubble.to(0, BUBBLE_CFG);
    }, ms);
  };

  const setCm = (v) => {
    const next = clamp(v, 0, MAX);
    if (next === valueRef.current) return;
    valueRef.current = next;
    setValue(next);
    len.to(next, LEN_CFG);
    sfx.tick();
  };

  // Unlock → the blade whips back in with accelerating speed, then slams home.
  const retract = () => {
    if (retracting.current) return;
    lock.to(1, LOCK_CFG);
    sfx.lockClick();
    if (len.x < 0.05) {
      setTimeout(() => lock.to(0, LOCK_CFG), 160);
      return;
    }
    retracting.current = true;
    drag.current = null;
    showBubble();
    const start = len.x;
    sfx.whoosh(Math.sqrt((2 * start) / ACCEL));
    let x = start;
    let v = 0;
    len.stop();
    addTick((dt) => {
      v += ACCEL * dt;
      x -= v * dt;
      if (x <= 0) {
        len.set(0);
        len.to(0, BOUNCE_CFG);
        len.kick(Math.min(6, v * 0.25));
        jolt.kick(-170);
        valueRef.current = 0;
        setValue(0);
        sfx.snap();
        setTimeout(() => {
          lock.to(0, LOCK_CFG);
          sfx.lockClick();
          retracting.current = false;
        }, 260);
        hideBubbleSoon(650);
        return false;
      }
      len.set(x);
      const r = Math.round(x);
      if (r !== valueRef.current) {
        valueRef.current = r;
        setValue(r);
      }
      return true;
    });
  };

  const onPointerDown = (e) => {
    if (retracting.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capture(e);
    drag.current = { id: e.pointerId, x0: svgPoint(svgRef.current, e).x, v0: valueRef.current };
    showBubble();
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setCm(Math.round(d.v0 + (svgPoint(svgRef.current, e).x - d.x0) / PX));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    hideBubbleSoon();
  };

  const onKeyDown = (e) => {
    if (retracting.current) return;
    const v = valueRef.current;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = v + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = v - 1;
    else if (e.key === 'PageUp') next = v + 3;
    else if (e.key === 'PageDown') next = v - 3;
    else if (e.key === 'End') next = MAX;
    else if (e.key === 'Home' || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      retract();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    showBubble();
    setCm(next);
    hideBubbleSoon();
  };

  const hookX = HOOK0 + Math.max(0, len.x) * PX;
  const b = clamp(bubble.x, 0, 1.2);
  const lk = clamp(lock.x, 0, 1);
  const bladeW = hookX - 196;

  return (
    <>
      <div
        className="item"
        role="slider"
        aria-label="卷尺 Slider"
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} 厘米`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
          <defs>
            <DeskShadow id="tm-shadow" dx={12} dy={16} blur={11} opacity={0.42} contact={0.6} contactBlur={2} />
            <DeskShadow id="tm-flat" dx={2.5} dy={3.5} blur={3} opacity={0.35} contact={0.35} contactBlur={1} />
            <DeskShadow id="tm-bubble-shadow" dx={2} dy={4} blur={5} opacity={0.35} contact={0.15} />
            <linearGradient id="tm-shell" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5d646d" />
              <stop offset="0.45" stopColor="#353a41" />
              <stop offset="1" stopColor="#1c1f23" />
            </linearGradient>
            <linearGradient id="tm-face" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd34d" />
              <stop offset="0.55" stopColor="#f0b20f" />
              <stop offset="1" stopColor="#c98d00" />
            </linearGradient>
            <radialGradient id="tm-badge" cx="0.35" cy="0.3" r="0.85">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#c4c9cf" />
              <stop offset="1" stopColor="#6e757d" />
            </radialGradient>
            <linearGradient id="tm-blade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff2a6" />
              <stop offset="0.18" stopColor="#ffdd45" />
              <stop offset="0.6" stopColor="#f6cb25" />
              <stop offset="1" stopColor="#d9a90f" />
            </linearGradient>
            <CylinderGradient id="tm-chrome" stops={CHROME} />
            <CylinderGradient id="tm-lock" stops={[[0, '#ff8a6b'], [0.3, '#e4472c'], [1, '#9c2414']]} />
            <clipPath id="tm-blade-clip">
              <rect x="196" y={TY - TH} width={Math.max(0, bladeW)} height={TH * 2} />
            </clipPath>
          </defs>

          <g transform={`translate(${jolt.x} 0)`}>
            {/* Shadows */}
            <g filter="url(#tm-shadow)">
              <rect x="20" y="50" width="184" height="184" rx="46" />
              <rect x="126" y="34" width="54" height="22" rx="6" />
            </g>
            <g filter="url(#tm-flat)">
              <rect x="196" y={TY - TH / 2} width={Math.max(0, bladeW)} height={TH} />
              <rect x={hookX - 26} y={TY - 18} width="36" height="36" />
              <rect x={hookX} y={TY - 25} width="9" height="50" rx="2" />
            </g>

            {/* Blade = filled track */}
            <g
              className="hit"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <rect x="190" y={TY - 52} width={hookX - 150} height="104" fill="transparent" />
              <g clipPath="url(#tm-blade-clip)">
                <rect x="196" y={TY - TH / 2} width={bladeW} height={TH} fill="url(#tm-blade)" />
                <Scale hookX={hookX - 20} />
              </g>

              {/* Hook = thumb: riveted plate + bent lip */}
              <rect x={hookX - 26} y={TY - 18} width="28" height="36" rx="3" fill="url(#tm-chrome)" />
              <circle cx={hookX - 17} cy={TY - 8} r="3" fill="#7d838a" />
              <circle cx={hookX - 17.6} cy={TY - 8.6} r="1.2" fill="#fff" />
              <circle cx={hookX - 17} cy={TY + 8} r="3" fill="#7d838a" />
              <circle cx={hookX - 17.6} cy={TY + 7.4} r="1.2" fill="#fff" />
              <rect x={hookX} y={TY - 25} width="9" height="50" rx="2.5" fill="url(#tm-chrome)" stroke="#59606a" strokeOpacity="0.6" strokeWidth="0.8" />
            </g>

            {/* Lock button on the top edge: slides back to release */}
            <g style={{ pointerEvents: 'none' }}>
            <rect x="122" y="40" width="64" height="16" rx="5" fill="#16181b" />
            <g transform={`translate(${-14 * lk} 0)`}>
              <rect x="134" y="33" width="44" height="22" rx="6" fill="url(#tm-lock)" />
              {[143, 151, 159, 167].map((lx) => (
                <line key={lx} x1={lx} x2={lx} y1="37" y2="50" stroke="#6e1a0d" strokeOpacity="0.5" strokeWidth="1.6" />
              ))}
            </g>

            {/* Case: rubber shell + yellow face plate + chrome badge */}
            <rect x="20" y="50" width="184" height="184" rx="46" fill="url(#tm-shell)" />
            <path d="M38,82 Q52,58 86,56" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" />
            <rect x="38" y="68" width="148" height="148" rx="34" fill="url(#tm-face)" />
            <rect x="38" y="68" width="148" height="148" rx="34" fill="none" stroke="#7a5600" strokeOpacity="0.35" />
            <path d="M50,96 Q58,76 84,72" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
            <circle cx="112" cy="142" r="44" fill="url(#tm-badge)" />
            <circle cx="112" cy="142" r="34" fill="#2b2f35" />
            <circle cx="112" cy="142" r="34" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="2" />
            <text x="112" y="141" textAnchor="middle" className="tm-brand">
              10 cm
            </text>
            <text x="112" y="157" textAnchor="middle" className="tm-brand small">
              STEEL TAPE
            </text>
            {/* Blade exit */}
            <rect x="192" y={TY - TH / 2 - 5} width="14" height={TH + 10} rx="4" fill="#121417" />
            <rect x="205" y={TY - TH / 2 - 3} width="3" height={TH + 6} rx="1.5" fill="url(#tm-chrome)" />
            </g>
          </g>

          {/* Value bubble (white tooltip) above the hook */}
          <g transform={`translate(${hookX + 4 + jolt.x} ${TY - 30}) scale(${b})`} opacity={clamp(b, 0, 1)} style={{ pointerEvents: 'none' }}>
            <g filter="url(#tm-bubble-shadow)">
              <rect x="-38" y="-44" width="76" height="36" rx="11" fill="#fff" />
              <path d="M-8,-9 L0,0 L8,-9 Z" fill="#fff" />
            </g>
            <rect x="-38" y="-44" width="76" height="36" rx="11" fill="#fff" />
            <path d="M-8,-9 L0,0 L8,-9 Z" fill="#fff" />
            <text x="0" y="-20" textAnchor="middle" className="tm-bubble">
              {value} cm
            </text>
          </g>
        </svg>
      </div>
      <button
        type="button"
        className="hotspot"
        style={{ left: '3%', top: '10%', width: '29%', height: '68%' }}
        aria-label="松开卷尺锁扣，收回归零"
        onPointerDown={() => !retracting.current && lock.to(0.6, LOCK_CFG)}
        onPointerLeave={() => !retracting.current && lock.to(0, LOCK_CFG)}
        onClick={retract}
      />
    </>
  );
}
