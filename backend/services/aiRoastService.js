import { getRoom } from "../repositories/roomRepository.js";
import { gameEventBus, GAME_EVENTS } from "./gameEvents.js";

/**
 * Phase 5 item #1/#2 — AI Roast Host.
 *
 * Design:
 *  - This module subscribes to the generic game-event bus (see
 *    gameEvents.js) instead of gameEngine.js calling into it directly, so
 *    the roast system stays decoupled and optional.
 *  - Roast TEXT generation (`generateRoastText`) is a pure function with a
 *    deterministic local fallback pool, keyed by intensity + event type.
 *    The game is NEVER dependent on an external API to keep playing — if no
 *    LLM endpoint is configured, or the call fails/times out, we always
 *    fall back to the local pool.
 *  - If `ROAST_LLM_API_URL` (and optionally `ROAST_LLM_API_KEY`) are set in
 *    the environment, we attempt one short-timeout call to that endpoint
 *    for a fresher line, through `callExternalRoastProvider`. This is kept
 *    behind a narrow abstraction so swapping providers later doesn't touch
 *    gameEngine.js or the socket layer at all.
 */

const ROAST_TRIGGER_EVENTS = new Set([
  GAME_EVENTS.SONG_SUCCESS,
  GAME_EVENTS.SONG_FAILED,
  GAME_EVENTS.TIMEOUT,
  GAME_EVENTS.INVALID_SONG,
  GAME_EVENTS.RANDOM_JAM,
  GAME_EVENTS.VALIDATION_FAILURE,
  GAME_EVENTS.COMEBACK,
  GAME_EVENTS.REPEATED_FAILURE,
  GAME_EVENTS.SONG_FINISHED,
]);

// ---------------------------------------------------------------------------
// Local fallback pool. Playful, game-oriented commentary only — never
// abusive, hateful, discriminatory, sexual, threatening, or aimed at a
// protected characteristic. Keep additions in this spirit.
// ---------------------------------------------------------------------------
const ROAST_POOL = {
  [GAME_EVENTS.SONG_SUCCESS]: {
    mild: [
      "That was a solid attempt — the opposing team is taking notes.",
      "Not bad! The judges (your friends) approve.",
      "A clean turn. The scoreboard is smiling.",
    ],
    savage: [
      "Okay, actual talent showed up today. Shocking.",
      "That landed. Somewhere, the other team just sighed.",
      "Points on the board and dignity intact — rare combo.",
    ],
    "full-chaos": [
      "STOP. That was unreasonably good for a group chat karaoke game.",
      "The scoreboard just gasped audibly.",
      "Somebody sign this person to a label. A small, local label.",
    ],
  },
  [GAME_EVENTS.SONG_FAILED]: {
    mild: [
      "That one didn't quite land, but the effort was there.",
      "The opposing team wasn't convinced — better luck next round.",
      "A brave attempt that just missed the mark.",
    ],
    savage: [
      "The opposing team rejected that faster than a group project idea.",
      "Bro, even the mic looked unimpressed.",
      "That performance had confidence and almost nothing else.",
    ],
    "full-chaos": [
      "That performance had the confidence of a chart-topper and none of the evidence.",
      "The opposing team hit reject so fast it left a draft.",
      "Somewhere, a music teacher felt a disturbance.",
    ],
  },
  [GAME_EVENTS.TIMEOUT]: {
    mild: [
      "Time ran out before the song did — happens to everyone.",
      "The clock won that round.",
      "So close! The timer had other plans.",
    ],
    savage: [
      "Bro, even the timer gave up waiting.",
      "The countdown finished the song for you. It did not go well.",
      "That silence was louder than the song would've been.",
    ],
    "full-chaos": [
      "The timer hit zero out of pure mercy.",
      "Legend says they're still thinking of a song.",
      "That turn achieved something rare: negative momentum.",
    ],
  },
  [GAME_EVENTS.INVALID_SONG]: {
    mild: [
      "No match found in the catalog this time — try another title.",
      "That one didn't ring a bell for the system.",
      "Close, but the song search came up empty.",
    ],
    savage: [
      "The song database said 'never heard of it.'",
      "That title is apparently more obscure than the WiFi password.",
      "Even the search engine is confused right now.",
    ],
    "full-chaos": [
      "The catalog just filed that under 'does not exist.'",
      "That song search returned tumbleweeds.",
      "Somewhere, a search index just shrugged.",
    ],
  },
  [GAME_EVENTS.RANDOM_JAM]: {
    mild: [
      "No song matched, so it's Random Jam time!",
      "Mystery beat incoming — freestyle mode engaged.",
      "The algorithm has chosen chaos... a small amount of it.",
    ],
    savage: [
      "Couldn't find the song, so here's a beat and a prayer.",
      "Random Jam: for when the memory fails but the confidence doesn't.",
      "The system gave up looking and just vibes now.",
    ],
    "full-chaos": [
      "RANDOM JAM ACTIVATED. Improvise like your team's honor depends on it. It does.",
      "No song? No problem. Feelings only, from here on.",
      "The universe has selected a beat. Destiny, but with dhol.",
    ],
  },
  [GAME_EVENTS.VALIDATION_FAILURE]: {
    mild: [
      "The opposing team didn't buy it this time.",
      "Challenged and denied — happens in every match.",
      "The rivals weren't convinced on that one.",
    ],
    savage: [
      "The opposing team hit 'invalid' with zero hesitation.",
      "That challenge was resolved faster than a group chat argument.",
      "The rivals said no, and honestly, they had a point.",
    ],
    "full-chaos": [
      "The opposing team just rejected that with the speed of a caffeinated referee.",
      "Denied. Appeal denied. Case closed.",
      "That challenge got shut down harder than a Monday morning alarm.",
    ],
  },
  [GAME_EVENTS.COMEBACK]: {
    mild: [
      "And just like that, the momentum has shifted!",
      "A comeback is brewing — this match isn't over.",
      "The tables are turning.",
    ],
    savage: [
      "The comeback nobody saw coming just arrived, uninvited.",
      "Someone forgot to tell this team they were supposed to be losing.",
      "This match just remembered it's a competition.",
    ],
    "full-chaos": [
      "COMEBACK ALERT. Somebody wake up the other team, they're about to need it.",
      "The scoreboard just did a double take.",
      "This is the part of the movie where the underdog music kicks in.",
    ],
  },
  [GAME_EVENTS.SONG_FINISHED]: {
    mild: [
      "Preview khatam, confidence abhi bhi loading mein hai.",
      "Gaana finish. Ab dekhte hain performance kitni real thi.",
      "Song khatam — ab score ki kahani suno.",
      "Music ne exit le liya, ab turn ka verdict dekho.",
      "Preview over. Mic ne apna kaam kar diya, ab tumhari baari.",
      "Gaana ruk gaya, lekin performance ka aftershock abhi baaki hai.",
      "Song done. Agle turn ke liye sur sambhal ke rakho.",
      "Preview khatam — confidence ko recharge ki zarurat lag rahi hai.",
      "Music stopped. Ab scoreboard ko impress karna padega.",
      "Beat off, battle on.",
      "Gaana over. Ab agla player pressure mein hai.",
      "Preview ne curtain giraya — performance ka verdict pending hai.",
    ],
    savage: [
      "Gaana khatam ho gaya, sur abhi tak loading screen par hain.",
      "Preview ne exit le liya — confidence ko bhi signal de dena.",
      "Song finished. Performance ka replay option unfortunately unavailable hai.",
      "Music khatam, confidence abhi bhi buffering par hai.",
      "Preview over — mic ne sab suna, scoreboard ne sab yaad rakha.",
      "Gaana 30 second tak chala, excuses usse zyada nahi chalne chahiye.",
      "Song done. Ab agla player decide karega ki ye comeback tha ya trailer.",
      "Preview khatam — sur ko ab attendance mark karni padegi.",
      "Music stopped. Ab dekhte hain confidence bhi stop hota hai ya nahi.",
      "Gaana gaya, ab judgement aayega.",
      "Preview ended. Performance ne questions chhode hain, answers nahi.",
      "Song over — ab mic bhi tumhare excuses nahi sunega.",
    ],
    "full-chaos": [
      "GAANA KHATAM. Jury ne collective 'hmm' bola hai.",
      "Preview over. Ab sirf scoreboard hi tumhari kahani sunayega.",
      "Forty-five seconds of cinema just ended. Performance? That's classified.",
      "GAANA OFF. DRAMA ON.",
      "Preview ne curtains gira diye — audience ab scoreboard dekh rahi hai.",
      "Music khatam. Ab ego aur scoreboard ka face-off shuru.",
      "Song over. Somebody call the replay team — agar replay available hota.",
      "Forty-five seconds done. Legends survive the scorecard.",
      "Preview ended. Pressure has officially entered the chat.",
      "Beat out. Battle mode still ON.",
      "Gaana khatam. Ab asli Sursangram shuru hota hai.",
      "Preview closed. Ab excuses ka encore bhi mat karna.",
    ],
  },
  [GAME_EVENTS.REPEATED_FAILURE]: {
    mild: [
      "A tough stretch for this player — the next turn is a fresh start.",
      "Rough couple of turns, but every singer has an off day.",
      "This player could use a lucky break next round.",
    ],
    savage: [
      "Two in a row now — the mic is starting to take it personally.",
      "This is becoming a pattern, and not the good kind.",
      "The streak continues, and not the one anyone wanted.",
    ],
    "full-chaos": [
      "This player is collecting failed turns like they're limited edition.",
      "At this point it's less a slump and more a lifestyle.",
      "The opposing team is starting to feel bad. Starting to.",
    ],
  },
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Pure-ish text generator with a guaranteed local fallback. `intensity`
 * should be "mild" | "savage" | "full-chaos" (the "off" case is filtered out
 * before this is ever called).
 */
export function generateRoastTextLocal(intensity, eventType) {
  const pool = ROAST_POOL[eventType];
  if (!pool) return null;
  const lines = pool[intensity] || pool.mild;
  if (!lines || lines.length === 0) return null;
  return pick(lines);
}

/**
 * Thin, optional abstraction over an external LLM/commentary API. Only
 * called if ROAST_LLM_API_URL is configured. Never allowed to block the
 * game — short timeout, and any failure silently falls back to the local
 * pool via generateRoastText().
 */
async function callExternalRoastProvider({ intensity, eventType, context }) {
  const url = process.env.ROAST_LLM_API_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ROAST_LLM_API_KEY
          ? { Authorization: `Bearer ${process.env.ROAST_LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        intensity,
        eventType,
        context,
        guidelines:
          "Playful, game-oriented multiplayer party-game commentary only. " +
          "No abusive, hateful, discriminatory, sexual, or threatening content. " +
          "No personal attacks or protected-characteristic references. " +
          "One short sentence, suitable for a college multiplayer game.",
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = typeof data?.text === "string" ? data.text.trim() : null;
    if (!text || text.length > 240) return null; // guard against runaway output
    return text;
  } catch {
    return null; // network error, timeout, bad JSON — fall back silently
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateRoastText({ intensity, eventType, context = {} }) {
  const external = await callExternalRoastProvider({ intensity, eventType, context });
  if (external) return external;
  return generateRoastTextLocal(intensity, eventType);
}
const songFinishedHistory = new Map();

async function generateDistinctRoasts({ intensity, eventType, context, count = 1, roomCode = null }) {
  const key = roomCode || "__global__";
  const used = new Set(songFinishedHistory.get(key) || []);
  const lines = [];

  // First avoid recently-used lines. If a pool is exhausted, fall back to a
  // fresh line that is only required to differ from the other line(s) in the
  // current toast. This guarantees two post-song roasts every turn instead of
  // eventually producing nothing after the small local pool is consumed.
  for (let i = 0; i < count; i += 1) {
    let chosen = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = await generateRoastText({ intensity, eventType, context });
      if (candidate && !used.has(candidate) && !lines.includes(candidate)) {
        chosen = candidate;
        break;
      }
    }

    if (!chosen) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = await generateRoastText({ intensity, eventType, context });
        if (candidate && !lines.includes(candidate)) {
          chosen = candidate;
          break;
        }
      }
    }

    if (!chosen) break;
    lines.push(chosen);
    used.add(chosen);
  }

  if (eventType === GAME_EVENTS.SONG_FINISHED) {
    songFinishedHistory.set(key, Array.from(used).slice(-12));
  }
  return lines;
}


// ---------------------------------------------------------------------------
// Subscription wiring — call once, right after the Socket.IO server exists.
// ---------------------------------------------------------------------------
let wired = false;

export function initRoastHost(io) {
  if (wired) return; // idempotent — server.js/tests may call init more than once
  wired = true;

  gameEventBus.on("*", async (event) => {
    try {
      if (!ROAST_TRIGGER_EVENTS.has(event.type)) return;

      const room = await getRoom(event.roomCode);
      if (!room) return;

      const roastSettings = room.settings?.roastHost;
      if (!roastSettings?.enabled || roastSettings.intensity === "off") return;

      const count = event.type === GAME_EVENTS.SONG_FINISHED ? 2 : 1;
      const texts = await generateDistinctRoasts({
        intensity: roastSettings.intensity,
        eventType: event.type,
        context: event.payload,
        count,
        roomCode: event.roomCode,
      });
      if (!texts.length) return;

      texts.forEach((text, index) => {
        setTimeout(() => {
          io.to(event.roomCode).emit("roast:new", {
            id: `${event.roomCode}-${event.at}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            eventType: event.type,
            intensity: roastSettings.intensity,
            at: event.at,
          });
        }, index * 160);
      });
    } catch (err) {
      // Roasts are flavor, never allowed to affect gameplay — swallow and log.
      console.error("[aiRoastService] failed to produce roast:", err.message);
    }
  });
}
