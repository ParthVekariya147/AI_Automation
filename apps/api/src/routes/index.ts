import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { analyticsRouter } from "./analytics.routes.js";
import { businessRouter } from "./business.routes.js";
import { driveRouter, instagramRouter } from "./integrations.routes.js";
import { mediaRouter } from "./media.routes.js";
import { postRouter } from "./post.routes.js";
import { reportRouter } from "./report.routes.js";
import automationRouter from "./automation.routes.js";
import { requireAuth } from "../middlewares/auth.js";
import { runNow } from "../services/scheduler.service.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

apiRouter.post("/scheduler/run-now", requireAuth, async (_req, res) => {
  const result = await runNow();
  res.json({ success: true, data: result });
});

apiRouter.post("/scheduler/cron", async (req, res) => {
  const secret = process.env.SCHEDULER_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  const result = await runNow();
  res.json({ success: true, data: result });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/businesses", businessRouter);
apiRouter.use("/instagram", instagramRouter);
apiRouter.use("/google-drive", driveRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/posts", postRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/automations", automationRouter);
