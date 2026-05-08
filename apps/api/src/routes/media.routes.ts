import { Router } from "express";
import {
  deleteMediaAsset,
  ensureThumbnail,
  generateCarouselCaption,
  generateMediaCaption,
  getMediaDetail,
  importFromDrive,
  listMedia,
  suggestHashtagsForMedia,
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
mediaRouter.post("/generate-carousel-caption", requireBusinessRole("admin"), generateCarouselCaption);
mediaRouter.post("/:id/generate-caption", requireBusinessRole("admin"), generateMediaCaption);
mediaRouter.post("/:id/ensure-thumbnail", requireBusinessRole("admin"), ensureThumbnail);
mediaRouter.post("/:id/suggest-hashtags", requireBusinessRole("admin"), suggestHashtagsForMedia);
mediaRouter.get("/:id", requireBusinessRole("admin"), getMediaDetail);
mediaRouter.patch("/:id", requireBusinessRole("admin"), updateMediaWorkflow);
mediaRouter.delete("/:id", requireBusinessRole("admin"), deleteMediaAsset);
