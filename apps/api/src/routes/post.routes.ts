import { Router } from "express";
import {
  createDraft,
  listPosts,
  publishPost,
  schedulePost,
  suggestHashtags
} from "../controllers/post.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const postRouter = Router();

postRouter.use(requireAuth);

postRouter.get("/", requireBusinessRole("admin", "user", "super_admin"), listPosts);
postRouter.post("/", requireBusinessRole("admin", "user", "super_admin"), createDraft);
postRouter.post("/:id/suggest-hashtags", requireBusinessRole("admin", "super_admin"), suggestHashtags);
postRouter.post("/:id/schedule", requireBusinessRole("admin", "super_admin"), schedulePost);
postRouter.post("/:id/publish", requireBusinessRole("admin", "super_admin"), publishPost);
