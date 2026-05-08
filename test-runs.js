import mongoose from "mongoose";
import { env } from "./apps/api/src/config/env.js";
import { AutomationRun } from "./apps/api/src/models/AutomationRun.js";
import { FolderAutomation } from "./apps/api/src/models/FolderAutomation.js";

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ai-automation");
  const runs = await AutomationRun.find().sort({startedAt:-1}).limit(5);
  console.log("Recent Runs:", runs.map(r => ({status: r.status, filesImported: r.filesImported, groupsCreated: r.groupsCreated, postsScheduled: r.postsScheduled, errors: r.errorLog})));
  process.exit(0);
}
check().catch(console.error);
