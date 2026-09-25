import { io } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}

// Wraps a socket.emit(event, payload, ack) call in a Promise so components
// can `await emitAck(...)` and just try/catch, same pattern as the REST api.
export function emitAck(event, payload = {}) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) {
      reject(new Error("Not connected — check your internet connection"));
      return;
    }
    s.timeout(6000).emit(event, payload, (err, response) => {
      if (err) {
        reject(new Error("Server did not respond in time"));
        return;
      }
      if (response && response.success === false) {
        reject(new Error(response.message || "Action failed"));
        return;
      }
      resolve(response);
    });
  });
}
