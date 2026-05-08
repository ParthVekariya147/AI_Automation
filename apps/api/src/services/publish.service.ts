import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { MediaAssetModel } from "../models/MediaAsset.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { PublishJobModel } from "../models/PublishJob.js";
import { InstagramAccountModel } from "../models/InstagramAccount.js";
import { downloadDriveFileForPublish } from "./google-drive.service.js";
import {
  fetchCollaboratorStatus,
  postCarouselMedia,
  postReelsMedia,
  postSingleMedia,
  postVideoMedia,
  sanitizeCollaborators
} from "./instagram.service.js";
import { ApiError } from "../utils/api-error.js";

export async function publishDraftById(
  draftId: string,
  actorUserId?: string
): Promise<{ externalPostId: string; permalink: string }> {
  const draft = await PostDraftModel.findById(draftId);
  if (!draft) throw new ApiError(404, "Post draft not found");

  const account = await InstagramAccountModel.findById(draft.instagramAccountId);
  if (!account?.accessToken || !account?.igUserId) {
    throw new ApiError(400, "Instagram account is not fully connected");
  }

  const mediaAssets = await MediaAssetModel.find({ _id: { $in: draft.mediaAssetIds } });
  if (!mediaAssets.length) throw new ApiError(400, "No media assets found for this draft");

  if (!env.PUBLIC_API_URL) {
    throw new ApiError(
      400,
      "PUBLIC_API_URL is not set in .env. Set it to your tunnel URL (e.g. https://abc.trycloudflare.com)."
    );
  }

  const publicBase = env.PUBLIC_API_URL;
  const businessId = draft.businessId.toString();

  async function resolvePublishUrl(asset: (typeof mediaAssets)[number]): Promise<string> {
    if (asset.publicUrl?.startsWith("http")) {
      // Re-base tunnel URLs so stale trycloudflare.com hostnames are replaced with the current tunnel
      try {
        const stored = new URL(asset.publicUrl);
        if (stored.hostname.endsWith("trycloudflare.com")) {
          return `${publicBase}${stored.pathname}`;
        }
      } catch {
        // not a valid URL, fall through
      }
      return asset.publicUrl;
    }

    if (asset.source === "google_drive" && asset.driveFileId) {
      const connection = await GoogleDriveConnectionModel.findOne({
        businessId,
        isActive: true,
        refreshToken: { $exists: true, $ne: null }
      }).sort({ updatedAt: -1 });

      if (!connection) {
        throw new ApiError(400, "No active Google Drive connection found. Reconnect Drive first.");
      }

      const localPath = await downloadDriveFileForPublish(
        connection.id,
        businessId,
        asset.driveFileId,
        asset.mimeType
      );
      return `${publicBase}${localPath}`;
    }

    const relativePath = asset.publicUrl || asset.previewUrl || "";
    if (!relativePath) throw new ApiError(400, `Media asset ${asset._id} has no URL.`);
    return relativePath.startsWith("http") ? relativePath : `${publicBase}${relativePath}`;
  }

  draft.status = "posting";
  await draft.save();

  const captionWithHashtags = `${draft.caption}\n\n${draft.hashtags.join(" ")}`.trim();
  const collaborators = draft.collaborators?.length
    ? sanitizeCollaborators(draft.collaborators)
    : undefined;

  let externalPostId: string;
  let permalink: string;

  try {
    if (draft.postType === "reel") {
      const videoAsset = mediaAssets.find((m) => m.mediaType === "video");
      if (!videoAsset) throw new ApiError(400, "No video asset found for Reel");
      const url = await resolvePublishUrl(videoAsset);
      ({ externalPostId, permalink } = await postReelsMedia(
        account.igUserId, account.accessToken, url, captionWithHashtags, collaborators
      ));
    } else if (draft.postType === "video") {
      const videoAsset = mediaAssets.find((m) => m.mediaType === "video");
      if (!videoAsset) throw new ApiError(400, "No video asset found");
      const url = await resolvePublishUrl(videoAsset);
      ({ externalPostId, permalink } = await postVideoMedia(
        account.igUserId, account.accessToken, url, captionWithHashtags, collaborators
      ));
    } else if (draft.postType === "carousel" || mediaAssets.length > 1) {
      const urls = await Promise.all(mediaAssets.map(resolvePublishUrl));
      ({ externalPostId, permalink } = await postCarouselMedia(
        account.igUserId, account.accessToken, urls, captionWithHashtags, collaborators
      ));
    } else {
      const url = await resolvePublishUrl(mediaAssets[0]);
      ({ externalPostId, permalink } = await postSingleMedia(
        account.igUserId, account.accessToken, url, captionWithHashtags, collaborators
      ));
    }

    draft.status = "live";
    draft.igMediaId = externalPostId;
    draft.permalink = permalink;

    if (collaborators?.length) {
      try {
        const collabStatuses = await fetchCollaboratorStatus(externalPostId, account.accessToken);
        console.log("[IG] Collaborator status after publish:", JSON.stringify(collabStatuses));
        draft.collaboratorStatus = collabStatuses.map((s) => ({ ...s, checkedAt: new Date() }));
      } catch (e) {
        console.warn("[IG] Could not fetch collaborator status:", e);
      }
    }

    await draft.save();

    // If part of automation and this was the last pending draft, finish automation
    if (draft.automationId) {
      const { handleAutomationDraftCompleted } = await import("./folder-automation.service.js");
      await handleAutomationDraftCompleted(draft.automationId.toString());
    }
  } catch (error) {
    draft.retryCount = (draft.retryCount || 0) + 1;

    if (draft.retryCount < 2) {
      // Reschedule +5min, keep status as "scheduled"
      draft.status = "scheduled";
      draft.scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
      await draft.save();
      console.warn(`[publish] Draft ${draftId} failed (attempt ${draft.retryCount}/2), retrying in 5min`);
    } else {
      // Max retries hit → manual review
      draft.status = "error";
      draft.needsManualReview = true;
      await draft.save();

      // If part of automation, pause it
      if (draft.automationId) {
        const { FolderAutomation } = await import("../models/FolderAutomation.js");
        await FolderAutomation.findByIdAndUpdate(draft.automationId, {
          status: "manual_review",
        });
      }
      console.error(`[publish] Draft ${draftId} failed after 2 retries, moved to manual review`);
    }

    throw error;
  }

  await PublishJobModel.findOneAndUpdate(
    { postDraftId: draft._id },
    {
      businessId: draft.businessId,
      postDraftId: draft._id,
      status: "completed",
      attempts: 1,
      processedAt: new Date(),
      ...(actorUserId ? { actorUserId } : {})
    },
    { upsert: true, new: true }
  );

  return { externalPostId, permalink };
}
