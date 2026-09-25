import mongoose from "mongoose";

/**
 * Attempts to connect to MongoDB. If it fails or MONGO_URI is missing,
 * the app keeps running using the in-memory store (see utils/memoryStore.js)
 * so local development / demoing never gets blocked on Atlas setup.
 */
export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("[db] No MONGO_URI set — running with in-memory store only.");
    return false;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    console.log("[db] Connected to MongoDB");
    return true;
  } catch (err) {
    console.warn(
      "[db] Could not connect to MongoDB, falling back to in-memory store:",
      err.message
    );
    return false;
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
