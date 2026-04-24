import { Router } from "express";
import {
  deleteMediaAsset,
  generateMediaCaption,
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
mediaRouter.get("/", requireBusinessRole("admin"), listMedia);
mediaRouter.post(
  "/upload",
  requireBusinessRole("admin"),
  upload.single("file"),
  uploadMedia
);
mediaRouter.post("/import-from-drive", requireBusinessRole("admin"), importFromDrive);
mediaRouter.post("/:id/generate-caption", requireBusinessRole("admin"), generateMediaCaption);
mediaRouter.get("/:id", requireBusinessRole("admin"), getMediaDetail);
mediaRouter.patch("/:id", requireBusinessRole("admin"), updateMediaWorkflow);
mediaRouter.delete("/:id", requireBusinessRole("admin"), deleteMediaAsset);
