// Desk compositions in "scene units". The scene box keeps this aspect ratio and is
// scaled to fit the viewport; every item, label and light patch is
// placed in the same units so they stay aligned on any screen.
//
// items: x / y = top-left corner, w = rendered width (height follows the SVG viewBox).
// labels: masking-tape name labels on the desk, r = rotation in degrees.
// sun: window light projected on the desk (panes are drawn inside `transform`).

export const LAYOUTS = {
  landscape: {
    W: 1800,
    H: 1100,
    items: {
      slider: { x: -14, y: 89, w: 717 },
      search: { x: 630, y: 60, w: 691 },
      tab: { x: 1040, y: 120, w: 760 },
      button: { x: -42, y: 349, w: 784 },
      progress: { x: 476, y: 484, w: 829, props: { angle: 12 } },
      tag: { x: 1058, y: 672, w: 784, props: { vbW: 700, vbH: 260, roll: [600, 130], area: [150, 74, 360] } },
      toggle: { x: 548, y: 833, w: 963, props: { angle: -4 } },
    },
    labels: {
      slider: { x: 34, y: 66, r: -4 },
      search: { x: 960, y: 448, r: 3 },
      tab: { x: 1262, y: 120, r: -4 },
      button: { x: 76, y: 860, r: -3 },
      progress: { x: 790, y: 516, r: -4 },
      tag: { x: 1650, y: 924, r: 4 },
      toggle: { x: 700, y: 884, r: -3 },
    },
    sun: { transform: 'translate(170 -330) rotate(18) skewX(-28)', pane: [560, 470], gap: 44 },
  },
  // Phone portrait: everything on one screen (≈ 9:19.5); taller phones spread out.
  portrait: {
    W: 900,
    H: 1950,
    items: {
      slider: { x: -40, y: 176, w: 582 },
      search: { x: 330, y: 8, w: 582 },
      tab: { x: 10, y: 440, w: 880 },
      tag: { x: -54, y: 1026, w: 1008, props: { vbW: 900, vbH: 240, roll: [800, 120], area: [40, 98, 620] } },
      toggle: { x: -59, y: 1247, w: 918, props: { angle: -5 } },
      button: { x: 4, y: 1422, w: 560 },
      progress: { x: 391, y: 1545, w: 538, props: { angle: -8 } },
    },
    labels: {
      slider: { x: 30, y: 104, r: -4 },
      search: { x: 640, y: 286, r: 3 },
      tab: { x: 170, y: 450, r: -4 },
      tag: { x: 742, y: 1246, r: 4 },
      toggle: { x: 220, y: 1256, r: -3 },
      button: { x: 16, y: 1520, r: -3 },
      progress: { x: 660, y: 1800, r: -4 },
    },
    sun: { transform: 'translate(-80 60) rotate(22) skewX(-20)', pane: [400, 420], gap: 38 },
  },
};

export function pickLayout(width, height) {
  return width / height < 0.9 ? 'portrait' : 'landscape';
}
