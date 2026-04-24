import { Schema, model } from "mongoose";
import type { MembershipStatus, Role } from "../types.js";

export interface MembershipEntity {
  businessId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  role: Role;
  status: MembershipStatus;
}

const membershipSchema = new Schema<MembershipEntity>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: ["admin"],
      required: true
    },
    status: {
      type: String,
      enum: ["active", "invited", "disabled"],
      default: "active"
    }
  },
  { timestamps: true }
);

membershipSchema.index({ businessId: 1, userId: 1 }, { unique: true });

export const MembershipModel = model<MembershipEntity>("Membership", membershipSchema);
