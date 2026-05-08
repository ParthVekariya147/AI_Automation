import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFolderAutomation extends Document {
  businessId: Types.ObjectId;
  folderId: string;              // Google Drive folder ID
  folderName: string;
  igAccountId: Types.ObjectId;
  collaborators: string[];       // IG handles without @

  groupingMode: "subfolder" | "filename_prefix" | "manual" | "batch_size";
  batchSize: number;             // used when groupingMode = batch_size
  carouselMaxSize: number;       // default 10, hard cap

  cadence: {
    type: "fixed_time" | "slots" | "smart" | "interval";
    fixedTime?: string;          // "11:00"
    slots?: string[];            // ["09:00", "13:00", "18:00"]
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

    groupingMode: { type: String, enum: ["subfolder", "filename_prefix", "manual", "batch_size"], required: true },
    batchSize: { type: Number, default: 1 },
    carouselMaxSize: { type: Number, default: 10 },

    cadence: {
      type: { type: String, enum: ["fixed_time", "slots", "smart", "interval"], required: true },
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
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound index for "find next pending automation"
FolderAutomationSchema.index({ businessId: 1, status: 1, priority: 1 });

export const FolderAutomation = mongoose.model<IFolderAutomation>("FolderAutomation", FolderAutomationSchema);
