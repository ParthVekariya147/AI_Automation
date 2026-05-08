import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import {
  createAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  fetchNow,
  pauseAutomation,
  resumeAutomation,
  listRuns,
  previewBeforeSave,
} from "../controllers/folder-automation.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listAutomations);
router.post("/", createAutomation);
router.post("/preview", previewBeforeSave);
router.patch("/:id", updateAutomation);
router.delete("/:id", deleteAutomation);
router.post("/:id/fetch", fetchNow);
router.post("/:id/pause", pauseAutomation);
router.post("/:id/resume", resumeAutomation);
router.get("/:id/runs", listRuns);

export default router;
