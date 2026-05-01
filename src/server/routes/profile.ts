import { Router } from "express";
import type { Request, Response } from "express";
import { getProfileByUserId, upsertUserProfile } from "../db/profiles";

const router = Router();

router.get("/:userId", (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;
  const profile = getProfileByUserId(userId);
  if (!profile) {
    res.json({
      user_id: userId,
      display_name: "",
      role: "",
      strategy: "",
      portfolio: "",
      preferences: "",
      focus: "",
      theme: "dark",
      density: "default",
      updated_at: null,
    });
    return;
  }
  res.json(profile);
});

router.put("/:userId", (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;
  if (typeof userId !== "string" || !userId.trim()) {
    res.status(400).json({ error: "Invalid user_id" });
    return;
  }
  const fields = req.body as Record<string, unknown>;
  const allowed = [
    "display_name",
    "role",
    "strategy",
    "portfolio",
    "preferences",
    "focus",
    "theme",
    "density",
  ] as const;
  const update: Record<string, string> = {};
  for (const key of allowed) {
    if (key in fields && typeof fields[key] === "string") {
      update[key] = fields[key] as string;
    }
  }
  const profile = upsertUserProfile(userId, update);
  res.json(profile);
});

export { router as profileRouter };
