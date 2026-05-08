import type { Response } from "express";
import { z } from "zod";
import { FolderAutomation } from "../models/FolderAutomation.js";
import { AutomationRun } from "../models/AutomationRun.js";
import { runAutomation, previewAutomation } from "../services/folder-automation.service.js";
import type { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

const createSchema = z.object({
  businessId: z.string(),
  folderIds: z.array(z.string()).min(1),    // multi-folder support
  folderNames: z.array(z.string()).min(1),
  igAccountId: z.string(),
  collaborators: z.array(z.string()).default([]),
  groupingMode: z.enum(["subfolder", "filename_prefix", "manual", "batch_size"]),
  batchSize: z.number().default(1),
  carouselMaxSize: z.number().default(10),
  cadence: z.object({
    type: z.enum(["fixed_time", "slots", "smart", "interval"]),
    fixedTime: z.string().optional(),
    slots: z.array(z.string()).optional(),
    intervalHours: z.number().optional(),
  }),
  brandVoice: z.string().optional(),
  useEmojis: z.boolean().default(true),
  reprocessImported: z.boolean().default(false),
  priority: z.number().default(100),
});

const updateSchema = createSchema.partial().omit({ folderIds: true, folderNames: true, businessId: true });

// POST /automations  — supports creating one OR many (one per folderId)
export const createAutomation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const data = createSchema.parse(req.body);
  const userId = req.user.id;

  const created = [];
  for (let i = 0; i < data.folderIds.length; i++) {
    const automation = await FolderAutomation.create({
      ...data,
      folderId: data.folderIds[i],
      folderName: data.folderNames[i],
      createdBy: userId,
    });
    created.push(automation);
  }

  res.status(201).json({ data: created });
});

// GET /automations?businessId=...
export const listAutomations = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const { businessId } = req.query;
  const items = await FolderAutomation.find({ businessId })
    .populate("igAccountId", "handle")
    .sort({ priority: 1, createdAt: -1 });
  res.json({ data: items });
});

// PATCH /automations/:id
export const updateAutomation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const data = updateSchema.parse(req.body);
  const updated = await FolderAutomation.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!updated) throw new ApiError(404, "Not found");
  res.json({ data: updated });
});

// DELETE /automations/:id
export const deleteAutomation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  await FolderAutomation.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// POST /automations/:id/fetch  — manual trigger
export const fetchNow = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const userId = req.user.id;
  const result = await runAutomation(req.params.id as string, userId);
  res.json({ data: result });
});

// POST /automations/:id/pause
export const pauseAutomation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const updated = await FolderAutomation.findByIdAndUpdate(req.params.id, { status: "paused" }, { new: true });
  res.json({ data: updated });
});

// POST /automations/:id/resume
export const resumeAutomation = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const updated = await FolderAutomation.findByIdAndUpdate(req.params.id, { status: "idle" }, { new: true });
  res.json({ data: updated });
});

// GET /automations/:id/runs
export const listRuns = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const runs = await AutomationRun.find({ automationId: req.params.id })
    .sort({ startedAt: -1 })
    .limit(50);
  res.json({ data: runs });
});

// POST /automations/preview  — dry-run before saving
export const previewBeforeSave = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new ApiError(401, "Authentication required");
  const result = await previewAutomation(req.body);
  res.json({ data: result });
});
