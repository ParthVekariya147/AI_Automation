import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFolderAutomation extends Document {
  businessId: Types.ObjectId;
  folderId: string;              // Google Drive folder ID
  folderName: string;
  igAccountId: Types.ObjectId;
  collaborators: string[];       // IG handles without @

  groupingMode: "one_per_file" | "batch_size" | "subfolder";
  batchSize: number;             // used when groupingMode = batch_size
  carouselMaxSize: number;       // default 10, hard cap

  // New flat cadence fields (replaces nested cadence sub-doc)
  cadenceMode: "interval" | "daily_slots" | "smart";
  intervalValue?: number;        // e.g. 5
  intervalUnit?: "minutes" | "hours" | "days";
  dailySlots?: string[];         // ["09:00", "14:00", "18:00"]

  // Legacy cadence sub-doc kept for migration fallback reads
  cadence?: {
    type?: string;
    fixedTime?: string;
    slots?: string[];
    intervalHours?: number;
  };

  captionMode: "auto";
  brandVoice?: string;
  useEmojis: boolean;
  reprocessImported: boolean;

  status: "idle" | "running" | "finished" | "paused" | "manual_review";
  priority: number;              // lower = runs first

  lastFetchedAt?: Date;
  finishedAt?: Date;
  lastRunError?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FolderAutomationSchema = new Schema<IFolderAutomation>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    folderId: { type: String, required: true },
    folderName: { type: String, required: true },
    igAccountId: { type: Schema.Types.ObjectId, ref: "InstagramAccount", required: true },
    collaborators: { type: [String], default: [] },

    groupingMode: { type: String, enum: ["one_per_file", "batch_size", "subfolder"], required: true },
    batchSize: { type: Number, default: 1 },
    carouselMaxSize: { type: Number, default: 10 },

    cadenceMode: { type: String, enum: ["interval", "daily_slots", "smart"], default: "smart" },
    intervalValue: Number,
    intervalUnit: { type: String, enum: ["minutes", "hours", "days"] },
    dailySlots: [String],

    // Legacy sub-doc kept for backward-compat reads during migration
    cadence: {
      type: { type: String },
      fixedTime: String,
      slots: [String],
      intervalHours: Number,
    },

    captionMode: { type: String, default: "auto" },
    brandVoice: String,
    useEmojis: { type: Boolean, default: true },
    reprocessImported: { type: Boolean, default: false },

    status: { type: String, enum: ["idle", "running", "finished", "paused", "manual_review"], default: "idle", index: true },
    priority: { type: Number, default: 100, index: true },

    lastFetchedAt: Date,
    finishedAt: Date,
    lastRunError: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound index for "find next pending automation"
FolderAutomationSchema.index({ businessId: 1, status: 1, priority: 1 });

export const FolderAutomation = mongoose.model<IFolderAutomation>("FolderAutomation", FolderAutomationSchema);
