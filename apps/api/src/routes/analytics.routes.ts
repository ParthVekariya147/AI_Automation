import { Router } from "express";
import { listLikeAnalytics, recordLikeSnapshot } from "../controllers/post.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get(
  "/likes",
  requireBusinessRole("admin", "user", "super_admin"),
  listLikeAnalytics
);
analyticsRouter.post(
  "/likes",
  requireBusinessRole("admin", "super_admin"),
  recordLikeSnapshot
);
