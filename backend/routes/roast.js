import { Router } from "express";
import { z } from "zod";
import { generateRoastText } from "../services/aiRoastService.js";
import { ok, fail } from "../utils/apiResponse.js";

const router = Router();
const schema = z.object({
  eventType: z.string().min(1).max(60),
  intensity: z.enum(["mild", "savage", "full-chaos"]).default("mild"),
  context: z.record(z.any()).optional(),
});

router.post("/generate", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, "Invalid roast request", 422);
  const text = await generateRoastText(parsed.data);
  return ok(res, { text: text || null }, text ? "Roast generated" : "No roast available");
});

export default router;
