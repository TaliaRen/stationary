// Shared SVG helpers.

/**
 * Desk shadow cast by an object lit from the upper left. Apply it to a
 * silhouette drawn in *unrotated* coordinates so the offset is always towards
 * the lower right. Three layers: a tight dark contact shadow where the object
 * touches the desk, a mid shadow, and a wide soft penumbra.
 */
export function DeskShadow({ id, dx = 12, dy = 16, blur = 12, opacity = 0.32, contact = 0.55, contactBlur = 1.8 }) {
  const color = (a) => `0 0 0 0 0.22  0 0 0 0 0.13  0 0 0 0 0.05  0 0 0 ${a} 0`;
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={contactBlur} result="cb" />
      <feOffset in="cb" dx={dx * 0.12} dy={dy * 0.12} result="co" />
      <feColorMatrix in="co" type="matrix" values={color(contact)} result="c" />
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur * 0.4} result="mb" />
      <feOffset in="mb" dx={dx * 0.45} dy={dy * 0.45} result="mo" />
      <feColorMatrix in="mo" type="matrix" values={color(opacity * 0.9)} result="m" />
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="fb" />
      <feOffset in="fb" dx={dx} dy={dy} result="fo" />
      <feColorMatrix in="fo" type="matrix" values={color(opacity * 0.7)} result="f" />
      <feMerge>
        <feMergeNode in="f" />
        <feMergeNode in="m" />
        <feMergeNode in="c" />
      </feMerge>
    </filter>
  );
}

/** Vertical gradient for a horizontal cylinder lit from above (top = light side). */
export function CylinderGradient({ id, stops }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
}

export const CHROME = [
  [0, '#8d939a'],
  [0.14, '#ffffff'],
  [0.3, '#d6dade'],
  [0.55, '#7c8289'],
  [0.8, '#c6cacf'],
  [1, '#656b72'],
];
