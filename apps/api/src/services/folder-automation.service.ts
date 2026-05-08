import path from "node:path";
import { FolderAutomation } from "../models/FolderAutomation.js";
import { AutomationRun } from "../models/AutomationRun.js";
import { MediaAssetModel as MediaAsset } from "../models/MediaAsset.js";
import { PostDraftModel as PostDraft } from "../models/PostDraft.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { listDriveFiles, ensureDriveThumbnailCached } from "./google-drive.service.js";
import { generateCaptionForCarousel } from "./ai.service.js";
import { suggestSmartTime } from "./smart-timing.service.js";
import { env } from "../config/env.js";
import { suggestHashtagsFromCaption } from "./ai.service.js";

// 1. Main entry: triggered by manual fetch button
export async function runAutomation(automationId: string, triggeredBy: string) {
  const automation = await FolderAutomation.findById(automationId);
  if (!automation) throw new Error("Automation not found");
  if (automation.status === "running") throw new Error("Already running");

  automation.status = "running";
  automation.lastFetchedAt = new Date();
  await automation.save();

  const run = await AutomationRun.create({
    automationId: automation._id,
    businessId: automation.businessId,
    triggeredBy,
  });

  try {
    // a) Fetch new files from Drive + find orphaned (unlinked) existing MediaAssets
    const { newDriveFiles, orphanedAssets } = await fetchNewAndOrphanedFiles(automation);
    run.filesImported = newDriveFiles.length;

    // b) Import truly new files as MediaAssets
    let mediaAssets: any[] = [];
    if (newDriveFiles.length > 0) {
      mediaAssets = await importFilesToMedia(automation, newDriveFiles, triggeredBy);
    }

    // Merge in orphaned assets (already imported but never linked to a PostDraft)
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

    console.log(`[automation] Processing ${mediaAssets.length} assets (${newDriveFiles.length} new, ${orphanedAssets.length} orphaned)`);

    // c) Group files based on groupingMode
    const groups = groupFiles(mediaAssets, automation);
    run.groupsCreated = groups.length;

    // d) For each group: AI caption + hashtags + schedule + create draft
    let scheduledCount = 0;
    for (const group of groups) {
      try {
        // Resolve media paths to absolute filesystem paths for AI service
        const mediaPaths = group.map((a: any) => resolveAssetPath(a));
        const mimeTypes = group.map((a: any) => a.mimeType || "image/jpeg");

        let caption: string;
        let hashtags: string[];

        try {
          const aiResult = await generateCaptionForCarousel({
            mediaPaths,
            mimeTypes,
            brandVoice: automation.brandVoice,
            useEmojis: automation.useEmojis,
          });
          caption = aiResult.caption;
          hashtags = aiResult.hashtags;
        } catch (aiErr: any) {
          // Fallback: generate caption from filenames when AI fails
          console.warn(`[automation] AI caption failed, using fallback: ${aiErr.message}`);
          const names = group.map((a: any) => a.originalName?.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ") || "post");
          caption = `${automation.folderName} ✨\n${names.slice(0, 3).join(" | ")}`;
          hashtags = suggestHashtagsFromCaption(caption);
          run.errorLog.push({ step: "ai_caption_fallback", message: aiErr.message, at: new Date() });
        }

        const scheduledFor = await pickScheduleSlot(automation, scheduledCount);

        await PostDraft.create({
          businessId: automation.businessId,
          instagramAccountId: automation.igAccountId,
          createdBy: triggeredBy,
          mediaAssetIds: group.map((a: any) => a._id),
          title: caption.split("\n")[0].slice(0, 60),
          caption,
          hashtags,
          collaborators: automation.collaborators,
          scheduledFor,
          status: "scheduled",
          postType: group.length > 1 ? "carousel" : (group[0].mediaType === "video" ? "video" : "single"),
          groupId: group[0].groupId,
          aiCaption: caption,
          automationId: automation._id,
        });

        scheduledCount++;
      } catch (err: any) {
        run.errorLog.push({ step: "caption_or_schedule", message: err.message, at: new Date() });
      }
    }

    run.postsScheduled = scheduledCount;
    run.status = "completed";
    run.finishedAt = new Date();
    await run.save();

    return { run, message: `Scheduled ${scheduledCount} posts from ${groups.length} groups` };
  } catch (err: any) {
    run.status = "failed";
    run.finishedAt = new Date();
    run.errorLog.push({ step: "main", message: err.message, at: new Date() });
    await run.save();

    automation.status = "paused";
    await automation.save();
    throw err;
  }
}

// Helper: resolve a MediaAsset's previewUrl/publicUrl to an absolute filesystem path
function resolveAssetPath(asset: any): string {
  // Priority: previewUrl (cached thumbnail), then publicUrl
  const relUrl = asset.previewUrl || asset.publicUrl || "";
  if (!relUrl) return "";

  // Handle /uploads/... web-relative URLs — strip prefix and resolve against upload dir
  if (relUrl.startsWith("/uploads/")) {
    const cleaned = relUrl.replace(/^\/uploads\//, "");
    return path.resolve(process.cwd(), env.UPLOAD_DIR, cleaned);
  }

  // If already absolute filesystem path, return as-is
  if (path.isAbsolute(relUrl)) return relUrl;

  // Otherwise resolve relative to upload dir
  const cleaned = relUrl.replace(/^\//, "");
  return path.resolve(process.cwd(), env.UPLOAD_DIR, cleaned);
}

// 2. Fetch new Drive files + find orphaned (imported but unlinked) existing assets
async function fetchNewAndOrphanedFiles(automation: any): Promise<{ newDriveFiles: any[]; orphanedAssets: any[] }> {
  const connection = await GoogleDriveConnectionModel.findOne({
    businessId: automation.businessId,
    isActive: true,
  }).sort({ updatedAt: -1 });

  if (!connection) throw new Error("Google Drive not connected");

  let allFiles: any[] = [];
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

  const driveFileIds = allFiles.map((f) => f.id).filter(Boolean) as string[];

  const existingAssets = await MediaAsset.find({
    businessId: automation.businessId,
    driveFileId: { $in: driveFileIds },
  });

  const existingIdSet = new Set(existingAssets.map((a) => a.driveFileId));

  // New files = not yet imported as MediaAssets
  const newDriveFiles = allFiles
    .filter((f) => !existingIdSet.has(f.id))
    .map(f => ({ ...f, _connectionId: connection._id.toString() }));

  // Orphaned assets = already imported but NOT linked to any PostDraft
  let orphanedAssets: any[] = [];
  if (existingAssets.length > 0) {
    const existingAssetIds = existingAssets.map(a => a._id);
    // Find which of these assets are already used in a PostDraft
    const linkedDrafts = await PostDraft.find(
      { mediaAssetIds: { $in: existingAssetIds } },
      { mediaAssetIds: 1 }
    ).lean();
    const linkedAssetIds = new Set(
      linkedDrafts.flatMap(d => (d.mediaAssetIds || []).map((id: any) => id.toString()))
    );
    orphanedAssets = existingAssets.filter(a => !linkedAssetIds.has(a._id.toString()));

    if (orphanedAssets.length > 0) {
      console.log(`[automation] Found ${orphanedAssets.length} orphaned assets (imported but no PostDraft)`);
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
      size: file.size ? Number(file.size) : 0,
      source: "google_drive",
      driveFileId: file.id,
      driveFolderId: automation.folderId,
      previewUrl,
      workflowStatus: "new",
      uploadedBy: userId,
    });
    created.push(asset);
  }
  return created;
}

// 4. Group files based on mode
function groupFiles(assets: any[], automation: any) {
  const max = automation.carouselMaxSize || 10;
  let groups: any[][] = [];

  switch (automation.groupingMode) {
    case "subfolder":
      // Group by driveFolderId
      const byFolder = new Map<string, any[]>();
      for (const a of assets) {
        const key = a.driveFolderId || "root";
        if (!byFolder.has(key)) byFolder.set(key, []);
        byFolder.get(key)!.push(a);
      }
      groups = Array.from(byFolder.values());
      break;

    case "filename_prefix":
      // Group by prefix before underscore/number (IMG_001, IMG_002 → "IMG")
      const byPrefix = new Map<string, any[]>();
      for (const a of assets) {
        const match = a.originalName.match(/^([A-Za-z]+)/);
        const key = match ? match[1] : "single_" + a._id;
        if (!byPrefix.has(key)) byPrefix.set(key, []);
        byPrefix.get(key)!.push(a);
      }
      groups = Array.from(byPrefix.values());
      break;

    case "batch_size":
      const size = automation.batchSize || 1;
      for (let i = 0; i < assets.length; i += size) {
        groups.push(assets.slice(i, i + size));
      }
      break;

    case "manual":
    default:
      // Each file = own group
      groups = assets.map((a) => [a]);
      break;
  }

  // Apply carouselMaxSize cap: split groups bigger than max
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

// 5. Pick schedule slot based on cadence
async function pickScheduleSlot(automation: any, indexInBatch: number): Promise<Date> {
  const c = automation.cadence;
  const now = new Date();

  switch (c.type) {
    case "smart":
      const { suggestedFor } = await suggestSmartTime(automation.businessId.toString());
      // Add indexInBatch days to spread multiple posts
      return new Date(suggestedFor.getTime() + indexInBatch * 24 * 60 * 60 * 1000);

    case "interval":
      const hours = c.intervalHours || 24;
      return new Date(now.getTime() + (indexInBatch + 1) * hours * 60 * 60 * 1000);

    case "fixed_time":
      const [h, m] = (c.fixedTime || "11:00").split(":").map(Number);
      const next = new Date(now);
      next.setDate(next.getDate() + indexInBatch + (now.getHours() >= h ? 1 : 0));
      next.setHours(h, m, 0, 0);
      return next;

    case "slots":
      // Distribute across slots day by day
      const slots = c.slots || ["11:00"];
      if (!slots.length) return new Date(now.getTime() + 60 * 60 * 1000);
      const slot = slots[indexInBatch % slots.length];
      const day = Math.floor(indexInBatch / slots.length);
      const [sh, sm] = slot.split(":").map(Number);
      const slotDate = new Date(now);
      slotDate.setDate(slotDate.getDate() + day + (now.getHours() >= sh && now.getMinutes() >= sm && day === 0 ? 1 : 0));
      slotDate.setHours(sh, sm, 0, 0);
      return slotDate;

    default:
      return new Date(now.getTime() + 60 * 60 * 1000);
  }
}

// 6. Called from publish service when a draft completes
export async function handleAutomationDraftCompleted(automationId: string) {
  const remaining = await PostDraft.countDocuments({
    automationId,
    status: { $in: ["scheduled", "posting", "new"] },
  });

  if (remaining > 0) return; // still posts pending

  const automation = await FolderAutomation.findById(automationId);
  if (!automation) return;

  automation.status = "finished";
  automation.finishedAt = new Date();
  await automation.save();

  await triggerNextPendingAutomation(automation.businessId.toString(), automation.createdBy.toString());
}

// 7. Auto-start next pending automation by priority
async function triggerNextPendingAutomation(businessId: string, triggeredBy: string) {
  const next = await FolderAutomation.findOne({
    businessId,
    status: "idle",
  }).sort({ priority: 1, createdAt: 1 });

  if (!next) return;

  console.log(`[automation] Auto-starting next: ${next.folderName}`);
  // Run async, don't await — fire and forget
  runAutomation(next._id.toString(), triggeredBy).catch((err) =>
    console.error(`[automation] Next auto-start failed:`, err)
  );
}

// 8. Preview without saving (for the wizard step 3)
export async function previewAutomation(config: any) {
  const connection = await GoogleDriveConnectionModel.findOne({
    businessId: config.businessId,
    isActive: true,
  }).sort({ updatedAt: -1 });

  if (!connection) throw new Error("Google Drive not connected");

  let allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const res = await listDriveFiles(connection._id.toString(), {
      folderId: config.folderId,
      pageToken,
      pageSize: 100,
    });
    allFiles.push(...res.files);
    pageToken = res.nextPageToken || undefined;
  } while (pageToken);

  const driveFileIds = allFiles.map((f) => f.id).filter(Boolean) as string[];
  const existingAssets = await MediaAsset.find({
    businessId: config.businessId,
    driveFileId: { $in: driveFileIds },
  });
  const existingIdSet = new Set(existingAssets.map((a) => a.driveFileId));

  if (!config.reprocessImported) {
    allFiles = allFiles.filter((f) => !existingIdSet.has(f.id));
  }
  
  const mockAssets = allFiles.map(f => ({
    _id: "mock_" + f.id,
    originalName: f.name || "Untitled",
    driveFolderId: config.folderId,
    mimeType: f.mimeType || "image/jpeg",
    mediaType: (f.mimeType || "").startsWith("video/") ? "video" : "image"
  }));
  
  const groups = groupFiles(mockAssets, config);
  
  const groupsWithSchedule = [];
  for (let i = 0; i < groups.length; i++) {
    const scheduledFor = await pickScheduleSlot(config, i);
    groupsWithSchedule.push({
      files: groups[i].map((a: any) => ({ name: a.originalName, type: a.mediaType })),
      postType: groups[i].length > 1 ? "carousel" : (groups[i][0].mediaType === "video" ? "video" : "single"),
      scheduledFor
    });
  }
  
  return {
    fileCount: mockAssets.length,
    groupCount: groups.length,
    groups: groupsWithSchedule
  };
}
