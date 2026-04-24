import { Schema, model } from "mongoose";
import type { Role } from "../types.js";

export interface UserEntity {
  name: string;
  email: string;
  passwordHash: string;
  globalRole: Role;
  isActive: boolean;
}

const userSchema = new Schema<UserEntity>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    globalRole: {
      type: String,
      enum: ["admin"],
      default: "admin"
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const UserModel = model<UserEntity>("User", userSchema);
