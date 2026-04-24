import { Schema, model } from "mongoose";

export interface PublishJobEntity {
  businessId: Schema.Types.ObjectId;
  postDraftId: Schema.Types.ObjectId;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  lastError?: string;
  processedAt?: Date;
}

const publishJobSchema = new Schema<PublishJobEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    postDraftId: { type: Schema.Types.ObjectId, ref: "PostDraft", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued"
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, trim: true },
    processedAt: { type: Date }
  },
  { timestamps: true }
);

export const PublishJobModel = model<PublishJobEntity>("PublishJob", publishJobSchema);
