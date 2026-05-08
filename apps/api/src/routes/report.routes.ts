import { Router } from "express";
import { saveReport, saveDevReport } from "../controllers/report.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const reportRouter = Router();

reportRouter.use(requireAuth);
reportRouter.post("/save",       requireBusinessRole("admin"), saveReport);
reportRouter.post("/dev-report", requireAuth,                  saveDevReport);
