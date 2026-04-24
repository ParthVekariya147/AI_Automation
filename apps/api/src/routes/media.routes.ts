import { Router } from "express";
import {
  getMediaDetail,
  importFromDrive,
  listMedia,
  updateMediaWorkflow,
  upload,
  uploadMedia
} from "../controllers/media.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const mediaRouter = Router();

mediaRouter.use(requireAuth);
mediaRouter.get("/", requireBusinessRole("admin", "user", "super_admin"), listMedia);
mediaRouter.post(
  "/upload",
  requireBusinessRole("admin", "user", "super_admin"),
  upload.single("file"),
  uploadMedia
);
mediaRouter.post(
  "/import-from-drive",
  requireBusinessRole("admin", "super_admin"),
  importFromDrive
);
mediaRouter.get("/:id", requireBusinessRole("admin", "user", "super_admin"), getMediaDetail);
mediaRouter.patch("/:id", requireBusinessRole("admin", "super_admin"), updateMediaWorkflow);
