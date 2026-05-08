import type { Response } from "express";
import { z } from "zod";
import { AnalyticsLikeModel } from "../models/AnalyticsLike.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { PublishJobModel } from "../models/PublishJob.js";
import { createAuditLog } from "../services/audit.service.js";
import { suggestHashtagsWithAI } from "../services/ai.service.js";
import { publishDraftById } from "../services/publish.service.js";
import { fetchCollaboratorStatus } from "../services/instagram.service.js";
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
  postType: z.enum(["single", "carousel", "video", "reel"]).optional(),
  aiCaption: z.string().optional(),
  collaborators: z.array(z.string()).default([]),
  driveUploadRequested: z.boolean().default(false),
  scheduledFor: z.string().datetime().optional()
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
    .populate("mediaAssetIds", "originalName mediaType source publicUrl previewUrl driveThumbnailLink")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: posts });
});

export const createDraft = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = draftSchema.parse(req.body);
  const [timing, aiHashtags] = await Promise.all([
    suggestSmartTime(payload.businessId),
    payload.caption ? suggestHashtagsWithAI(payload.caption) : Promise.resolve([])
  ]);

  const isScheduled = Boolean(payload.scheduledFor);

  const draft = await PostDraftModel.create({
    ...payload,
    hashtags: payload.hashtags?.length ? payload.hashtags : aiHashtags,
    createdBy: req.user.id,
    smartTimingSuggestedFor: timing.suggestedFor,
    scheduledFor: payload.scheduledFor ? new Date(payload.scheduledFor) : undefined,
    status: isScheduled ? "scheduled" : "new"
  });

  if (isScheduled) {
    await PublishJobModel.create({
      businessId: draft.businessId,
      postDraftId: draft._id,
      status: "queued",
      attempts: 0
    });
  }

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
  if (!draft) throw new ApiError(404, "Post draft not found");

  const hashtags = await suggestHashtagsWithAI(draft.caption);
  draft.hashtags = hashtags;
  await draft.save();

  res.json({ success: true, data: { hashtags } });
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
  if (!req.user) throw new ApiError(401, "Authentication required");

  const draftId = String(req.params.id);
  const result = await publishDraftById(draftId, String(req.user.id));

  const draft = await PostDraftModel.findById(draftId).lean();

  await createAuditLog({
    actorUserId: String(req.user.id),
    businessId: draft!.businessId.toString(),
    action: "post.published",
    entityType: "PostDraft",
    entityId: draftId
  });

  res.json({ success: true, data: { draft, result } });
});

export const deletePost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");

  const draft = await PostDraftModel.findById(req.params.id);
  if (!draft) throw new ApiError(404, "Post draft not found");

  await draft.deleteOne();

  await createAuditLog({
    actorUserId: String(req.user.id),
    businessId: draft.businessId.toString(),
    action: "post_draft.deleted",
    entityType: "PostDraft",
    entityId: String(req.params.id)
  });

  res.json({ success: true });
});

export const updatePost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const updateSchema = z.object({
    title: z.string().min(2).optional(),
    caption: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    collaborators: z.array(z.string()).optional(),
    scheduledFor: z.string().datetime().nullable().optional()
  });

  const payload = updateSchema.parse(req.body);
  const draft = await PostDraftModel.findById(req.params.id);
  if (!draft) throw new ApiError(404, "Post draft not found");

  if (payload.title !== undefined) draft.title = payload.title;
  if (payload.caption !== undefined) draft.caption = payload.caption;
  if (payload.hashtags !== undefined) draft.hashtags = payload.hashtags;
  if (payload.collaborators !== undefined) draft.collaborators = payload.collaborators;

  if (payload.scheduledFor !== undefined) {
    if (payload.scheduledFor === null) {
      draft.scheduledFor = undefined;
      if (draft.status === "scheduled") draft.status = "new";
    } else {
      draft.scheduledFor = new Date(payload.scheduledFor);
      draft.status = "scheduled";
    }
  }

  await draft.save();
  res.json({ success: true, data: draft });
});

export const getCollaboratorStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const draft = await PostDraftModel.findById(req.params.id);
  if (!draft) throw new ApiError(404, "Post draft not found");
  if (!draft.igMediaId) throw new ApiError(400, "Post has not been published yet");

  const account = await (await import("../models/InstagramAccount.js")).InstagramAccountModel.findById(draft.instagramAccountId);
  if (!account?.accessToken) throw new ApiError(400, "Instagram account is not fully connected");

  const statuses = await fetchCollaboratorStatus(draft.igMediaId, account.accessToken);

  draft.collaboratorStatus = statuses.map((s) => ({ ...s, checkedAt: new Date() }));
  await draft.save();

  res.json({ success: true, data: draft.collaboratorStatus });
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
