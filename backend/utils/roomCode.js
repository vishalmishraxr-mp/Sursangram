import { customAlphabet } from "nanoid";

// Unambiguous uppercase letters + digits (no 0/O/1/I) for spoken/typed room codes.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(alphabet, 4);

// e.g. "ANTA72KQ"
export function generateRoomCode() {
  return `ANTA${generate()}`;
}
