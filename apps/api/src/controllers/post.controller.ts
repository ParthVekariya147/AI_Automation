import type { Response } from "express";
import { z } from "zod";
import { AnalyticsLikeModel } from "../models/AnalyticsLike.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { PublishJobModel } from "../models/PublishJob.js";
import { createAuditLog } from "../services/audit.service.js";
import { suggestHashtagsFromCaption } from "../services/ai.service.js";
import { publishToInstagram } from "../services/instagram.service.js";
import { suggestSmartTime } from "../services/smart-timing.service.js";
import type { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

const draftSchema = z.object({
  businessId: z.string().min(1),
  instagramAccountId: z.string().min(1),
  mediaAssetIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(2),
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  groupId: z.string().optional(),
  postType: z.enum(["single", "carousel", "video"]).optional(),
  aiCaption: z.string().optional(),
  driveUploadRequested: z.boolean().default(false)
});

const scheduleSchema = z.object({
  scheduledFor: z.string().datetime().optional()
});

const likesSchema = z.object({
  businessId: z.string().min(1),
  instagramAccountId: z.string().min(1),
  postDraftId: z.string().min(1),
  likeCount: z.coerce.number().min(0)
});

export const listPosts = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const posts = await PostDraftModel.find({ businessId })
    .populate("instagramAccountId", "name handle")
    .populate("mediaAssetIds", "originalName mediaType source")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: posts });
});

export const createDraft = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = draftSchema.parse(req.body);
  const timing = await suggestSmartTime(payload.businessId);

  const draft = await PostDraftModel.create({
    ...payload,
    createdBy: req.user.id,
    smartTimingSuggestedFor: timing.suggestedFor,
    status: "new"
  });

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: payload.businessId,
    action: "post_draft.created",
    entityType: "PostDraft",
    entityId: draft.id
  });

  res.status(201).json({
    success: true,
    data: {
      draft,
      smartTiming: timing
    }
  });
});

export const suggestHashtags = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const draft = await PostDraftModel.findById(req.params.id);

  if (!draft) {
    throw new ApiError(404, "Post draft not found");
  }

  const hashtags = suggestHashtagsFromCaption(draft.caption);
  draft.hashtags = hashtags;
  await draft.save();

  res.json({
    success: true,
    data: {
      hashtags,
      note: "This is a local placeholder suggestion layer until Gemini is connected."
    }
  });
});

export const schedulePost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const draft = await PostDraftModel.findById(req.params.id);

  if (!draft) {
    throw new ApiError(404, "Post draft not found");
  }

  const payload = scheduleSchema.parse(req.body);
  const smartTiming = await suggestSmartTime(draft.businessId.toString());

  draft.scheduledFor = payload.scheduledFor
    ? new Date(payload.scheduledFor)
    : smartTiming.suggestedFor;
  draft.status = "scheduled";
  draft.smartTimingSuggestedFor = smartTiming.suggestedFor;
  await draft.save();

  const job = await PublishJobModel.create({
    businessId: draft.businessId,
    postDraftId: draft._id,
    status: "queued",
    attempts: 0
  });

  res.json({
    success: true,
    data: {
      draft,
      job,
      smartTiming
    }
  });
});

export const publishPost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const draft = await PostDraftModel.findById(req.params.id);

  if (!draft) {
    throw new ApiError(404, "Post draft not found");
  }

  draft.status = "posting";
  await draft.save();

  const result = await publishToInstagram();

  draft.status = result.status;
  await draft.save();

  await PublishJobModel.findOneAndUpdate(
    { postDraftId: draft._id },
    {
      businessId: draft.businessId,
      postDraftId: draft._id,
      status: "completed",
      attempts: 1,
      processedAt: new Date()
    },
    { upsert: true, new: true }
  );

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: draft.businessId.toString(),
    action: "post.published",
    entityType: "PostDraft",
    entityId: draft.id
  });

  res.json({
    success: true,
    data: {
      draft,
      result
    }
  });
});

export const recordLikeSnapshot = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const payload = likesSchema.parse(req.body);
  const snapshot = await AnalyticsLikeModel.create({
    ...payload,
    fetchedAt: new Date()
  });

  res.status(201).json({ success: true, data: snapshot });
});

export const listLikeAnalytics = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const snapshots = await AnalyticsLikeModel.find({ businessId })
    .sort({ fetchedAt: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, data: snapshots });
});
