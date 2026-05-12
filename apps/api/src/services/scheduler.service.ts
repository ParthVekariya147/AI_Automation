import { PostDraftModel } from "../models/PostDraft.js";
import { FolderAutomation } from "../models/FolderAutomation.js";
import { publishDraftById } from "./publish.service.js";
import { hasPendingWork, runAutomation } from "./folder-automation.service.js";

const INTERVAL_MS = 60 * 1000;
const MAX_CONCURRENT = 3;

export function startScheduler() {
  void runNow();
  setInterval(() => void runNow(), INTERVAL_MS);
  console.log("[scheduler] Auto-publish scheduler started (checks every 60s)");
}

export async function runNow(): Promise<{ postsTriggered: number; automationsTriggered: number }> {
  const [postsResult, autoResult] = await Promise.allSettled([
    publishDuePosts(),
    runPendingAutomations(),
  ]);
  return {
    postsTriggered: postsResult.status === "fulfilled" ? postsResult.value : 0,
    automationsTriggered: autoResult.status === "fulfilled" ? autoResult.value : 0,
  };
}

async function publishDuePosts(): Promise<number> {
  try {
    const due = await PostDraftModel.find({
      status: "scheduled",
      scheduledFor: { $lte: new Date() }
    })
      .select("_id title scheduledFor")
      .lean();

    if (!due.length) return 0;
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
    return due.length;
  } catch (err) {
    console.error("[scheduler] Error querying due posts:", err);
    return 0;
  }
}


async function runPendingAutomations(): Promise<number> {
  try {
    // Find all idle automations (not paused) ordered by priority
    const automations = await FolderAutomation.find({
      status: "idle",
    }).sort({ priority: 1, createdAt: 1 });

    if (!automations.length) return 0;

    // Process one automation per scheduler tick (avoid blocking)
    for (const automation of automations) {
      const pending = await hasPendingWork(automation);
      if (!pending) continue;

      console.log(`[scheduler] Auto-running automation "${automation.folderName}" (priority ${automation.priority})`);
      // Fire and forget — the automation sets its own status to "running"
      runAutomation(automation._id.toString(), "scheduler").catch((err) =>
        console.error(`[scheduler] Automation "${automation.folderName}" failed:`, err)
      );
      return 1;
    }
    return 0;
  } catch (err) {
    console.error("[scheduler] Error in runPendingAutomations:", err);
    return 0;
  }
}
