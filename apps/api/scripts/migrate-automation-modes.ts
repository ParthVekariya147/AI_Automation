/**
 * Migration: convert old FolderAutomation groupingMode/cadence values to new schema.
 *
 * Old groupingMode:
 *   "manual" | "filename_prefix" → "one_per_file"
 *   "batch_size" | "subfolder"   → unchanged
 *
 * Old cadence (nested) → new flat fields:
 *   cadence.type = "fixed_time"  → cadenceMode = "daily_slots", dailySlots = [cadence.fixedTime]
 *   cadence.type = "slots"       → cadenceMode = "daily_slots", dailySlots = cadence.slots
 *   cadence.type = "interval"    → cadenceMode = "interval", intervalValue = cadence.intervalHours, intervalUnit = "hours"
 *   cadence.type = "smart"       → cadenceMode = "smart"
 *
 * Run: npx tsx apps/api/scripts/migrate-automation-modes.ts
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: "apps/api/.env" });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGODB_URI!);
  console.log("[migrate] Connected to MongoDB");

  const db = mongoose.connection.db!;
  const col = db.collection("folderautomations");

  const docs = await col.find({}).toArray();
  console.log(`[migrate] Found ${docs.length} automations`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const patch: Record<string, any> = {};

    // ── groupingMode ──────────────────────────────────────────────────────────
    if (doc.groupingMode === "manual" || doc.groupingMode === "filename_prefix") {
      console.log(`[migrate] ${doc._id}: groupingMode "${doc.groupingMode}" → "one_per_file"`);
      patch.groupingMode = "one_per_file";
    }

    // ── cadence → flat fields (only if cadenceMode not already set) ───────────
    if (!doc.cadenceMode && doc.cadence?.type) {
      const c = doc.cadence;
      switch (c.type) {
        case "fixed_time":
          patch.cadenceMode = "daily_slots";
          patch.dailySlots = c.fixedTime ? [c.fixedTime] : ["11:00"];
          break;
        case "slots":
          patch.cadenceMode = "daily_slots";
          patch.dailySlots = Array.isArray(c.slots) ? c.slots : ["11:00"];
          break;
        case "interval":
          patch.cadenceMode = "interval";
          patch.intervalValue = c.intervalHours ?? 24;
          patch.intervalUnit = "hours";
          break;
        case "smart":
        default:
          patch.cadenceMode = "smart";
          break;
      }
      console.log(`[migrate] ${doc._id}: cadence.type "${c.type}" → cadenceMode "${patch.cadenceMode}"`);
    }

    if (Object.keys(patch).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: patch });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`[migrate] Done — updated: ${updated}, skipped (already migrated): ${skipped}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("[migrate] Error:", err);
  process.exit(1);
});
