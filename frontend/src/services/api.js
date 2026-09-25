import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 8000,
});

// Unwraps { success, message, data } and throws a clean Error on failure
// so components can just `try { await createRoom(...) } catch (e) { e.message }`.
async function unwrap(promise) {
  try {
    const res = await promise;
    return res.data.data;
  } catch (err) {
    const message =
      err.response?.data?.message || err.message || "Something went wrong";
    throw new Error(message);
  }
}

export function createRoom(payload) {
  return unwrap(api.post("/rooms", payload));
}

export function getRoom(roomCode) {
  return unwrap(api.get(`/rooms/${roomCode}`));
}

export function joinRoom(roomCode, payload) {
  return unwrap(api.post(`/rooms/${roomCode}/join`, payload));
}

export function leaveRoom(roomCode, playerId) {
  return unwrap(api.post(`/rooms/${roomCode}/leave`, { playerId }));
}

export function updateRoomSettings(roomCode, requesterId, settings) {
  return unwrap(api.patch(`/rooms/${roomCode}/settings`, { requesterId, settings }));
}

export function searchSong(query, requiredLetter = null) {
  const params = new URLSearchParams({ q: query });
  if (requiredLetter) params.set("requiredLetter", requiredLetter);
  return unwrap(api.get(`/songs/search?${params.toString()}`));
}

export function generateRoast(payload) {
  return unwrap(api.post("/roast/generate", payload));
}

export function pickAiSong(requiredLetter = null, usedIds = []) {
  const params = new URLSearchParams();
  if (requiredLetter) params.set("requiredLetter", requiredLetter);
  if (usedIds?.length) params.set("usedIds", usedIds.join(","));
  const query = params.toString();
  return unwrap(api.get(`/songs/ai-pick${query ? `?${query}` : ""}`));
}

export function getSongStreamUrl(song) {
  if (!song) return null;
  if (song.audioProxyUrl) return song.audioProxyUrl;

  // iTunes returns the actual playable Apple song preview URL in previewUrl.
  // Prefer a direct URL whenever the backend has already resolved one.
  const directUrl = song.audioUrl || song.streamUrl || song.previewUrl || null;
  if (directUrl) return directUrl;

  // A provider-specific proxy is intentionally not used for iTunes previews.
  // If the backend has no direct preview URL, the song is not playable.
  return null;
}
