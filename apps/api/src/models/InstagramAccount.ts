import { Schema, model } from "mongoose";

export interface InstagramAccountEntity {
  businessId: Schema.Types.ObjectId;
  name: string;
  handle: string;
  igUserId?: string;
  pageId?: string;
  accessToken?: string;
  isActive: boolean;
}

const instagramAccountSchema = new Schema<InstagramAccountEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    handle: { type: String, required: true, trim: true },
    igUserId: { type: String, trim: true },
    pageId: { type: String, trim: true },
    accessToken: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const InstagramAccountModel = model<InstagramAccountEntity>(
  "InstagramAccount",
  instagramAccountSchema
);
