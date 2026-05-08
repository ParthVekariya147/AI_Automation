import { MediaAssetModel } from "../models/MediaAsset.js";
import { PostDraftModel } from "../models/PostDraft.js";
import { InstagramAccountModel } from "../models/InstagramAccount.js";
import { publishDraftById } from "./publish.service.js";
import { ApiError } from "../utils/api-error.js";

export async function autoPublishMediaAsset(assetId: string): Promise<void> {
  const asset = await MediaAssetModel.findById(assetId);
  if (!asset || asset.workflowStatus !== "scheduled") return;

  const instagramAccount = await InstagramAccountModel.findOne({
    businessId: asset.businessId,
    isActive: true,
    accessToken: { $exists: true, $ne: null },
    igUserId: { $exists: true, $ne: null }
  });

  if (!instagramAccount) {
    asset.workflowStatus = "error";
    await asset.save();
    throw new ApiError(400, `No active Instagram account for business ${asset.businessId}. Connect Instagram first.`);
  }

  // Create ephemeral PostDraft
  const draft = await PostDraftModel.create({
    businessId: asset.businessId,
    instagramAccountId: instagramAccount._id,
    createdBy: asset.uploadedBy,
    mediaAssetIds: [asset._id],
    title: asset.originalName,
    caption: asset.aiCaption || "",
    hashtags: asset.hashtags || [],
    postType: asset.postType,
    groupId: asset.groupId,
    status: "scheduled",
    scheduledFor: asset.scheduledTime,
    driveUploadRequested: false
  });

  asset.workflowStatus = "posting";
  await asset.save();

  try {
    await publishDraftById(draft._id.toString());
    asset.workflowStatus = "live";
    asset.igMediaId = draft.igMediaId;
    await asset.save();
  } catch (error) {
    asset.workflowStatus = "error";
    await asset.save();
    // Clean up ephemeral draft
    await PostDraftModel.findByIdAndDelete(draft._id);
    throw error;
  }
}

export async function autoPublishCarouselGroup(groupId: string, businessId: string): Promise<void> {
  const assets = await MediaAssetModel.find({
    businessId,
    groupId,
    workflowStatus: "scheduled"
  }).sort({ createdAt: 1 });

  if (!assets.length) return;

  const instagramAccount = await InstagramAccountModel.findOne({
    businessId,
    isActive: true,
    accessToken: { $exists: true, $ne: null },
    igUserId: { $exists: true, $ne: null }
  });

  if (!instagramAccount) {
    await MediaAssetModel.updateMany({ businessId, groupId, workflowStatus: "scheduled" }, { workflowStatus: "error" });
    return;
  }

  const representative = assets[0];
  const draft = await PostDraftModel.create({
    businessId,
    instagramAccountId: instagramAccount._id,
    createdBy: representative.uploadedBy,
    mediaAssetIds: assets.map((a) => a._id),
    title: `Carousel: ${groupId}`,
    caption: representative.aiCaption || "",
    hashtags: representative.hashtags || [],
    postType: "carousel",
    groupId,
    status: "scheduled",
    scheduledFor: representative.scheduledTime,
    driveUploadRequested: false
  });

  await MediaAssetModel.updateMany({ businessId, groupId, workflowStatus: "scheduled" }, { workflowStatus: "posting" });

  try {
    await publishDraftById(draft._id.toString());
    const result = await PostDraftModel.findById(draft._id).lean();
    await MediaAssetModel.updateMany(
      { businessId, groupId, workflowStatus: "posting" },
      { workflowStatus: "live", igMediaId: result?.igMediaId }
    );
  } catch (error) {
    await MediaAssetModel.updateMany({ businessId, groupId, workflowStatus: "posting" }, { workflowStatus: "error" });
    await PostDraftModel.findByIdAndDelete(draft._id);
    throw error;
  }
}
