export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linearly blend two #rrggbb colours. */
export function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp(t, 0, 1);
  const c = ca.map((v, i) => Math.round(lerp(v, cb[i], k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Convert a pointer event's client position into an SVG element's local coordinates. */
export function svgPoint(el, e) {
  const m = el.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
}

/** Capture the pointer on the event's target; ignore pointers that can't be captured. */
export function capture(e) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* e.g. synthetic or already-released pointers */
  }
}
