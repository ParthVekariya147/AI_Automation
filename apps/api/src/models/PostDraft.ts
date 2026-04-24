import { Schema, model } from "mongoose";
import type { PostStatus, PostType } from "../types.js";

export interface PostDraftEntity {
  businessId: Schema.Types.ObjectId;
  instagramAccountId: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
  mediaAssetIds: Schema.Types.ObjectId[];
  title: string;
  caption: string;
  hashtags: string[];
  smartTimingSuggestedFor?: Date;
  scheduledFor?: Date;
  status: PostStatus;
  postType: PostType;
  groupId?: string;
  aiCaption?: string;
  igMediaId?: string;
  likeCount?: number;
  reachCount?: number;
  driveUploadRequested: boolean;
}

const postDraftSchema = new Schema<PostDraftEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    instagramAccountId: {
      type: Schema.Types.ObjectId,
      ref: "InstagramAccount",
      required: true,
      index: true
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mediaAssetIds: [{ type: Schema.Types.ObjectId, ref: "MediaAsset", required: true }],
    title: { type: String, required: true, trim: true },
    caption: { type: String, default: "", trim: true },
    hashtags: [{ type: String, trim: true }],
    smartTimingSuggestedFor: { type: Date },
    scheduledFor: { type: Date },
    status: {
      type: String,
      enum: ["new", "scheduled", "posting", "live", "error"],
      default: "new"
    },
    postType: {
      type: String,
      enum: ["single", "carousel", "video"],
      default: "single"
    },
    groupId: { type: String, trim: true },
    aiCaption: { type: String, trim: true, default: "" },
    igMediaId: { type: String, trim: true },
    likeCount: { type: Number, min: 0, default: 0 },
    reachCount: { type: Number, min: 0, default: 0 },
    driveUploadRequested: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const PostDraftModel = model<PostDraftEntity>("PostDraft", postDraftSchema);
