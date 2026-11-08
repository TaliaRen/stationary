import { useEffect, useReducer, useRef } from 'react';

// ---------------------------------------------------------------------------
// Shared requestAnimationFrame ticker. Every animation in the app runs on one
// loop, which stops itself when nothing is moving.
// ---------------------------------------------------------------------------
const subscribers = new Set();
let rafId = 0;
let lastTime = 0;

function loop(now) {
  // Clamp dt so a backgrounded tab doesn't explode the physics on return.
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  for (const fn of Array.from(subscribers)) {
    if (fn(dt) === false) subscribers.delete(fn);
  }
  rafId = subscribers.size ? requestAnimationFrame(loop) : 0;
}

/** Register a per-frame callback. Return `false` from it to unsubscribe. */
export function addTick(fn) {
  subscribers.add(fn);
  if (!rafId) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Damped harmonic spring, integrated with small fixed sub-steps so stiff
// springs stay stable at any frame rate.
// ---------------------------------------------------------------------------
const SUBSTEP = 1 / 240;

export class Spring {
  constructor(value, { stiffness = 300, damping = 26, mass = 1, precision = 0.001 } = {}) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.cfg = { stiffness, damping, mass, precision };
    this.listeners = new Set();
    this.running = false;
    this.onRest = null;
    this._remove = null;
    this._tick = this._tick.bind(this);
  }

  /** Listen to value changes. Returns an unsubscribe function. */
  listen(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Animate towards `target`, optionally with a one-off config and rest callback. */
  to(target, cfg, onRest) {
    this.target = target;
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    this.onRest = onRest || null;
    this._start();
  }

  /** Jump immediately (used while a finger is dragging). */
  set(x) {
    this.x = x;
    this.target = x;
    this.v = 0;
    this._emit();
  }

  /** Add velocity, e.g. for an impact bounce. */
  kick(velocity) {
    this.v += velocity;
    this._start();
  }

  stop() {
    this.running = false;
    if (this._remove) this._remove();
    this._remove = null;
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this._remove = addTick(this._tick);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.x);
  }

  _tick(dt) {
    if (!this.running) return false;
    const { stiffness: k, damping: c, mass: m, precision } = this.cfg;
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (-k * (this.x - this.target) - c * this.v) / m;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.v) < precision * 20 && Math.abs(this.x - this.target) < precision) {
      this.x = this.target;
      this.v = 0;
      this.running = false;
      this._remove = null;
      this._emit();
      const cb = this.onRest;
      this.onRest = null;
      if (cb) cb();
      return false;
    }
    this._emit();
    return true;
  }
}

/** React hook: a Spring instance that re-renders the component as it moves. */
export function useSpring(initial, config) {
  const ref = useRef(null);
  if (!ref.current) ref.current = new Spring(initial, config);
  const [, force] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    const s = ref.current;
    const off = s.listen(force);
    return () => {
      off();
      s.stop();
    };
  }, []);
  return ref.current;
}
