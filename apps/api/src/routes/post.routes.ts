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

postRouter.get("/", requireBusinessRole("admin"), listPosts);
postRouter.post("/", requireBusinessRole("admin"), createDraft);
postRouter.post("/:id/suggest-hashtags", requireBusinessRole("admin"), suggestHashtags);
postRouter.post("/:id/schedule", requireBusinessRole("admin"), schedulePost);
postRouter.post("/:id/publish", requireBusinessRole("admin"), publishPost);
