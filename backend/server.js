import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { connectDB, isDbConnected } from "./config/db.js";
import roomRoutes from "./routes/rooms.js";
import songRoutes from "./routes/songs.js";
import roastRoutes from "./routes/roast.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { initSockets } from "./sockets/index.js";
import { memSweepExpired } from "./utils/memoryStore.js";

const app = express();
const PORT = process.env.PORT || 5001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// Basic API-wide rate limiting. Tightened per-route later (e.g. room creation).
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/v1/health", (req, res) => {
  res.json({ success: true, message: "Sursangram backend is alive", data: {} });
});

app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/songs", songRoutes);
app.use("/api/v1/roast", roastRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);
initSockets(httpServer, CLIENT_ORIGIN);

const MEMORY_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function start() {
  await connectDB(); // non-fatal if it fails — falls back to in-memory store
  httpServer.listen(PORT, () => {
    console.log(`[server] Sursangram backend (HTTP + Socket.IO) running on port ${PORT}`);
  });

  // BUGFIX (issue #6): MongoDB expires rooms via its TTL index automatically;
  // the in-memory store has no such background process, so without this,
  // finished/abandoned rooms would sit in memory forever when running
  // without a database. This is a no-op (and cheap) once Mongo is connected.
  setInterval(() => {
    if (isDbConnected()) return;
    const removed = memSweepExpired();
    if (removed > 0) console.log(`[memoryStore] swept ${removed} expired room(s)`);
  }, MEMORY_SWEEP_INTERVAL_MS);
}

start();
