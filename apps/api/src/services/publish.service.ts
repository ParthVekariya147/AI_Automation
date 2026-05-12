import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { MediaAssetModel } from "../models/MediaAsset.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { PublishJobModel } from "../models/PublishJob.js";
import { InstagramAccountModel } from "../models/InstagramAccount.js";
import { makeFilePublicForPublish, revokeFilePublicAccess, downloadDriveFileForPublish } from "./google-drive.service.js";
import {
  fetchCollaboratorStatus,
  postCarouselMedia,
  postReelsMedia,
  postSingleMedia,
  postVideoMedia,
  sanitizeCollaborators
} from "./instagram.service.js";
import { fitForInstagramFeed } from "./image-fit.service.js";
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

  const businessId = draft.businessId.toString();

  // Track Drive permissions granted so we can revoke them after publishing
  const grantedPermissions: { connectionId: string; driveFileId: string; permissionId: string }[] = [];

  async function applyImageFit(asset: (typeof mediaAssets)[number], localAbsPath: string, fallbackUrl: string): Promise<string> {
    const publicBase = env.PUBLIC_API_URL;
    if (!publicBase) return fallbackUrl;
    try {
      const cacheDir = path.resolve(process.cwd(), env.UPLOAD_DIR, "fitted-cache", businessId);
      await fs.mkdir(cacheDir, { recursive: true });
      const outPath = path.join(cacheDir, `${asset._id}.jpg`);
      const result = await fitForInstagramFeed(localAbsPath, outPath);
      await MediaAssetModel.findByIdAndUpdate(asset._id, {
        fittedFilePath: outPath,
        fittedPublicUrl: `${publicBase}/uploads/fitted-cache/${businessId}/${asset._id}.jpg`,
        fitDimensions: result,
      });
      return `${publicBase}/uploads/fitted-cache/${businessId}/${asset._id}.jpg`;
    } catch (err) {
      console.warn(`[publish] Image fitting failed for ${asset._id}:`, (err as Error).message);
      return fallbackUrl;
    }
  }

  async function resolvePublishUrl(asset: (typeof mediaAssets)[number]): Promise<string> {
    const publicBase = env.PUBLIC_API_URL;

    if (asset.source === "google_drive" && asset.driveFileId) {
      const connection = await GoogleDriveConnectionModel.findOne({
        businessId,
        isActive: true,
        refreshToken: { $exists: true, $ne: null }
      }).sort({ updatedAt: -1 });

      if (!connection) {
        throw new ApiError(400, "No active Google Drive connection found. Reconnect Drive first.");
      }

      if (asset.mediaType === "image") {
        // Images: always download locally so we can apply fitting
        if (!publicBase) throw new ApiError(400, "PUBLIC_API_URL is not set in .env.");
        const localPath = await downloadDriveFileForPublish(connection.id, businessId, asset.driveFileId, asset.mimeType);
        const absPath = path.resolve(process.cwd(), localPath.replace(/^\//, ""));
        return await applyImageFit(asset, absPath, `${publicBase}${localPath}`);
      }

      // Videos: try public share, fall back to local download
      try {
        const { downloadUrl, permissionId } = await makeFilePublicForPublish(connection.id, asset.driveFileId);
        grantedPermissions.push({ connectionId: connection.id, driveFileId: asset.driveFileId, permissionId });
        return downloadUrl;
      } catch (permErr: any) {
        console.warn("[publish] Could not make Drive file public, falling back to tunnel URL:", permErr?.message);
        if (!publicBase) throw new ApiError(400, "Drive file cannot be made public and PUBLIC_API_URL is not set. Reconnect Google Drive with full permissions.");
        const localPath = await downloadDriveFileForPublish(connection.id, businessId, asset.driveFileId, asset.mimeType);
        return `${publicBase}${localPath}`;
      }
    }

    if (asset.publicUrl?.startsWith("http")) return asset.publicUrl;

    if (!publicBase) throw new ApiError(400, "PUBLIC_API_URL is not set in .env.");
    const relativePath = asset.publicUrl || asset.previewUrl || "";
    if (!relativePath) throw new ApiError(400, `Media asset ${asset._id} has no URL.`);

    if (asset.mediaType === "image") {
      const absPath = path.resolve(process.cwd(), relativePath.replace(/^\//, ""));
      return await applyImageFit(asset, absPath, `${publicBase}${relativePath}`);
    }

    return `${publicBase}${relativePath}`;
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

    // BUG-G: keep linked MediaAssets in sync — PostDraft is the sole publish path
    await MediaAssetModel.updateMany(
      { _id: { $in: draft.mediaAssetIds } },
      { workflowStatus: "live", igMediaId: externalPostId }
    );

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

    // Fire-and-forget: fetch IG thumbnail after publish — never blocks the publish path
    const _draftIdForThumb = draft._id.toString();
    const _postIdForThumb = externalPostId;
    const _tokenForThumb = account.accessToken;
    void (async () => {
      try {
        const thumbRes = await fetch(
          `${env.facebookGraphBaseUrl}/${_postIdForThumb}?fields=media_url,thumbnail_url&access_token=${_tokenForThumb}`
        );
        if (thumbRes.ok) {
          const thumbData = (await thumbRes.json()) as { media_url?: string; thumbnail_url?: string };
          const thumbUrl = thumbData.thumbnail_url || thumbData.media_url;
          if (thumbUrl) {
            await PostDraftModel.findByIdAndUpdate(_draftIdForThumb, {
              livePostThumbnailUrl: thumbUrl,
              livePostFetchedAt: new Date(),
            });
          }
        }
      } catch {
        // thumbnail is cosmetic — silently ignore
      }
    })();

    // If part of automation and this was the last pending draft, finish automation
    if (draft.automationId) {
      const { handleAutomationDraftCompleted } = await import("./folder-automation.service.js");
      await handleAutomationDraftCompleted(draft.automationId.toString());
    }
  } catch (error) {
    draft.retryCount = (draft.retryCount || 0) + 1;
    draft.lastError = error instanceof Error ? error.message : String(error);

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
  } finally {
    // Revoke temporary public Drive permissions regardless of publish outcome
    await Promise.all(
      grantedPermissions.map(({ connectionId, driveFileId, permissionId }) =>
        revokeFilePublicAccess(connectionId, driveFileId, permissionId)
      )
    );
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
