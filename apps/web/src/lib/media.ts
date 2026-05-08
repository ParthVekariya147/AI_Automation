import type { MediaAsset } from "./types";

const apiBaseUrl = (() => {
  if (import.meta.env.VITE_API_URL) {
    try {
      return new URL(import.meta.env.VITE_API_URL).origin;
    } catch {
      return "http://localhost:4000";
    }
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:4000`;
  }
  return "http://localhost:4000";
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

export function toInputDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value as string);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatRelativeTime(value?: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value as string);
  if (isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  const minutes = Math.floor(absDiff / 60_000);
  const hours = Math.floor(absDiff / 3_600_000);
  const days = Math.floor(absDiff / 86_400_000);

  let label: string;
  if (minutes < 1) {
    label = "just now";
  } else if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    label = `${hours}h ${minutes % 60}m`;
  } else {
    label = `${days}d`;
  }

  return isPast ? `${label} ago` : `in ${label}`;
}

export type WorkflowStatus = "new" | "scheduled" | "posting" | "live" | "error";

export function getStatusColor(status: WorkflowStatus) {
  return {
    new: { ring: "ring-slate-300", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
    scheduled: { ring: "ring-amber-300", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    posting: { ring: "ring-blue-300", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
    live: { ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    error: { ring: "ring-red-300", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  }[status] ?? { ring: "ring-slate-300", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
}
