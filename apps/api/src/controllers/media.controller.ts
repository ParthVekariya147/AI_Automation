import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { MediaAssetModel } from "../models/MediaAsset.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { ensureDriveThumbnailCached } from "../services/google-drive.service.js";
import { generateCaptionForCarousel, generateInstagramCaptionFromMedia, suggestHashtagsWithAI } from "../services/ai.service.js";
import { createAuditLog } from "../services/audit.service.js";
import type { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

const importFromDriveSchema = z.object({
  businessId: z.string().min(1),
  driveFileId: z.string().min(1),
  driveFolderId: z.string().optional(),
  folderName: z.string().optional(),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeInBytes: z.coerce.number().default(0),
  previewUrl: z.string().optional(),
  driveViewLink: z.string().optional(),
  driveThumbnailLink: z.string().optional()
});

const updateMediaSchema = z.object({
  workflowStatus: z.enum(["new", "scheduled", "posting", "live", "error", "manual_review"]).optional(),
  groupId: z.string().trim().optional().nullable(),
  postType: z.enum(["single", "carousel", "video", "reel"]).optional(),
  scheduledTime: z.string().datetime().optional().nullable(),
  aiCaption: z.string().optional(),
  igMediaId: z.string().optional(),
  likeCount: z.coerce.number().min(0).optional(),
  reachCount: z.coerce.number().min(0).optional(),
  hashtags: z.array(z.string().trim()).optional()
});

const generateCaptionSchema = z.object({
  businessId: z.string().min(1),
  tone: z.string().trim().max(100).optional()
});

const generateCarouselCaptionSchema = z.object({
  businessId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(1)
});

const MAX_GEMINI_INLINE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: env.UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, safeName);
  }
});

export const upload = multer({ storage });

export const uploadMedia = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.body.businessId;

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  if (!req.file) {
    throw new ApiError(400, "A file is required");
  }

  const mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
  const filePath = path.join(env.UPLOAD_DIR, req.file.filename);

  const asset = await MediaAssetModel.create({
    businessId,
    uploadedBy: req.user.id,
    source: "local",
    mediaType,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeInBytes: req.file.size,
    filePath,
    publicUrl: `/${filePath}`,
    status: "ready"
  });

  await createAuditLog({
    actorUserId: req.user.id,
    businessId,
    action: "media.uploaded",
    entityType: "MediaAsset",
    entityId: asset.id
  });

  res.status(201).json({ success: true, data: asset });
});

export const importFromDrive = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = importFromDriveSchema.parse(req.body);
  const mediaType = payload.mimeType.startsWith("video/") ? "video" : "image";
  let asset = await MediaAssetModel.findOne({
    businessId: payload.businessId,
    driveFileId: payload.driveFileId
  });
  let alreadyImported = Boolean(asset);

  if (!asset) {
    try {
      asset = await MediaAssetModel.create({
        businessId: payload.businessId,
        uploadedBy: req.user.id,
        source: "google_drive",
        mediaType,
        originalName: payload.originalName,
        mimeType: payload.mimeType,
        sizeInBytes: payload.sizeInBytes,
        folderName: payload.folderName,
        previewUrl: payload.previewUrl || payload.driveThumbnailLink || payload.driveViewLink,
        driveViewLink: payload.driveViewLink,
        driveThumbnailLink: payload.driveThumbnailLink,
        driveFileId: payload.driveFileId,
        driveFolderId: payload.driveFolderId,
        status: "ready"
      });
    } catch (error) {
      const duplicateError = error as { code?: number };
      if (duplicateError.code === 11000) {
        alreadyImported = true;
        asset = await MediaAssetModel.findOne({
          businessId: payload.businessId,
          driveFileId: payload.driveFileId
        });
      } else {
        throw error;
      }
    }
  }

  if (!asset) {
    throw new ApiError(500, "Imported asset could not be loaded");
  }

  // Cache Drive thumbnail locally so browser can display it without Google auth
  if (mediaType === "image" && payload.driveFileId) {
    try {
      const connection = await GoogleDriveConnectionModel.findOne({
        businessId: payload.businessId,
        isActive: true,
        refreshToken: { $exists: true, $ne: null }
      }).sort({ updatedAt: -1 });

      if (connection) {
        const cachedUrl = await ensureDriveThumbnailCached(connection.id, payload.businessId, {
          id: payload.driveFileId,
          mimeType: payload.mimeType,
          thumbnailLink: payload.driveThumbnailLink ?? null
        });
        if (cachedUrl) {
          await MediaAssetModel.findByIdAndUpdate(asset._id, { previewUrl: cachedUrl });
          asset.previewUrl = cachedUrl;
        }
      }
    } catch {
      // non-fatal — keep the Drive URL as fallback
    }
  }

  if (!alreadyImported) {
    await createAuditLog({
      actorUserId: req.user.id,
      businessId: payload.businessId,
      action: "media.imported_from_drive",
      entityType: "MediaAsset",
      entityId: asset.id
    });
  }

  res.status(alreadyImported ? 200 : 201).json({
    success: true,
    data: asset,
    meta: {
      alreadyImported
    }
  });
});

export const ensureThumbnail = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  const businessId = req.query.businessId?.toString() || req.body?.businessId;

  if (!businessId) throw new ApiError(400, "businessId is required");

  const asset = await MediaAssetModel.findOne({ _id: id, businessId });
  if (!asset) throw new ApiError(404, "Media asset not found");

  if (asset.source !== "google_drive" || asset.mediaType !== "image" || !asset.driveFileId) {
    return res.json({ success: true, data: { previewUrl: asset.previewUrl } });
  }

  // Already cached locally — nothing to do
  if (asset.previewUrl && !asset.previewUrl.startsWith("http")) {
    return res.json({ success: true, data: { previewUrl: asset.previewUrl } });
  }

  const connection = await GoogleDriveConnectionModel.findOne({
    businessId,
    isActive: true,
    refreshToken: { $exists: true, $ne: null }
  }).sort({ updatedAt: -1 });

  if (!connection) {
    return res.json({ success: true, data: { previewUrl: asset.previewUrl } });
  }

  try {
    const cachedUrl = await ensureDriveThumbnailCached(connection.id, businessId, {
      id: asset.driveFileId,
      mimeType: asset.mimeType,
      thumbnailLink: asset.driveThumbnailLink ?? null
    });

    if (cachedUrl) {
      asset.previewUrl = cachedUrl;
      await asset.save();
    }
  } catch {
    // non-fatal
  }

  res.json({ success: true, data: { previewUrl: asset.previewUrl } });
});

export const listMedia = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const assets = await MediaAssetModel.find({ businessId }).sort({ scheduledTime: 1, createdAt: -1 }).lean();
  res.json({ success: true, data: assets });
});

export const getMediaDetail = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const asset = await MediaAssetModel.findOne({
    _id: req.params.id,
    businessId
  }).lean();

  if (!asset) {
    throw new ApiError(404, "Media asset not found");
  }

  const relatedGroupAssets = asset.groupId
    ? await MediaAssetModel.find({
      businessId,
      groupId: asset.groupId
    })
      .sort({ createdAt: 1 })
      .lean()
    : [];

  res.json({
    success: true,
    data: {
      asset,
      relatedGroupAssets
    }
  });
});

export const updateMediaWorkflow = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.body.businessId || req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const payload = updateMediaSchema.parse(req.body);
  const asset = await MediaAssetModel.findOne({
    _id: req.params.id,
    businessId
  });

  if (!asset) {
    throw new ApiError(404, "Media asset not found");
  }

  if (payload.workflowStatus) {
    asset.workflowStatus = payload.workflowStatus;
  }

  if ("groupId" in payload) {
    asset.groupId = payload.groupId || undefined;
  }

  if (payload.postType) {
    asset.postType = payload.postType;
  }

  if ("scheduledTime" in payload) {
    asset.scheduledTime = payload.scheduledTime ? new Date(payload.scheduledTime) : undefined;
  }

  if (typeof payload.aiCaption === "string") {
    asset.aiCaption = payload.aiCaption;
  }

  if (typeof payload.igMediaId === "string") {
    asset.igMediaId = payload.igMediaId;
  }

  if (typeof payload.likeCount === "number") {
    asset.likeCount = payload.likeCount;
  }

  if (typeof payload.reachCount === "number") {
    asset.reachCount = payload.reachCount;
  }

  if (Array.isArray(payload.hashtags)) {
    asset.hashtags = payload.hashtags;
  }

  await asset.save();

  await createAuditLog({
    actorUserId: req.user.id,
    businessId,
    action: "media.workflow_updated",
    entityType: "MediaAsset",
    entityId: asset.id
  });

  res.json({ success: true, data: asset });
});

export const generateMediaCaption = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (!env.geminiConfigured) {
    throw new ApiError(400, "No Gemini API key found. Add GEMINI_API_KEYS to apps/api/.env");
  }

  const payload = generateCaptionSchema.parse(req.body);

  const asset = await MediaAssetModel.findOne({
    _id: req.params.id,
    businessId: payload.businessId
  });

  if (!asset) {
    throw new ApiError(404, "Media asset not found");
  }

  let mediaBuffer: Buffer | null = null;

  if (asset.filePath) {
    const absolutePath = path.resolve(process.cwd(), asset.filePath);
    mediaBuffer = await readFile(absolutePath);
  } else if (asset.previewUrl?.startsWith("/uploads/")) {
    const relativePath = asset.previewUrl.replace("/uploads/", "");
    const absolutePath = path.resolve(process.cwd(), path.join(env.UPLOAD_DIR, relativePath));
    mediaBuffer = await readFile(absolutePath);
  } else if (asset.previewUrl?.startsWith("http")) {
    const remote = await fetch(asset.previewUrl);
    if (!remote.ok) {
      throw new ApiError(
        400,
        "Media file could not be downloaded for caption generation. Use a local upload or public preview URL."
      );
    }

    const arrayBuffer = await remote.arrayBuffer();
    mediaBuffer = Buffer.from(arrayBuffer);
  }

  if (!mediaBuffer) {
    throw new ApiError(
      400,
      "No accessible media source found. Upload locally or provide a public preview URL first."
    );
  }

  if (mediaBuffer.byteLength > MAX_GEMINI_INLINE_FILE_SIZE_BYTES) {
    throw new ApiError(
      400,
      "Media is too large for inline Gemini analysis. Use a file up to 10MB for caption generation."
    );
  }

  const generated = await generateInstagramCaptionFromMedia({
    mimeType: asset.mimeType,
    mediaBase64: mediaBuffer.toString("base64"),
    mediaType: asset.mediaType,
    originalName: asset.originalName,
    tone: payload.tone
  });

  asset.aiCaption = generated.caption;
  if (generated.hashtags?.length) asset.hashtags = generated.hashtags;
  asset.captionStatus = "done";
  asset.failedAttempts = 0;
  asset.failedReason = undefined;
  if (asset.workflowStatus === "manual_review") asset.workflowStatus = "new";
  await asset.save();

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: payload.businessId,
    action: "media.ai_caption_generated",
    entityType: "MediaAsset",
    entityId: asset.id
  });

  res.json({
    success: true,
    data: {
      asset,
      caption: generated.caption,
      hashtags: generated.hashtags
    }
  });
});

export const generateCarouselCaption = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  if (!env.geminiConfigured) throw new ApiError(400, "No Gemini API key found. Add GEMINI_API_KEYS to apps/api/.env");

  const payload = generateCarouselCaptionSchema.parse(req.body);

  const assets = await MediaAssetModel.find({
    _id: { $in: payload.mediaIds },
    businessId: payload.businessId
  });

  if (!assets.length) throw new ApiError(404, "No media assets found");

  const mediaPaths: string[] = [];
  const mimeTypes: string[] = [];

  for (const asset of assets) {
    if (asset.filePath) {
      mediaPaths.push(asset.filePath);
      mimeTypes.push(asset.mimeType);
    } else if (asset.previewUrl?.startsWith("/uploads/")) {
      const relativePath = asset.previewUrl.replace("/uploads/", "");
      mediaPaths.push(path.join(env.UPLOAD_DIR, relativePath));
      mimeTypes.push(asset.mimeType);
    }
  }

  if (!mediaPaths.length) {
    throw new ApiError(400, "No local media files found for caption generation");
  }

  const generated = await generateCaptionForCarousel({ mediaPaths, mimeTypes });

  const firstAsset = assets[0];
  firstAsset.aiCaption = generated.caption;
  await firstAsset.save();

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: payload.businessId,
    action: "media.ai_caption_generated",
    entityType: "MediaAsset",
    entityId: firstAsset.id
  });

  res.json({
    success: true,
    data: {
      caption: generated.caption,
      hashtags: generated.hashtags
    }
  });
});

export const deleteMediaAsset = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.body.businessId || req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const asset = await MediaAssetModel.findOneAndDelete({
    _id: req.params.id,
    businessId
  });

  if (!asset) {
    throw new ApiError(404, "Media asset not found");
  }

  await createAuditLog({
    actorUserId: req.user.id,
    businessId,
    action: "media.deleted",
    entityType: "MediaAsset",
    entityId: asset.id
  });

  res.json({
    success: true,
    data: {
      _id: asset._id
    }
  });
});

export const suggestHashtagsForMedia = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.body.businessId?.toString() || req.query.businessId?.toString();
  if (!businessId) throw new ApiError(400, "businessId is required");

  const asset = await MediaAssetModel.findOne({ _id: req.params.id, businessId });
  if (!asset) throw new ApiError(404, "Media asset not found");

  const caption = asset.aiCaption?.trim() || asset.originalName;
  const hashtags = await suggestHashtagsWithAI(caption);

  res.json({ success: true, data: { hashtags } });
});
