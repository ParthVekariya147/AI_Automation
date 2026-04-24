import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { analyticsRouter } from "./analytics.routes.js";
import { businessRouter } from "./business.routes.js";
import { driveRouter, instagramRouter } from "./integrations.routes.js";
import { mediaRouter } from "./media.routes.js";
import { postRouter } from "./post.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/businesses", businessRouter);
apiRouter.use("/instagram", instagramRouter);
apiRouter.use("/google-drive", driveRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/posts", postRouter);
apiRouter.use("/analytics", analyticsRouter);
