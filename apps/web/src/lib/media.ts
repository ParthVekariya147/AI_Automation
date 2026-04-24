import type { MediaAsset } from "./types";

const apiBaseUrl = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
  try {
    return new URL(apiUrl).origin;
  } catch {
    return "http://localhost:4000";
  }
})();

export function resolveApiAssetUrl(url?: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${apiBaseUrl}${url}`;
}

export function getMediaPreviewUrl(asset: MediaAsset) {
  if (asset.previewUrl) {
    return resolveApiAssetUrl(asset.previewUrl);
  }

  if (asset.driveThumbnailLink) {
    return asset.driveThumbnailLink;
  }

  if (asset.publicUrl?.startsWith("http")) {
    return asset.publicUrl;
  }

  if (asset.publicUrl) {
    return `${apiBaseUrl}${asset.publicUrl}`;
  }

  return "";
}

export function getMediaOpenUrl(asset: MediaAsset) {
  if (asset.driveViewLink) {
    return asset.driveViewLink;
  }

  if (asset.previewUrl) {
    return resolveApiAssetUrl(asset.previewUrl);
  }

  if (asset.publicUrl?.startsWith("http")) {
    return asset.publicUrl;
  }

  if (asset.publicUrl) {
    return `${apiBaseUrl}${asset.publicUrl}`;
  }

  return getMediaPreviewUrl(asset);
}

export function formatSchedule(value?: string) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}
