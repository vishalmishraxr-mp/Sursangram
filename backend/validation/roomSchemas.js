import { z } from "zod";

export const createRoomSchema = z.object({
  hostDisplayName: z.string().trim().min(1).max(24),
  settings: z
    .object({
      gameMode: z.enum(["classic", "chaos", "dare", "battle"]).optional(),
      rounds: z.number().int().min(1).max(50).optional(),
      turnDurationSeconds: z.number().int().min(10).max(30).optional(),
      roastHost: z
        .object({
          enabled: z.boolean().optional(),
          intensity: z.enum(["mild", "savage", "full-chaos", "off"]).optional(),
        })
        .optional(),
      randomJamMode: z.boolean().optional(),
      specialChallenges: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(24),
  playerId: z.string().trim().min(1).optional(), // for reconnect
});

export const roomCodeParamSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ANTA[A-Z0-9]{4}$/, "Invalid room code format"),
});
