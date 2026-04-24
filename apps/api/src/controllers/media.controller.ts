import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Response } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { MediaAssetModel } from "../models/MediaAsset.js";
import { generateInstagramCaptionFromMedia } from "../services/ai.service.js";
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
  workflowStatus: z.enum(["new", "scheduled", "posting", "live", "error"]).optional(),
  groupId: z.string().trim().optional().nullable(),
  postType: z.enum(["single", "carousel", "video"]).optional(),
  scheduledTime: z.string().datetime().optional().nullable(),
  aiCaption: z.string().optional(),
  igMediaId: z.string().optional(),
  likeCount: z.coerce.number().min(0).optional(),
  reachCount: z.coerce.number().min(0).optional()
});

const generateCaptionSchema = z.object({
  businessId: z.string().min(1),
  tone: z.string().trim().max(100).optional()
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

  if (!env.GEMINI_API_KEY) {
    throw new ApiError(400, "GEMINI_API_KEY is missing. Add it in apps/api/.env");
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
      mediaAssetId: asset.id,
      aiCaption: generated.caption,
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
