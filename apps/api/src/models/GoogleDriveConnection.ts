import { Schema, model } from "mongoose";

export interface GoogleDriveConnectionEntity {
  businessId: Schema.Types.ObjectId;
  accountEmail: string;
  folderId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiryDate?: Date;
  isActive: boolean;
}

const googleDriveConnectionSchema = new Schema<GoogleDriveConnectionEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    accountEmail: { type: String, required: true, trim: true, lowercase: true },
    folderId: { type: String, trim: true },
    accessToken: { type: String, trim: true },
    refreshToken: { type: String, trim: true },
    tokenExpiryDate: { type: Date },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const GoogleDriveConnectionModel = model<GoogleDriveConnectionEntity>(
  "GoogleDriveConnection",
  googleDriveConnectionSchema
);
