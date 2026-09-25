import mongoose from "mongoose";

/**
 * Phase 5 item #10 — Song cache schema.
 *
 * This is a CACHE of metadata (title, artist, start/end sound, etc.) for the
 * future external-music-API lookup flow described in musicApiService.js.
 * It stores metadata plus the provider stream URL so a previously resolved
 * song can be played again without another provider lookup. The app does not
 * download or persist the media itself.
 *
 * Used by the live turn engine when MongoDB is connected; an in-memory cache
 * remains available for development/offline operation.
 */
const SongSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, required: true, index: true },
    alternateTitles: { type: [String], default: [] },
    artist: { type: String, default: null },
    album: { type: String, default: null },
    movie: { type: String, default: null },
    startSound: { type: String, default: null },
    lastSound: { type: String, default: null },
    startLetter: { type: String, default: null },
    endLetter: { type: String, default: null },
    provider: { type: String, default: null },
    streamUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    previewUrl: { type: String, default: null },
    artworkUrl: { type: String, default: null },
    source: {
      type: String,
      enum: ["local", "external", "manual"],
      default: "external",
    },
    externalId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Avoid duplicate cache entries for the same normalized title from the same source.
SongSchema.index({ normalizedTitle: 1, source: 1 }, { unique: true });

export default mongoose.models.Song || mongoose.model("Song", SongSchema);
