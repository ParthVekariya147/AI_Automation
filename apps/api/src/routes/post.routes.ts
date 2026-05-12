import { Router } from "express";
import {
  approveAndSchedule,
  createDraft,
  deletePost,
  getCollaboratorStatus,
  listPosts,
  publishPost,
  schedulePost,
  suggestHashtags,
  updatePost
} from "../controllers/post.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const postRouter = Router();

postRouter.use(requireAuth);

postRouter.get("/", requireBusinessRole("admin"), listPosts);
postRouter.post("/", requireBusinessRole("admin"), createDraft);
postRouter.patch("/:id", requireBusinessRole("admin"), updatePost);
postRouter.delete("/:id", requireBusinessRole("admin"), deletePost);
postRouter.post("/:id/suggest-hashtags", requireBusinessRole("admin"), suggestHashtags);
postRouter.post("/:id/schedule", requireBusinessRole("admin"), schedulePost);
postRouter.post("/:id/publish", requireBusinessRole("admin"), publishPost);
postRouter.post("/:id/approve-schedule", requireBusinessRole("admin"), approveAndSchedule);
postRouter.get("/:id/collaborators", requireBusinessRole("admin"), getCollaboratorStatus);
