import { Schema, model } from "mongoose";

export interface AnalyticsLikeEntity {
  businessId: Schema.Types.ObjectId;
  instagramAccountId: Schema.Types.ObjectId;
  postDraftId: Schema.Types.ObjectId;
  likeCount: number;
  fetchedAt: Date;
}

const analyticsLikeSchema = new Schema<AnalyticsLikeEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    instagramAccountId: {
      type: Schema.Types.ObjectId,
      ref: "InstagramAccount",
      required: true,
      index: true
    },
    postDraftId: { type: Schema.Types.ObjectId, ref: "PostDraft", required: true, index: true },
    likeCount: { type: Number, required: true, min: 0 },
    fetchedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const AnalyticsLikeModel = model<AnalyticsLikeEntity>(
  "AnalyticsLike",
  analyticsLikeSchema
);
