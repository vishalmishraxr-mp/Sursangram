/**
 * Random Jam fallback pool. Each entry names a synth "profile" that the
 * frontend's Web Audio synthesizer knows how to render — see the audio
 * honesty note in data/songs.js for why these are generated, not licensed
 * recordings.
 */
export const RANDOM_INSTRUMENTALS = [
  { category: "Romantic Piano", profile: "romantic-piano" },
  { category: "Bollywood-style Instrumental", profile: "dhol" },
  { category: "Dhol Beats", profile: "dhol" },
  { category: "Tabla", profile: "tabla" },
  { category: "Classical", profile: "classical" },
  { category: "Lo-fi", profile: "lo-fi" },
  { category: "Comedy Beats", profile: "comedy" },
  { category: "Party Music", profile: "party" },
  { category: "Dramatic Villain Music", profile: "villain" },
];

export function pickRandomInstrumental() {
  return RANDOM_INSTRUMENTALS[Math.floor(Math.random() * RANDOM_INSTRUMENTALS.length)];
}
