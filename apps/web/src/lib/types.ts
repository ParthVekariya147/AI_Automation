export type Role = "admin";

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
  postType: "single" | "carousel" | "video" | "reel";
  scheduledTime?: string;
  aiCaption?: string;
  hashtags?: string[];
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
  containsImages: boolean;
  containsVideos: boolean;
  owner?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
  previewUrl?: string | null;
  thumbnailLink?: string | null;
  webViewLink?: string | null;
  createdTime?: string | null;
}

export interface PostDraft {
  _id: string;
  title: string;
  caption: string;
  hashtags?: string[];
  collaborators?: string[];
  status: "new" | "scheduled" | "posting" | "live" | "error";
  postType?: "single" | "carousel" | "video" | "reel";
  scheduledFor?: string; // ISO 8601
  smartTimingSuggestedFor?: string;
  permalink?: string;
  errorLog?: string[];
  igMediaId?: string;
  createdAt: string;
  updatedAt: string;
  needsManualReview?: boolean;
  retryCount?: number;
  automationId?: string;
  instagramAccountId?: {
    _id: string;
    name: string;
    handle: string;
  };
  mediaAssetIds?: Array<{
    _id: string;
    originalName: string;
    mediaType: "image" | "video";
    source: "local" | "google_drive" | "instagram_direct";
    publicUrl?: string;
    previewUrl?: string;
    driveThumbnailLink?: string;
  }>;
}

export type GroupingMode = "subfolder" | "filename_prefix" | "manual" | "batch_size";
export type CadenceType = "fixed_time" | "slots" | "smart" | "interval";
export type AutomationStatus = "idle" | "running" | "finished" | "paused" | "manual_review";

export interface FolderAutomation {
  _id: string;
  businessId: string;
  folderId: string;
  folderName: string;
  igAccountId: { _id: string; handle: string } | string;
  collaborators: string[];
  groupingMode: GroupingMode;
  batchSize: number;
  carouselMaxSize: number;
  cadence: {
    type: CadenceType;
    fixedTime?: string;
    slots?: string[];
    intervalHours?: number;
  };
  brandVoice?: string;
  useEmojis: boolean;
  reprocessImported: boolean;
  status: AutomationStatus;
  priority: number;
  lastFetchedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  _id: string;
  automationId: string;
  startedAt: string;
  finishedAt?: string;
  filesImported: number;
  groupsCreated: number;
  postsScheduled: number;
  status: "running" | "completed" | "failed";
  errorLog: { step: string; message: string; at: string }[];
}

export interface AutomationPreview {
  fileCount: number;
  groupCount: number;
  groups: {
    files: { name: string; mediaType: "image" | "video" }[];
    scheduledFor: string;
    postType: "single" | "carousel" | "video" | "reel";
  }[];
}

export interface InstagramAccount {
  _id: string;
  handle: string;
  igUserId: string;
  pageId?: string;
}

