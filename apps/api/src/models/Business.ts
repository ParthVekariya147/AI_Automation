import { Schema, model } from "mongoose";

export interface BusinessEntity {
  name: string;
  slug: string;
  timezone: string;
  isActive: boolean;
  settings: {
    allowDirectInstagramPosting: boolean;
    defaultMediaSource: "local" | "google_drive";
  };
}

const businessSchema = new Schema<BusinessEntity>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    isActive: { type: Boolean, default: true },
    settings: {
      allowDirectInstagramPosting: { type: Boolean, default: true },
      defaultMediaSource: {
        type: String,
        enum: ["local", "google_drive"],
        default: "local"
      }
    }
  },
  { timestamps: true }
);

export const BusinessModel = model<BusinessEntity>("Business", businessSchema);
