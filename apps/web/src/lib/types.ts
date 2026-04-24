export type Role = "super_admin" | "admin" | "user";

export interface Business {
  _id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface Membership {
  _id: string;
  businessId: Business;
  role: Role;
  status: "active" | "invited" | "disabled";
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  globalRole: Role;
}

export interface MediaAsset {
  _id: string;
  originalName: string;
  driveFileId?: string;
  driveFolderId?: string;
  folderName?: string;
  source: "local" | "google_drive" | "instagram_direct";
  mediaType: "image" | "video";
  workflowStatus: "new" | "scheduled" | "posting" | "live" | "error";
  groupId?: string;
  postType: "single" | "carousel" | "video";
  scheduledTime?: string;
  aiCaption?: string;
  igMediaId?: string;
  likeCount?: number;
  reachCount?: number;
  previewUrl?: string;
  publicUrl?: string;
  driveViewLink?: string;
  driveThumbnailLink?: string;
  createdAt: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  thumbnailLink?: string | null;
  webViewLink?: string | null;
  createdTime?: string | null;
}
