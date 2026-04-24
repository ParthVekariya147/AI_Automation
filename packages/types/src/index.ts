export type UserRole = "super_admin" | "admin" | "user";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type MediaSource = "local" | "google_drive" | "instagram_direct";
