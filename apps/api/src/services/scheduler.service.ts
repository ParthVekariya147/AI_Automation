import { PostDraftModel } from "../models/PostDraft.js";
import { MediaAssetModel } from "../models/MediaAsset.js";
import { publishDraftById } from "./publish.service.js";
import { autoPublishMediaAsset, autoPublishCarouselGroup } from "./auto-publish.service.js";

const INTERVAL_MS = 60 * 1000;
const MAX_CONCURRENT = 3;

export function startScheduler() {
  void runOnce();
  setInterval(() => void runOnce(), INTERVAL_MS);
  console.log("[scheduler] Auto-publish scheduler started (checks every 60s)");
}

async function runOnce() {
  await Promise.allSettled([publishDuePosts(), publishDueMediaAssets()]);
}

async function publishDuePosts() {
  try {
    const due = await PostDraftModel.find({
      status: "scheduled",
      scheduledFor: { $lte: new Date() }
    })
      .select("_id title scheduledFor")
      .lean();

    if (!due.length) return;
    console.log(`[scheduler] ${due.length} post draft(s) due`);

    for (let i = 0; i < due.length; i += MAX_CONCURRENT) {
      const batch = due.slice(i, i + MAX_CONCURRENT);
      await Promise.allSettled(
        batch.map(async (draft) => {
          try {
            console.log(`[scheduler] Publishing draft "${draft.title}" (${draft._id})`);
            await publishDraftById(draft._id.toString());
            console.log(`[scheduler] Published draft "${draft.title}" successfully`);
          } catch (err) {
            console.error(`[scheduler] Failed draft "${draft.title}": ${err instanceof Error ? err.message : err}`);
          }
        })
      );
    }
  } catch (err) {
    console.error("[scheduler] Error querying due posts:", err);
  }
}

async function publishDueMediaAssets() {
  try {
    const dueAssets = await MediaAssetModel.find({
      workflowStatus: "scheduled",
      scheduledTime: { $lte: new Date() }
    })
      .select("_id groupId businessId scheduledTime")
      .lean();

    if (!dueAssets.length) return;
    console.log(`[scheduler] ${dueAssets.length} media asset(s) due`);

    // Group by carousel groups, process standalone separately
    const grouped = new Map<string, typeof dueAssets>();
    const standalone: typeof dueAssets = [];

    for (const asset of dueAssets) {
      if (asset.groupId) {
        const key = `${asset.businessId}:${asset.groupId}`;
        const list = grouped.get(key) ?? [];
        list.push(asset);
        grouped.set(key, list);
      } else {
        standalone.push(asset);
      }
    }

    const tasks: Array<() => Promise<void>> = [];

    for (const [key, assets] of grouped) {
      const [businessId, groupId] = key.split(":");
      tasks.push(async () => {
        try {
          await autoPublishCarouselGroup(groupId, businessId);
        } catch (err) {
          console.error(`[scheduler] Failed carousel group ${groupId}: ${err instanceof Error ? err.message : err}`);
        }
      });
    }

    for (const asset of standalone) {
      tasks.push(async () => {
        try {
          await autoPublishMediaAsset(asset._id.toString());
        } catch (err) {
          console.error(`[scheduler] Failed asset ${asset._id}: ${err instanceof Error ? err.message : err}`);
        }
      });
    }

    for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
      await Promise.allSettled(tasks.slice(i, i + MAX_CONCURRENT).map((fn) => fn()));
    }
  } catch (err) {
    console.error("[scheduler] Error querying due media assets:", err);
  }
}
