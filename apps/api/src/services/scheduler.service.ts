import { PostDraftModel } from "../models/PostDraft.js";
import { publishDraftById } from "./publish.service.js";

const INTERVAL_MS = 60 * 1000; // every 60 seconds

export function startScheduler() {
  void runOnce();
  setInterval(() => void runOnce(), INTERVAL_MS);
  console.log("[scheduler] Auto-publish scheduler started (checks every 60s)");
}

async function runOnce() {
  try {
    const due = await PostDraftModel.find({
      status: "scheduled",
      scheduledFor: { $lte: new Date() }
    })
      .select("_id title scheduledFor")
      .lean();

    if (!due.length) return;

    console.log(`[scheduler] ${due.length} post(s) due for publishing`);

    for (const draft of due) {
      try {
        console.log(`[scheduler] Publishing "${draft.title}" (${draft._id})`);
        await publishDraftById(draft._id.toString());
        console.log(`[scheduler] Published "${draft.title}" successfully`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Failed to publish "${draft.title}": ${message}`);
      }
    }
  } catch (err) {
    console.error("[scheduler] Error querying due posts:", err);
  }
}
