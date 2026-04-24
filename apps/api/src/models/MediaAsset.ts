import { Schema, model } from "mongoose";

export interface MediaAssetEntity {
  businessId: Schema.Types.ObjectId;
  uploadedBy: Schema.Types.ObjectId;
  source: "local" | "google_drive" | "instagram_direct";
  mediaType: "image" | "video";
  originalName: string;
  mimeType: string;
  sizeInBytes: number;
  filePath?: string;
  publicUrl?: string;
  previewUrl?: string;
  driveViewLink?: string;
  driveThumbnailLink?: string;
  folderName?: string;
  driveFileId?: string;
  driveFolderId?: string;
  status: "ready" | "processing" | "failed";
  workflowStatus: "new" | "scheduled" | "posting" | "live" | "error";
  groupId?: string;
  postType: "single" | "carousel" | "video";
  scheduledTime?: Date;
  aiCaption?: string;
  igMediaId?: string;
  likeCount?: number;
  reachCount?: number;
}

const mediaAssetSchema = new Schema<MediaAssetEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: {
      type: String,
      enum: ["local", "google_drive", "instagram_direct"],
      required: true
    },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      required: true
    },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    sizeInBytes: { type: Number, default: 0 },
    filePath: { type: String, trim: true },
    publicUrl: { type: String, trim: true },
    previewUrl: { type: String, trim: true },
    driveViewLink: { type: String, trim: true },
    driveThumbnailLink: { type: String, trim: true },
    folderName: { type: String, trim: true },
    driveFileId: { type: String, trim: true },
    driveFolderId: { type: String, trim: true },
    status: {
      type: String,
      enum: ["ready", "processing", "failed"],
      default: "ready"
    },
    workflowStatus: {
      type: String,
      enum: ["new", "scheduled", "posting", "live", "error"],
      default: "new"
    },
    groupId: { type: String, trim: true },
    postType: {
      type: String,
      enum: ["single", "carousel", "video"],
      default: "single"
    },
    scheduledTime: { type: Date },
    aiCaption: { type: String, trim: true, default: "" },
    igMediaId: { type: String, trim: true },
    likeCount: { type: Number, min: 0, default: 0 },
    reachCount: { type: Number, min: 0, default: 0 }
  },
  { timestamps: true }
);

mediaAssetSchema.pre("validate", function inferPostType(next) {
  if (this.mediaType === "video") {
    this.postType = "video";
  }

  if (this.groupId && this.mediaType === "image") {
    this.postType = "carousel";
  } else if (this.mediaType === "image" && !this.groupId) {
    this.postType = "single";
  }

  next();
});

mediaAssetSchema.index({ businessId: 1, driveFileId: 1 }, { unique: true, sparse: true });

export const MediaAssetModel = model<MediaAssetEntity>("MediaAsset", mediaAssetSchema);
