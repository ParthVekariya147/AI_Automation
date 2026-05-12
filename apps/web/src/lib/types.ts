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

export type WorkflowStatus = "new" | "scheduled" | "posting" | "live" | "error" | "manual_review";
export type CaptionStatus = "pending" | "processing" | "done" | "failed";

export interface MediaAsset {
  _id: string;
  originalName: string;
  driveFileId?: string;
  driveFolderId?: string;
  folderName?: string;
  source: "local" | "google_drive" | "instagram_direct";
  mediaType: "image" | "video";
  workflowStatus: WorkflowStatus;
  captionStatus?: CaptionStatus;
  failedAttempts?: number;
  failedReason?: string;
  fittedPublicUrl?: string;
  fitDimensions?: { width: number; height: number; wasFitted: boolean };
  automationId?: string;
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
  status: "new" | "scheduled" | "posting" | "live" | "error" | "manual_review";
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
  lastError?: string;
  automationId?: string;
  livePostThumbnailUrl?: string;
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

export type GroupingMode = "one_per_file" | "batch_size" | "subfolder";
export type CadenceMode = "interval" | "daily_slots" | "smart";
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
  cadenceMode: CadenceMode;
  intervalValue?: number;
  intervalUnit?: "minutes" | "hours" | "days";
  dailySlots?: string[];
  brandVoice?: string;
  useEmojis: boolean;
  reprocessImported: boolean;
  status: AutomationStatus;
  priority: number;
  lastFetchedAt?: string;
  finishedAt?: string;
  lastRunError?: string;
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
  totalFound: number;
  alreadyImported: number;
  newFiles: number;
  groupCount: number;
  groups: {
    groupId: string;
    files: { name: string; mediaType: "image" | "video"; previewUrl: string | null; driveFileId: string }[];
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

