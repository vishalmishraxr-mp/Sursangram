import React, { useEffect, useRef, useState } from "react";

const BAR_COUNT = 24;

export default function MicWaveform({ active }) {
  const [levels, setLevels] = useState(() => new Array(BAR_COUNT).fill(4));
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function cleanup() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
      streamRef.current = null;
      ctxRef.current = null;
    }

    if (!active) {
      cleanup();
      setLevels(new Array(BAR_COUNT).fill(4));
      return () => {};
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        function tick() {
          analyser.getByteFrequencyData(data);
          const step = Math.floor(data.length / BAR_COUNT) || 1;
          const next = new Array(BAR_COUNT)
            .fill(0)
            .map((_, i) => Math.max(4, ((data[i * step] || 0) / 255) * 48));
          setLevels(next);
          rafRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        // Mic permission denied or unavailable — fall back to a gentle
        // idle animation so the UI still feels alive.
        function idleTick() {
          setLevels((prev) => prev.map(() => 6 + Math.random() * 10));
          rafRef.current = requestAnimationFrame(idleTick);
        }
        idleTick();
      }
    }

    start();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [active]);

  return (
    <div className="flex items-end justify-center gap-1 h-14">
      {levels.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-gradient-to-t from-neon-violet to-neon-pink transition-all duration-75"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
}
