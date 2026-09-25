let activeAudio = null;
let primed = false;
let stopTimer = null;
const PLAYBACK_CAP_MS = 30_000;

// A tiny silent WAV used only to establish a user-gesture media session before
// the asynchronous song search returns. This prevents the common case where
// the browser blocks audio because play() happens after an awaited API call.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQgAAAAAAPA/AAD//w==";

export function primeSongAudio() {
  if (primed) return;
  try {
    const audio = new Audio(SILENT_WAV);
    audio.muted = true;
    audio.volume = 0;
    audio.preload = "auto";
    audio.playsInline = true;
    activeAudio = audio;
    const p = audio.play();
    if (p?.catch) p.catch(() => {});
    primed = true;
  } catch {}
}

export function stopSongAudio() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (!activeAudio) return;
  try {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.removeAttribute("src");
    activeAudio.load();
  } catch {}
  activeAudio = null;
}

export async function playSongAudio(url, { onEnded, startAtSeconds = 0 } = {}) {
  if (!url) return false;

  try {
    if (!activeAudio) activeAudio = new Audio();
    const audio = activeAudio;
    audio.pause();
    audio.currentTime = 0;
    audio.preload = "auto";
    audio.playsInline = true;
    // Apple/iTunes provides a short preview. Never loop it: the game turn and
    // the audio preview should both end naturally at roughly 30 seconds.
    audio.loop = false;
    audio.volume = 0.22;
    audio.muted = false;
    audio.onended = null;

    const isHls = /\.m3u8(?:$|\?)/i.test(url);
    if (isHls) {
      const hlsType = audio.canPlayType("application/vnd.apple.mpegurl");
      if (!hlsType) {
        console.warn("[songAudio] HLS URL received but this browser has no native HLS support.");
        return false;
      }
    }

    let finished = false;
    const finishPlayback = () => {
      if (finished) return;
      finished = true;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      try { onEnded?.(); } catch {}
    };

    audio.onended = finishPlayback;
    audio.src = url;
    audio.load();

    if (audio.readyState < 2) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 5000);
        const cleanup = () => {
          clearTimeout(timer);
          audio.removeEventListener("canplay", onReady);
          audio.removeEventListener("error", onError);
        };
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("Audio stream could not be loaded")); };
        audio.addEventListener("canplay", onReady, { once: true });
        audio.addEventListener("error", onError, { once: true });
      });
    }

    const safeStart = Number.isFinite(Number(startAtSeconds))
      ? Math.max(0, Number(startAtSeconds))
      : 0;
    // iTunes only exposes a short preview clip. Only seek inside the clip when
    // the lyric timestamp is actually within the preview's duration; otherwise
    // fall back to the preview start instead of seeking to an invalid position.
    if (safeStart > 0 && Number.isFinite(audio.duration) && audio.duration > safeStart + 0.15) {
      try { audio.currentTime = Math.min(safeStart, Math.max(0, audio.duration - 0.2)); } catch {}
    }

    await audio.play();

    // Keep a hard 30-second cap so a provider preview or browser timing quirk
    // can never make a turn run longer than the game window.
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(finishPlayback, PLAYBACK_CAP_MS);

    return true;
  } catch (err) {
    console.warn("[songAudio] playback blocked/failed:", err?.message || err);
    return false;
  }
}
