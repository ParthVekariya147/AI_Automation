import path from "node:path";
import { readFile } from "node:fs/promises";
import { FolderAutomation } from "../models/FolderAutomation.js";
import { AutomationRun } from "../models/AutomationRun.js";
import { MediaAssetModel as MediaAsset } from "../models/MediaAsset.js";
import { PostDraftModel as PostDraft } from "../models/PostDraft.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { listDriveFiles, ensureDriveThumbnailCached } from "./google-drive.service.js";
import { generateInstagramCaptionFromMedia, getGeminiKeyCount, getGeminiAvailableCount, suggestHashtagsFromCaption } from "./ai.service.js";
import { suggestSmartTime } from "./smart-timing.service.js";
import { env } from "../config/env.js";

// 1. Main entry: triggered by manual fetch button or scheduler
export async function runAutomation(automationId: string, triggeredBy: string) {
  const automation = await FolderAutomation.findById(automationId);
  if (!automation) throw new Error("Automation not found");
  if (automation.status === "running") throw new Error("Already running");

  automation.status = "running";
  automation.lastFetchedAt = new Date();
  await automation.save();

  const isSystemTrigger = triggeredBy === "scheduler" || !triggeredBy.match(/^[a-f\d]{24}$/i);
  const run = await AutomationRun.create({
    automationId: automation._id,
    businessId: automation.businessId,
    triggeredBy: isSystemTrigger ? null : triggeredBy,
    triggeredByLabel: isSystemTrigger ? triggeredBy : "user",
  });

  try {
    const { newDriveFiles, orphanedAssets } = await fetchNewAndOrphanedFiles(automation);
    run.filesImported = newDriveFiles.length;

    let mediaAssets: any[] = [];
    if (newDriveFiles.length > 0) {
      mediaAssets = await importFilesToMedia(automation, newDriveFiles, triggeredBy);
    }

    mediaAssets = [...mediaAssets, ...orphanedAssets];

    if (mediaAssets.length === 0) {
      run.status = "completed";
      run.finishedAt = new Date();
      await run.save();
      automation.status = "finished";
      automation.finishedAt = new Date();
      await automation.save();
      await triggerNextPendingAutomation(automation.businessId.toString(), triggeredBy);
      return { run, message: "No new files" };
    }

    console.log(`[automation:${automation._id}] folders=${automation.folderId} files_found=${mediaAssets.length} (${newDriveFiles.length} new, ${orphanedAssets.length} orphaned)`);

    // Generate captions per asset in batches
    await generateCaptionsForBatch(mediaAssets, automation);

    // Group files based on groupingMode
    const groups = groupFiles(mediaAssets, automation);
    run.groupsCreated = groups.length;

    let scheduledCount = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      try {
        // Use first asset's caption for the post (per-asset captions already generated)
        const firstAsset = group[0];
        const caption = firstAsset.aiCaption || "";
        // Merge hashtags from all assets in group, dedupe, take top 15
        const allTags = Array.from(
          new Set(group.flatMap((a: any) => (a.hashtags || []) as string[]))
        ).slice(0, 15);
        const hashtags = allTags.length > 0 ? allTags : suggestHashtagsFromCaption(caption);

        const hasFailed = group.some((a: any) => a.captionStatus === "failed" || a.workflowStatus === "manual_review");
        const scheduledFor = hasFailed ? undefined : await pickScheduleSlot(automation, scheduledCount);

        await PostDraft.create({
          businessId: automation.businessId,
          instagramAccountId: automation.igAccountId,
          createdBy: triggeredBy,
          mediaAssetIds: group.map((a: any) => a._id),
          title: caption.split("\n")[0].slice(0, 60) || automation.folderName,
          caption,
          hashtags,
          collaborators: automation.collaborators,
          scheduledFor,
          status: hasFailed ? "manual_review" : "scheduled",
          postType: group.length > 1 ? "carousel" : (group[0].mediaType === "video" ? "video" : "single"),
          groupId: group[0].groupId,
          aiCaption: caption,
          automationId: automation._id,
        });

        // Update assets to reflect scheduling
        for (const asset of group) {
          if (!hasFailed && asset.captionStatus !== "failed") {
            asset.workflowStatus = "scheduled";
            asset.scheduledTime = scheduledFor;
            await asset.save();
          }
        }

        if (!hasFailed) scheduledCount++;
      } catch (err: any) {
        run.errorLog.push({ step: "schedule_group", message: err.message, at: new Date() });
      }
    }

    run.postsScheduled = scheduledCount;
    run.status = "completed";
    run.finishedAt = new Date();
    await run.save();

    automation.status = "finished";
    automation.finishedAt = new Date();
    automation.lastRunError = undefined;
    await automation.save();

    await triggerNextPendingAutomation(automation.businessId.toString(), triggeredBy);
    return { run, message: `Scheduled ${scheduledCount} posts from ${groups.length} groups` };
  } catch (err: any) {
    run.status = "failed";
    run.finishedAt = new Date();
    run.errorLog.push({ step: "main", message: err.message, at: new Date() });
    await run.save();

    automation.status = "paused";
    automation.lastRunError = err.message ?? String(err);
    await automation.save();
    throw err;
  }
}

// Helper: resolve a MediaAsset's previewUrl/publicUrl to an absolute filesystem path
function resolveAssetPath(asset: any): string {
  const relUrl = asset.previewUrl || asset.publicUrl || "";
  if (!relUrl) return "";

  if (relUrl.startsWith("/uploads/")) {
    const cleaned = relUrl.replace(/^\/uploads\//, "");
    return path.resolve(process.cwd(), env.UPLOAD_DIR, cleaned);
  }

  if (path.isAbsolute(relUrl)) return relUrl;

  const cleaned = relUrl.replace(/^\//, "");
  return path.resolve(process.cwd(), env.UPLOAD_DIR, cleaned);
}

// 2. Fetch new Drive files + orphaned (imported but unlinked) existing assets
async function fetchNewAndOrphanedFiles(automation: any): Promise<{ newDriveFiles: any[]; orphanedAssets: any[] }> {
  const connection = await GoogleDriveConnectionModel.findOne({
    businessId: automation.businessId,
    isActive: true,
  }).sort({ updatedAt: -1 });

  if (!connection) throw new Error("Google Drive not connected");

  let allFiles: any[] = [];

  // Fetch files scoped to automation.folderId only
  let pageToken: string | undefined = undefined;
  do {
    const res = await listDriveFiles(connection._id.toString(), {
      folderId: automation.folderId,
      pageToken,
      pageSize: 100,
    });
    allFiles.push(...res.files);
    pageToken = res.nextPageToken || undefined;
  } while (pageToken);

  console.log(`[automation:${automation._id}] folders=${automation.folderId} files_found=${allFiles.length}`);

  const driveFileIds = allFiles.map((f) => f.id).filter(Boolean) as string[];

  const existingAssets = await MediaAsset.find({
    businessId: automation.businessId,
    driveFileId: { $in: driveFileIds },
  });

  const existingIdSet = new Set(existingAssets.map((a) => a.driveFileId));

  const newDriveFiles = allFiles
    .filter((f) => !existingIdSet.has(f.id))
    .map(f => ({ ...f, _connectionId: connection._id.toString() }));

  let orphanedAssets: any[] = [];
  if (existingAssets.length > 0) {
    const existingAssetIds = existingAssets.map(a => a._id);
    const linkedDrafts = await PostDraft.find(
      { mediaAssetIds: { $in: existingAssetIds } },
      { mediaAssetIds: 1 }
    ).lean();
    const linkedAssetIds = new Set(
      linkedDrafts.flatMap(d => (d.mediaAssetIds || []).map((id: any) => id.toString()))
    );
    orphanedAssets = existingAssets.filter(a => !linkedAssetIds.has(a._id.toString()));

    if (orphanedAssets.length > 0) {
      console.log(`[automation:${automation._id}] Found ${orphanedAssets.length} orphaned assets`);
    }
  }

  return { newDriveFiles, orphanedAssets };
}

// 3. Import to MediaAsset collection
async function importFilesToMedia(automation: any, files: any[], userId: string) {
  const created = [];
  for (const file of files) {
    const mimeType = file.mimeType || "image/jpeg";
    const mediaType = mimeType.startsWith("video/") ? "video" : "image";

    let previewUrl = "";
    if (mediaType === "image") {
      previewUrl = await ensureDriveThumbnailCached(file._connectionId, automation.businessId.toString(), {
        id: file.id,
        mimeType: file.mimeType,
        name: file.name
      }) || "";
    }

    const asset = await MediaAsset.create({
      businessId: automation.businessId,
      originalName: file.name || "Untitled",
      mediaType,
      mimeType,
      sizeInBytes: file.size ? Number(file.size) : 0,
      source: "google_drive",
      driveFileId: file.id,
      driveFolderId: automation.folderId,
      previewUrl,
      workflowStatus: "new",
      captionStatus: "pending",
      failedAttempts: 0,
      automationId: automation._id,
      uploadedBy: userId,
    });
    created.push(asset);
  }
  return created;
}

// 4. Generate captions per asset in parallel batches — no retry, immediate manual_review on failure
async function generateCaptionsForBatch(assets: any[], automation: any): Promise<void> {
  const concurrency = Math.min(Math.max(getGeminiKeyCount(), 1), assets.length, 4);
  const queue = [...assets];

  while (queue.length > 0) {
    // If all keys are rate-limited, mark everything remaining as manual_review immediately
    if (getGeminiAvailableCount() === 0) {
      console.warn(`[automation:${automation._id}] All Gemini keys rate-limited — marking ${queue.length} asset(s) as manual_review`);
      for (const asset of queue) {
        asset.captionStatus = "failed";
        asset.workflowStatus = "manual_review";
        asset.failedReason = "all_api_keys_rate_limited";
        await asset.save();
      }
      return;
    }

    const batch = queue.splice(0, concurrency);

    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        if (asset.mediaType === "video") {
          const name = asset.originalName?.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ") || "post";
          return {
            caption: `${automation.brandVoice || automation.folderName} ✨\n${name}`,
            hashtags: suggestHashtagsFromCaption(name),
          };
        }

        const filePath = resolveAssetPath(asset);
        if (!filePath) throw new Error(`No local path for asset ${asset._id}`);

        const buf = await readFile(filePath);
        return generateInstagramCaptionFromMedia({
          mimeType: asset.mimeType || "image/jpeg",
          mediaBase64: buf.toString("base64"),
          mediaType: "image",
          originalName: asset.originalName || "post",
          tone: automation.brandVoice || undefined,
        });
      })
    );

    for (let i = 0; i < batch.length; i++) {
      const asset = batch[i];
      const r = results[i];
      if (r.status === "fulfilled") {
        asset.aiCaption = r.value.caption;
        asset.hashtags = r.value.hashtags;
        asset.captionStatus = "done";
        asset.failedReason = undefined;
        await asset.save();
      } else {
        const reason = String(r.reason?.message ?? r.reason).slice(0, 300);
        console.warn(`[automation:${automation._id}] Caption failed for ${asset._id}: ${reason}`);
        asset.captionStatus = "failed";
        asset.workflowStatus = "manual_review";
        asset.failedReason = reason;
        await asset.save();
      }
    }

    if (queue.length > 0) await new Promise(r => setTimeout(r, 1_000));
  }
}

// 5. Group files based on mode
function groupFiles(assets: any[], automation: any) {
  const max = automation.carouselMaxSize || 10;
  let groups: any[][] = [];

  const groupingMode = automation.groupingMode;

  switch (groupingMode) {
    case "subfolder": {
      const byFolder = new Map<string, any[]>();
      for (const a of assets) {
        const key = a.driveFolderId || "root";
        if (!byFolder.has(key)) byFolder.set(key, []);
        byFolder.get(key)!.push(a);
      }
      groups = Array.from(byFolder.values());
      break;
    }

    case "batch_size": {
      const size = automation.batchSize || 1;
      for (let i = 0; i < assets.length; i += size) {
        groups.push(assets.slice(i, i + size));
      }
      break;
    }

    case "one_per_file":
    default:
      groups = assets.map((a) => [a]);
      break;
  }

  // Apply carouselMaxSize cap
  const finalGroups: any[][] = [];
  for (const g of groups) {
    if (g.length <= max) {
      finalGroups.push(g);
    } else {
      for (let i = 0; i < g.length; i += max) {
        finalGroups.push(g.slice(i, i + max));
      }
    }
  }

  // Assign shared groupId to multi-image groups
  for (const g of finalGroups) {
    if (g.length > 1) {
      const gid = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      g.forEach((a) => (a.groupId = gid));
    }
  }

  return finalGroups;
}

// 6. Pick schedule slot based on new cadenceMode (with old cadence fallback)
async function pickScheduleSlot(automation: any, indexInBatch: number): Promise<Date> {
  const now = new Date();

  // Read new flat fields first, fall back to old nested cadence for docs not yet migrated
  const cadenceMode = automation.cadenceMode || (automation.cadence?.type === "smart" ? "smart"
    : automation.cadence?.type === "interval" ? "interval"
    : automation.cadence?.type ? "daily_slots"
    : "smart");

  switch (cadenceMode) {
    case "smart": {
      const { suggestedFor } = await suggestSmartTime(automation.businessId.toString());
      return new Date(suggestedFor.getTime() + indexInBatch * 24 * 60 * 60 * 1000);
    }

    case "interval": {
      const value = automation.intervalValue ?? automation.cadence?.intervalHours ?? 24;
      const unit = automation.intervalUnit ?? "hours";
      const ms = unit === "minutes" ? value * 60 * 1000
               : unit === "days"    ? value * 24 * 60 * 60 * 1000
               :                      value * 60 * 60 * 1000; // hours default
      return new Date(now.getTime() + (indexInBatch + 1) * ms);
    }

    case "daily_slots": {
      // New field: dailySlots. Fallback: cadence.slots or [cadence.fixedTime]
      const slots: string[] = automation.dailySlots?.length
        ? automation.dailySlots
        : automation.cadence?.slots?.length
          ? automation.cadence.slots
          : automation.cadence?.fixedTime
            ? [automation.cadence.fixedTime]
            : ["11:00"];

      const slot = slots[indexInBatch % slots.length];
      const day = Math.floor(indexInBatch / slots.length);
      const [sh, sm] = slot.split(":").map(Number);
      const slotDate = new Date(now);
      const bump = (now.getHours() > sh || (now.getHours() === sh && now.getMinutes() >= sm)) && day === 0 ? 1 : 0;
      slotDate.setDate(slotDate.getDate() + day + bump);
      slotDate.setHours(sh, sm, 0, 0);
      return slotDate;
    }

    default:
      return new Date(now.getTime() + 60 * 60 * 1000);
  }
}

// 7. Called from publish service when a draft completes
export async function handleAutomationDraftCompleted(automationId: string) {
  const remaining = await PostDraft.countDocuments({
    automationId,
    status: { $in: ["scheduled", "posting", "new"] },
  });

  if (remaining > 0) return;

  const automation = await FolderAutomation.findById(automationId);
  if (!automation) return;

  automation.status = "finished";
  automation.finishedAt = new Date();
  await automation.save();

  await triggerNextPendingAutomation(automation.businessId.toString(), automation.createdBy.toString());
}

// 8. Check if an automation has work to do
export async function hasPendingWork(automation: any): Promise<boolean> {
  // Check for unscheduled assets from this automation
  const pendingAssets = await MediaAsset.countDocuments({
    automationId: automation._id,
    workflowStatus: "new",
  });
  if (pendingAssets > 0) return true;

  // Check if there are new Drive files to import
  const connection = await GoogleDriveConnectionModel.findOne({
    businessId: automation.businessId,
    isActive: true,
  }).sort({ updatedAt: -1 });
  if (!connection) return false;

  try {
    const res = await listDriveFiles(connection._id.toString(), {
      folderId: automation.folderId,
      pageSize: 10,
    });
    const driveIds = res.files.map((f) => f.id).filter(Boolean) as string[];
    if (driveIds.length === 0) return false;

    const existing = await MediaAsset.countDocuments({
      businessId: automation.businessId,
      driveFileId: { $in: driveIds },
    });
    return existing < driveIds.length;
  } catch {
    return false;
  }
}

// 9. Auto-start next pending automation by priority
async function triggerNextPendingAutomation(businessId: string, triggeredBy: string) {
  const candidates = await FolderAutomation.find({
    businessId,
    status: "idle",
  }).sort({ priority: 1, createdAt: 1 });

  for (const next of candidates) {
    const pending = await hasPendingWork(next);
    if (!pending) continue;

    console.log(`[automation] Auto-starting next: ${next.folderName} (priority ${next.priority})`);
    runAutomation(next._id.toString(), triggeredBy).catch((err) =>
      console.error(`[automation] Next auto-start failed:`, err)
    );
    break;
  }
}

// 10. Preview without saving (for the wizard step 3)
export async function previewAutomation(config: any) {
  const connection = await GoogleDriveConnectionModel.findOne({
    businessId: config.businessId,
    isActive: true,
  }).sort({ updatedAt: -1 });

  if (!connection) throw new Error("Google Drive not connected");

  // Support both folderIds[] (array from wizard) and folderId (single, legacy)
  const folderIds: string[] = config.folderIds?.length
    ? config.folderIds
    : config.folderId
      ? [config.folderId]
      : [];

  if (folderIds.length === 0) throw new Error("No folder selected");

  let allFiles: any[] = [];

  for (const fid of folderIds) {
    let pageToken: string | undefined = undefined;
    do {
      const res = await listDriveFiles(connection._id.toString(), {
        folderId: fid,
        pageToken,
        pageSize: 100,
      });
      allFiles.push(...res.files);
      pageToken = res.nextPageToken || undefined;
    } while (pageToken);
  }

  const totalFound = allFiles.length;
  const driveFileIds = allFiles.map((f) => f.id).filter(Boolean) as string[];

  const existingAssets = await MediaAsset.find({
    businessId: config.businessId,
    driveFileId: { $in: driveFileIds },
  }).lean();
  const existingIdSet = new Set(existingAssets.map((a) => a.driveFileId));
  const alreadyImported = existingIdSet.size;

  if (!config.reprocessImported) {
    allFiles = allFiles.filter((f) => !existingIdSet.has(f.id));
  }

  const newFiles = allFiles.length;

  const mockAssets = allFiles.map(f => ({
    _id: "mock_" + f.id,
    originalName: f.name || "Untitled",
    driveFolderId: folderIds[0],
    mimeType: f.mimeType || "image/jpeg",
    mediaType: (f.mimeType || "").startsWith("video/") ? "video" : "image",
    // Use thumbnailLink from Drive as preview for step 3 display
    previewUrl: f.thumbnailLink || null,
  }));

  const groups = groupFiles(mockAssets, config);

  const groupsWithSchedule = [];
  for (let i = 0; i < groups.length; i++) {
    const scheduledFor = await pickScheduleSlot(config, i);
    groupsWithSchedule.push({
      groupId: `preview_${i}`,
      files: groups[i].map((a: any) => ({
        name: a.originalName,
        mediaType: a.mediaType,
        previewUrl: a.previewUrl || null,
        driveFileId: a._id.replace("mock_", ""),
      })),
      postType: groups[i].length > 1 ? "carousel" : (groups[i][0].mediaType === "video" ? "video" : "single"),
      scheduledFor,
    });
  }

  return {
    totalFound,
    alreadyImported,
    newFiles,
    groupCount: groups.length,
    groups: groupsWithSchedule,
  };
}
