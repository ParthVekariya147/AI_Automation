import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAutomationRun extends Document {
  automationId: Types.ObjectId;
  businessId: Types.ObjectId;
  triggeredBy: Types.ObjectId | null;
  triggeredByLabel: string;
  startedAt: Date;
  finishedAt?: Date;
  filesImported: number;
  groupsCreated: number;
  postsScheduled: number;
  status: "running" | "completed" | "failed";
  errorLog: { step: string; message: string; at: Date }[];
}

const AutomationRunSchema = new Schema<IAutomationRun>(
  {
    automationId: { type: Schema.Types.ObjectId, ref: "FolderAutomation", required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    triggeredByLabel: { type: String, default: "scheduler" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    filesImported: { type: Number, default: 0 },
    groupsCreated: { type: Number, default: 0 },
    postsScheduled: { type: Number, default: 0 },
    status: { type: String, enum: ["running", "completed", "failed"], default: "running" },
    errorLog: [
      {
        step: String,
        message: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const AutomationRun = mongoose.model<IAutomationRun>("AutomationRun", AutomationRunSchema);
