/**
 * Browser-only synthesized instrumental loops and short game-event cues.
 * No copyrighted/streamed recordings are bundled here.
 */

let audioCtx = null;
let activeTimers = [];
let activeNodes = [];

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio API is not supported");
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function unlock() {
  const ctx = getCtx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function scheduleTone(ctx, { freq, start, dur, type = "sine", gain = 0.15 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const at = ctx.currentTime + start;
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + Math.min(0.02, dur / 4));
  g.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  activeNodes.push(osc, g);
}

function scheduleNoiseHit(ctx, { start, dur, freq = 200 }) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start(ctx.currentTime + start);
  activeNodes.push(src, filter, g);
}

const PROFILES = {
  "romantic-piano": {
    bar: 2.4,
    render: (ctx, t0) => [261, 329, 392, 329].forEach((f, i) =>
      scheduleTone(ctx, { freq: f, start: t0 + i * 0.6, dur: 0.55, gain: 0.12 })
    ),
  },
  dhol: {
    bar: 1.2,
    render: (ctx, t0) => [0, 0.3, 0.6, 0.75].forEach((offset) =>
      scheduleNoiseHit(ctx, { start: t0 + offset, dur: 0.18, freq: 120 })
    ),
  },
  tabla: {
    bar: 0.9,
    render: (ctx, t0) => [0, 0.22, 0.45, 0.6, 0.75].forEach((offset, i) =>
      scheduleNoiseHit(ctx, { start: t0 + offset, dur: 0.1, freq: i % 2 === 0 ? 300 : 180 })
    ),
  },
  classical: {
    bar: 2.0,
    render: (ctx, t0) => [392, 440, 494, 523, 494, 440].forEach((f, i) =>
      scheduleTone(ctx, { freq: f, start: t0 + i * 0.32, dur: 0.3, type: "triangle", gain: 0.1 })
    ),
  },
  "lo-fi": {
    bar: 2.8,
    render: (ctx, t0) => [220, 261, 329].forEach((f) =>
      scheduleTone(ctx, { freq: f, start: t0, dur: 2.6, gain: 0.06 })
    ),
  },
  "antakshari-bgm": {
    bar: 3.2,
    render: (ctx, t0) => {
      // Light original instrumental bed: soft chords + bass + subtle hats/kicks.
      // This is generated locally with Web Audio; no song recording is played.
      const chords = [
        [261.63, 329.63, 392.0], // C
        [220.0, 261.63, 329.63],  // Am
        [174.61, 220.0, 261.63],  // F
        [196.0, 246.94, 293.66],  // G
      ];
      const bass = [130.81, 110.0, 87.31, 98.0];

      chords.forEach((chord, i) => {
        chord.forEach((freq) =>
          scheduleTone(ctx, {
            freq,
            start: t0 + i * 0.8,
            dur: 0.74,
            type: "triangle",
            gain: 0.045,
          })
        );
        scheduleTone(ctx, {
          freq: bass[i],
          start: t0 + i * 0.8,
          dur: 0.68,
          type: "sine",
          gain: 0.075,
        });
      });

      for (let i = 0; i < 8; i += 1) {
        scheduleNoiseHit(ctx, {
          start: t0 + i * 0.4,
          dur: 0.045,
          freq: 2600,
        });
      }
      [0, 0.8, 1.6, 2.4].forEach((offset) =>
        scheduleNoiseHit(ctx, { start: t0 + offset, dur: 0.11, freq: 95 })
      );
    },
  },
  comedy: {
    bar: 1.0,
    render: (ctx, t0) => [0, 0.15, 0.3].forEach((offset, i) =>
      scheduleTone(ctx, { freq: 500 + i * 200, start: t0 + offset, dur: 0.12, type: "square", gain: 0.1 })
    ),
  },
  party: {
    bar: 0.6,
    render: (ctx, t0) => {
      scheduleNoiseHit(ctx, { start: t0, dur: 0.12, freq: 100 });
      scheduleTone(ctx, { freq: 440, start: t0 + 0.3, dur: 0.15, type: "sawtooth", gain: 0.08 });
    },
  },
  villain: {
    bar: 3.0,
    render: (ctx, t0) => {
      scheduleTone(ctx, { freq: 98, start: t0, dur: 2.8, type: "sawtooth", gain: 0.1 });
      scheduleTone(ctx, { freq: 104, start: t0, dur: 2.8, type: "sawtooth", gain: 0.06 });
    },
  },
};

export function play(profileKey) {
  stop();
  const profile = PROFILES[profileKey] || PROFILES["lo-fi"];
  let ctx;
  try { ctx = getCtx(); } catch { return; }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  function loop() {
    profile.render(ctx, ctx.currentTime);
    activeTimers.push(setTimeout(loop, profile.bar * 1000));
  }
  loop();
}

export function stop() {
  activeTimers.forEach(clearTimeout);
  activeTimers = [];
  activeNodes.forEach((node) => {
    try { node.stop?.(); node.disconnect?.(); } catch {}
  });
  activeNodes = [];
}

export const AVAILABLE_PROFILES = Object.keys(PROFILES);

const CUES = {
  success: (ctx) => [523, 659, 784].forEach((f, i) =>
    scheduleTone(ctx, { freq: f, start: i * 0.09, dur: 0.22, gain: 0.14 })
  ),
  failed: (ctx) => {
    scheduleTone(ctx, { freq: 220, start: 0, dur: 0.28, type: "sawtooth", gain: 0.12 });
    scheduleTone(ctx, { freq: 180, start: 0.1, dur: 0.3, type: "sawtooth", gain: 0.12 });
  },
  timeout: (ctx) => scheduleNoiseHit(ctx, { start: 0, dur: 0.12, freq: 900 }),
  comeback: (ctx) => [392, 523, 659, 784].forEach((f, i) =>
    scheduleTone(ctx, { freq: f, start: i * 0.07, dur: 0.3, type: "triangle", gain: 0.13 })
  ),
  steal: (ctx) => {
    scheduleTone(ctx, { freq: 300, start: 0, dur: 0.15, type: "square", gain: 0.1 });
    scheduleTone(ctx, { freq: 500, start: 0.12, dur: 0.15, type: "square", gain: 0.1 });
  },
};

export function playCue(type) {
  const render = CUES[type];
  if (!render) return;
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    render(ctx);
  } catch {}
}
