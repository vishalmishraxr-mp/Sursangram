import { Router } from "express";
import { z } from "zod";
import { searchSongWithSource, getPlayableAudioUrl, pickAiSong } from "../services/musicApiService.js";
import { getSongById, getRandomInstrumental } from "../services/songSearch.js";
import { SONGS } from "../data/songs.js";
import { ok, fail } from "../utils/apiResponse.js";

const router = Router();
const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  requiredLetter: z.string().trim().max(4).optional(),
});

router.get("/search", async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return fail(res, "Provide a search query (?q=)", 422);

  const result = await searchSongWithSource(parsed.data.q, parsed.data.requiredLetter || null);
  if (result.letterMismatch) {
    return ok(res, result, `Song found, but it must start with ${parsed.data.requiredLetter}`);
  }
  if (!result.song) {
    return ok(res, { song: null, source: null, fallback: "random-jam" }, "No confident match found; Random Jam is available");
  }
  return ok(res, result, `Match found via ${result.source}`);
});

router.get("/ai-pick", async (req, res) => {
  const requiredLetter = String(req.query.requiredLetter || "").trim() || null;
  const usedIds = String(req.query.usedIds || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 80);

  if (requiredLetter && requiredLetter.length > 4) {
    return fail(res, "Invalid required letter", 422);
  }

  const song = await pickAiSong(requiredLetter, usedIds);
  if (!song) {
    return ok(res, { song: null }, "AI could not find a fresh song for this letter");
  }

  return ok(res, { song, source: song.source || "external" }, "AI selected a song");
});

router.get("/random-instrumental", (req, res) => {
  return ok(res, { instrumental: getRandomInstrumental() }, "Random instrumental selected");
});

router.get("/stream", async (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return fail(res, "Song id is required", 422);

  try {
    const streamUrl = await getPlayableAudioUrl(id);
    if (!streamUrl) return fail(res, "No playable audio stream available", 404);

    const upstream = await fetch(streamUrl, {
      headers: {
        Accept: "audio/*,application/vnd.apple.mpegurl,application/octet-stream",
      },
    });
    if (!upstream.ok || !upstream.body) {
      return fail(res, "Audio provider could not serve this song", 502);
    }

    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    const length = upstream.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    upstream.body.pipeTo(new WritableStream({
      write(chunk) { res.write(Buffer.from(chunk)); },
      close() { res.end(); },
      abort() { res.end(); },
    })).catch(() => res.end());
  } catch (err) {
    return fail(res, "Audio stream failed", 502);
  }
});

router.get("/:songId", (req, res) => {
  const song = getSongById(req.params.songId);
  if (!song) return fail(res, "Song not found", 404);
  return ok(res, { song }, "Song found");
});

router.get("/:songId/karaoke", (req, res) => {
  const song = getSongById(req.params.songId);
  if (!song) return fail(res, "Song not found", 404);
  if (!song.karaoke?.available) return ok(res, { available: false }, "No karaoke profile available for this song");
  return ok(res, { available: true, profile: song.karaoke.profile }, "Karaoke profile resolved");
});

router.get("/", (req, res) => {
  return ok(res, { songs: SONGS.map((s) => ({ id: s.id, title: s.title, movie: s.movie })) }, "Song catalog");
});

export default router;
