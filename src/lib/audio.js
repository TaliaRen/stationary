// Synthesised stationery sounds built with the Web Audio API — no audio files.
// The context is created lazily on the first user gesture (browser autoplay rules).

let ctx = null;
let out = null;
let noiseBuf = null;
let bus = null; // per-sound trim gain while a sound is being scheduled
let forceLive = false; // used by the offline loudness measurement
const VOLUME = 0.85;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.002; // catch the fast clicks so boosted ones never clip
    out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(comp);
    comp.connect(ctx.destination);

    // Two seconds of white noise, reused (with random offsets) by every sound.
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const live = () => ctx && (forceLive || ctx.state === 'running');
const dest = () => bus || out;

function envelope(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseSource(t, dur) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
  return src;
}

/** A burst of filtered noise with an exponential decay. */
function noise(t, { type = 'bandpass', freq = 2000, freqEnd, q = 1, gain = 0.3, attack = 0.001, decay = 0.05 } = {}) {
  const src = noiseSource(t, attack + decay);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
  const g = ctx.createGain();
  envelope(g, t, gain, attack, decay);
  src.connect(f);
  f.connect(g);
  g.connect(dest());
}

/** A short pitched blip, optionally gliding in pitch. */
function tone(t, { freq = 1000, freqEnd, type = 'sine', gain = 0.2, attack = 0.001, decay = 0.08 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
  const g = ctx.createGain();
  envelope(g, t, gain, attack, decay);
  o.connect(g);
  g.connect(dest());
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

const raw = {
  /** Ballpoint pen "click": sharp plastic transient plus a tiny latch click. */
  penClick(on) {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.5, decay: 0.012 });
    noise(t, { type: 'bandpass', freq: on ? 3500 : 2900, q: 9, gain: 0.32, decay: 0.03 });
    tone(t, { type: 'triangle', freq: on ? 1600 : 1300, freqEnd: 480, gain: 0.16, decay: 0.03 });
    noise(t + 0.03, { type: 'bandpass', freq: on ? 4400 : 3900, q: 6, gain: 0.16, decay: 0.014 });
  },

  /** Soft contact when a finger first presses the pen. */
  penPress() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'bandpass', freq: 1900, q: 3, gain: 0.2, decay: 0.045 });
  },

  /** Very light tick for each centimetre of tape. */
  tick() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'bandpass', freq: 4200, q: 3, gain: 0.4, decay: 0.022 });
    tone(t, { type: 'triangle', freq: 2700, gain: 0.12, decay: 0.035 });
  },

  /** Tape-measure lock button being flicked. */
  lockClick() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'bandpass', freq: 2600, q: 4, gain: 0.45, decay: 0.035 });
    tone(t, { freq: 900, freqEnd: 420, gain: 0.2, decay: 0.06 });
  },

  /** Tape rewinding: an airy swish with an accelerating ratchet flutter. */
  whoosh(dur) {
    if (!live()) return;
    const t = ctx.currentTime;
    const d = Math.max(0.12, dur);
    const src = noiseSource(t, d + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.06, t + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
    src.connect(f);
    f.connect(g);
    g.connect(dest());

    let tt = 0;
    let gap = 0.03;
    while (tt < d) {
      noise(t + tt, { type: 'bandpass', freq: 2800 + Math.random() * 1800, q: 5, gain: 0.04 + 0.08 * (tt / d), decay: 0.006 });
      gap = Math.max(0.007, gap * 0.88);
      tt += gap;
    }
  },

  /** Hook slamming back into the case: thump + metallic clack + ring. */
  snap() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, { freq: 190, freqEnd: 60, gain: 0.55, decay: 0.12 });
    noise(t, { type: 'highpass', freq: 1800, q: 0.7, gain: 0.55, decay: 0.035 });
    noise(t, { type: 'bandpass', freq: 900, q: 2, gain: 0.3, decay: 0.05 });
    tone(t + 0.002, { freq: 2950, gain: 0.05, decay: 0.2 });
    tone(t + 0.002, { freq: 4420, gain: 0.035, decay: 0.15 });
  },

  /** Stapler arm starting to go down (spring compressing). */
  staplePress() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'lowpass', freq: 1200, q: 0.7, gain: 0.1, decay: 0.05 });
    tone(t, { freq: 320, freqEnd: 180, gain: 0.05, decay: 0.04 });
  },

  /** "Ka-cha": the staple punching through paper and folding on the anvil. */
  stapleCrunch() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'bandpass', freq: 2200, q: 2, gain: 0.45, decay: 0.012 });
    noise(t + 0.014, { type: 'highpass', freq: 3500, q: 0.7, gain: 0.42, decay: 0.05 });
    noise(t + 0.02, { type: 'bandpass', freq: 6000, q: 3, gain: 0.18, decay: 0.03 });
    tone(t + 0.012, { freq: 5200, gain: 0.04, decay: 0.09 });
    tone(t + 0.012, { freq: 7350, gain: 0.03, decay: 0.07 });
    tone(t, { freq: 150, freqEnd: 55, gain: 0.4, decay: 0.09 });
  },

  /** Arm springing back up. */
  stapleRelease() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'bandpass', freq: 1500, q: 3, gain: 0.08, decay: 0.02 });
    tone(t, { type: 'triangle', freq: 430, freqEnd: 380, gain: 0.03, decay: 0.12 });
  },

  /** Paper page turning: crackly band-passed noise plus a soft landing. */
  pageFlip() {
    if (!live()) return;
    const t = ctx.currentTime;
    const d = 0.36;
    const src = noiseSource(t, d + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(2000, t);
    f.frequency.linearRampToValueAtTime(3400, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // Random gain steps give the crinkly texture of paper.
    for (let k = 0; k < d; k += 0.011) {
      const e = Math.sin((Math.PI * k) / d);
      g.gain.setValueAtTime(0.0001 + e * (0.08 + Math.random() * 0.2), t + k);
    }
    g.gain.setValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(g);
    g.connect(dest());
    noise(t, { type: 'lowpass', freq: 700, q: 0.7, gain: 0.12, attack: 0.1, decay: 0.25 });
    noise(t + d * 0.92, { type: 'lowpass', freq: 1400, q: 0.7, gain: 0.12, decay: 0.05 });
  },

  /** Masking tape torn off the roll: a crackly rising rip ending in a snap. */
  tapeTear(full = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    const d = full ? 0.3 : 0.14;
    const src = noiseSource(t, d + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(1600, t);
    f.frequency.linearRampToValueAtTime(4200, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < d; k += 0.008) {
      const e = Math.min(1, k / 0.04) * (1 - (k / d) * 0.4);
      g.gain.setValueAtTime(0.0001 + e * (0.05 + Math.random() * 0.28), t + k);
    }
    g.gain.setValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(g);
    g.connect(dest());
    noise(t + d - 0.01, { type: 'highpass', freq: 3000, q: 0.7, gain: 0.22, decay: 0.03 });
  },

  /** A stuck strip being peeled up again: shorter, higher "sss". */
  tapePeel() {
    if (!live()) return;
    const t = ctx.currentTime;
    const d = 0.2;
    const src = noiseSource(t, d + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.linearRampToValueAtTime(5500, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < d; k += 0.009) g.gain.setValueAtTime(0.0001 + (0.04 + Math.random() * 0.14) * (1 - k / d), t + k);
    g.gain.setValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(g);
    g.connect(dest());
  },

  /** Strip pressed onto the desk. */
  tapeStick() {
    if (!live()) return;
    const t = ctx.currentTime;
    noise(t, { type: 'lowpass', freq: 900, q: 0.7, gain: 0.14, decay: 0.04 });
    tone(t, { freq: 190, freqEnd: 120, gain: 0.04, decay: 0.05 });
  },

  /** Small bell. `soft` is the quiet search-hit version. */
  ding(soft = false) {
    if (!live()) return;
    const t = ctx.currentTime;
    const v = 1;
    tone(t, { freq: 1568, gain: 0.16 * v, attack: 0.002, decay: soft ? 0.5 : 0.9 });
    tone(t, { freq: 2352, gain: 0.05 * v, attack: 0.002, decay: soft ? 0.35 : 0.6 });
    tone(t, { freq: 3136, gain: 0.035 * v, attack: 0.002, decay: soft ? 0.25 : 0.45 });
  },

  /** Continuous pencil-sharpening "shh-shh" while held. Returns { stop }. */
  sharpen() {
    if (!live()) return { stop() {} };
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2300;
    f.Q.value = 1.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.06);
    // Rhythmic wobble = the blade catching the wood once per turn.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const g2 = ctx.createGain();
    g2.gain.value = 0.035;
    src.connect(f);
    f.connect(g);
    g.connect(dest());
    src.connect(hp);
    hp.connect(g2);
    g2.connect(dest());
    src.start(t, Math.random());
    lfo.start(t);
    return {
      stop() {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0, n, 0.03);
        g2.gain.setTargetAtTime(0, n, 0.03);
        src.stop(n + 0.25);
        lfo.stop(n + 0.25);
      },
    };
  },

  /** Rubber stamp hitting paper: a short, dull, woody "dong". Kept above ~180 Hz
   *  so laptop and phone speakers can actually play it. */
  stampThud() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, { freq: 260, freqEnd: 170, gain: 0.5, decay: 0.11 }); // body
    tone(t, { type: 'triangle', freq: 520, freqEnd: 380, gain: 0.3, decay: 0.07 }); // wooden handle
    noise(t, { type: 'bandpass', freq: 950, q: 2, gain: 0.5, decay: 0.06 }); // knock
    noise(t, { type: 'bandpass', freq: 1700, q: 2.5, gain: 0.25, decay: 0.03 }); // crisp attack
    noise(t, { type: 'bandpass', freq: 2600, q: 1.5, gain: 0.18, decay: 0.015 }); // rubber meets paper
  },

  /** Zipper: a run of tiny grains (one per tooth). */
  zipper(dur = 0.4, opening = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    let k = 0;
    while (k < dur) {
      const p = k / dur;
      noise(t + k, { type: 'bandpass', freq: (opening ? 3200 : 3800) + Math.random() * 1600, q: 6, gain: 0.05 + 0.07 * Math.sin(Math.PI * p), decay: 0.005 });
      k += 0.007 + Math.random() * 0.006;
    }
    noise(t, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.04, attack: dur * 0.3, decay: dur * 0.7 });
  },

  /** A pen dropping onto the desk; pitch by material. */
  penDrop(material = 'plastic') {
    if (!live()) return;
    const t = ctx.currentTime;
    const f = { wood: 620, plastic: 1500, metal: 2600, bamboo: 820 }[material] || 1200;
    tone(t, { type: 'triangle', freq: f, freqEnd: f * 0.7, gain: 0.07, decay: material === 'metal' ? 0.12 : 0.05 });
    noise(t, { type: 'bandpass', freq: f * 2, q: 3, gain: 0.08, decay: 0.012 });
  },
};

// ---------------------------------------------------------------------------
// Loudness balancing. Each sound plays through its own trim gain so they all
// sound about equally loud. The trims come from an offline measurement
// (weighted like small speakers: >150 Hz + presence boost; loudest 100 ms window)
// — see measureLoudness() below:
// main action sounds ≈ -24 dB, accompanying sounds (a press before a click,
// a strip landing, a pen dropping) ≈ -32 dB.
// ---------------------------------------------------------------------------
const TRIM = {
  penClick: 1.51,
  penPress: 4.08,
  tick: 3.05,
  lockClick: 2,
  whoosh: 1.21,
  snap: 0.42,
  staplePress: 1,
  stapleCrunch: 1,
  stapleRelease: 1,
  pageFlip: 0.78,
  tapeTear: 0.87,
  tapePeel: 0.74,
  tapeStick: 3.2,
  ding: 0.57,
  sharpen: 1.32,
  stampThud: 1.3, // a deliberate, heavier action: about +7 dB over the rest
  zipper: 1,
  penDrop: 2.88,
};

export const sfx = {};
for (const [name, fn] of Object.entries(raw)) {
  sfx[name] = (...args) => {
    if (!live()) return fn.apply(raw, args);
    const g = ctx.createGain();
    g.gain.value = TRIM[name] ?? 1;
    g.connect(out);
    bus = g;
    try {
      return fn.apply(raw, args);
    } finally {
      bus = null;
    }
  };
}

/** Dev helper: render each sound offline and report its loudness in dB (K-weighted). */
export async function measureLoudness(cases) {
  const saved = { ctx, out, noiseBuf };
  const results = {};
  try {
    for (const [label, name, args] of cases) {
      const sr = 44100;
      const off = new OfflineAudioContext(1, Math.floor(sr * 1.4), sr);
      ctx = off;
      const len = sr * 2;
      noiseBuf = off.createBuffer(1, len, sr);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // K-weighting approximation: high-pass + high-shelf boost.
      const hp = off.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 150; // roughly what laptop / phone speakers can reproduce
      const shelf = off.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 1500;
      shelf.gain.value = 4;
      out = off.createGain();
      out.connect(hp);
      hp.connect(shelf);
      shelf.connect(off.destination);
      forceLive = true;
      sfx[name](...(args || []));
      forceLive = false;
      const buf = await off.startRendering();
      const x = buf.getChannelData(0);
      const win = Math.floor(sr * 0.1);
      const step = Math.floor(sr * 0.01);
      let best = 0;
      for (let i = 0; i + win < x.length; i += step) {
        let e = 0;
        for (let j = i; j < i + win; j++) e += x[j] * x[j];
        best = Math.max(best, e / win);
      }
      results[label] = Math.round(10 * Math.log10(best + 1e-12) * 10) / 10;
    }
  } finally {
    forceLive = false;
    ({ ctx, out, noiseBuf } = saved);
  }
  return results;
}
export { TRIM };
if (import.meta.env?.DEV) window.__sfx = { measureLoudness, TRIM };
