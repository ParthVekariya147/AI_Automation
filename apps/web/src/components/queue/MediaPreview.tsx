import type { MediaAsset } from "../../lib/types";
import { getMediaPreviewUrl } from "../../lib/media";

interface MediaPreviewProps {
  asset: MediaAsset;
  className?: string;
  objectFit?: "cover" | "contain";
}

export function MediaPreview({ asset, className = "h-full w-full", objectFit = "cover" }: MediaPreviewProps) {
  const url = getMediaPreviewUrl(asset);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-[#eef1ea] text-xs font-medium uppercase tracking-wider text-slate-500 ${className}`}>
        No preview
      </div>
    );
  }

  if (asset.mediaType === "video") {
    return (
      <video
        src={url}
        className={`${className} ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
        muted
        playsInline
      />
    );
  }

  return (
    <img
      src={url}
      alt={asset.originalName}
      className={`${className} ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
    />
  );
}
