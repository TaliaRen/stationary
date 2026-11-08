import { useEffect, useState } from 'react';
import { DeskWood, Sunlight } from './components/Desk';
import TapeLabel from './components/TapeLabel';
import { STATIONERY } from './stationery';
import { LAYOUTS, pickLayout } from './stationery/layout';
import { unlockAudio } from './lib/audio';

function useViewport() {
  const [vp, setVp] = useState(() => [window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const onResize = () => setVp([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

/**
 * Fit a layout to the window edge to edge. The layout keeps its scale along the
 * tighter axis; along the roomier axis the desk grows and the stationery spreads
 * out proportionally, so there are no empty margins on the sides.
 */
function useLayout() {
  const [vw, vh] = useViewport();
  const mode = pickLayout(vw, vh);
  const base = LAYOUTS[mode];
  const A = vw / vh;
  const a = base.W / base.H;
  const sx = A > a ? A / a : 1;
  const sy = A < a ? a / A : 1;
  const items = {};
  for (const [id, it] of Object.entries(base.items)) {
    items[id] = { ...it, x: (it.x + it.w / 2) * sx - it.w / 2, y: it.y * sy };
  }
  const labels = {};
  for (const [id, l] of Object.entries(base.labels)) labels[id] = { ...l, x: l.x * sx, y: l.y * sy };
  return { ...base, W: base.W * sx, H: base.H * sy, items, labels, mode };
}

const pct = (v, total) => `${(v / total) * 100}%`;

export default function App() {
  const layout = useLayout();
  const { W, H } = layout;

  useEffect(() => {
    // Audio may only start after a user gesture; capture phase runs before item handlers.
    const unlock = () => unlockAudio();
    // Focus rings only for keyboard users.
    const onKey = (e) => {
      unlock();
      if (e.key === 'Tab') document.documentElement.classList.add('kbd');
    };
    const onPointer = () => {
      unlock();
      document.documentElement.classList.remove('kbd');
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div className="app" data-mode={layout.mode}>
      <DeskWood />
      <main className="scene" aria-label="文具组件">
        {STATIONERY.map(({ id, label, Component }) => {
          const pos = layout.items[id];
          return (
            <section
              key={id}
              className="placed"
              aria-label={label}
              style={{ left: pct(pos.x, W), top: pct(pos.y, H), width: pct(pos.w, W) }}
            >
              <Component {...pos.props} />
            </section>
          );
        })}
        {STATIONERY.map(({ id, label }) => {
          const l = layout.labels[id];
          return <TapeLabel key={id} text={label} rotate={l.r} style={{ left: pct(l.x, W), top: pct(l.y, H) }} />;
        })}
        <Sunlight layout={layout} />
      </main>
    </div>
  );
}
