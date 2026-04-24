import type { Request } from "express";
import type { HydratedDocument, Types } from "mongoose";

export type Role = "super_admin" | "admin" | "user";
export type MembershipStatus = "active" | "invited" | "disabled";
export type MediaSource = "local" | "google_drive" | "instagram_direct";
export type MediaType = "image" | "video";
export type WorkflowStatus = "new" | "scheduled" | "posting" | "live" | "error";
export type PostType = "single" | "carousel" | "video";
export type PostStatus = WorkflowStatus;

export interface AuthUser {
  id: string;
  email: string;
  globalRole: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  membershipRole?: Role;
  businessId?: string;
}

export type ObjectId = Types.ObjectId;
export type MDoc<T> = HydratedDocument<T>;
