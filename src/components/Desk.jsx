// The desk background (wood) and the afternoon-sun overlay (window light).

export function DeskWood() {
  return (
    <div className="wood" aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          {/* Long, stretched noise = wood grain running horizontally. */}
          <filter id="wood-streak" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0012 0.03" numOctaves="2" seed="11" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.36  0 0 0 0 0.18  1.5 0 0 0 -0.55" />
          </filter>
          <filter id="wood-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.12" numOctaves="4" seed="3" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.28  0 0 0 0 0.12  1.7 0 0 0 -0.66" />
          </filter>
          <filter id="wood-pores" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.7" numOctaves="1" seed="5" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  2.2 0 0 0 -1.25" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="#e6cba2" />
        <rect width="100%" height="100%" filter="url(#wood-streak)" opacity="0.55" />
        <rect width="100%" height="100%" filter="url(#wood-grain)" opacity="0.6" />
        <rect width="100%" height="100%" filter="url(#wood-pores)" opacity="0.35" />
        {/* Plank seams */}
        {['31%', '68%'].map((y) => (
          <g key={y}>
            <line x1="0" x2="100%" y1={y} y2={y} stroke="#8a6440" strokeOpacity="0.35" strokeWidth="1.5" />
            <line x1="0" x2="100%" y1={y} y2={y} stroke="#fff4e0" strokeOpacity="0.35" strokeWidth="1" transform="translate(0 1.5)" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Window light for one layout, drawn in scene units. Three blended layers:
 * a multiply "shade" everywhere the window light does NOT reach (this is what
 * darkens objects sitting in the frame / wall shadow), a soft-light warm
 * highlight inside the panes, and a faint screen glow.
 */
export function Sunlight({ layout }) {
  const { W, H, sun } = layout;
  const [pw, ph] = sun.pane;
  const g = sun.gap;
  const panes = (
    <g transform={sun.transform}>
      {[
        [0, 0],
        [pw + g, 0],
        [0, ph + g],
        [pw + g, ph + g],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={pw} height={ph} rx="6" />
      ))}
    </g>
  );
  const box = { viewBox: `${-W / 2} ${-H / 2} ${W * 2} ${H * 2}`, preserveAspectRatio: 'none' };
  return (
    <div className="sun" aria-hidden="true">
      <svg className="sun-layer shade" {...box}>
        <defs>
          <mask id="sun-mask" maskUnits="userSpaceOnUse" x={-W / 2} y={-H / 2} width={W * 2} height={H * 2}>
            <rect x={-W / 2} y={-H / 2} width={W * 2} height={H * 2} fill="#fff" />
            <g fill="#000">{panes}</g>
          </mask>
        </defs>
        <rect x={-W / 2} y={-H / 2} width={W * 2} height={H * 2} fill="#a77a4c" mask="url(#sun-mask)" />
      </svg>
      <svg className="sun-layer soft" {...box}>
        <g fill="#fff4da">{panes}</g>
      </svg>
      <svg className="sun-layer glow" {...box}>
        <g fill="#ffcf8c">{panes}</g>
      </svg>
    </div>
  );
}
