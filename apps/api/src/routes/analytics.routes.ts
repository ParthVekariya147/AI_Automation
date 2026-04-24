import { Router } from "express";
import { listLikeAnalytics, recordLikeSnapshot } from "../controllers/post.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get("/likes", requireBusinessRole("admin"), listLikeAnalytics);
analyticsRouter.post("/likes", requireBusinessRole("admin"), recordLikeSnapshot);
