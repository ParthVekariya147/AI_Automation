type PostType = "single" | "carousel" | "video" | "reel";

const config: Record<PostType, { label: string; icon: string }> = {
  single: { label: "Single", icon: "▣" },
  carousel: { label: "Carousel", icon: "⊞" },
  video: { label: "Video", icon: "▶" },
  reel: { label: "Reel", icon: "⬟" },
};

interface PostTypeIconProps {
  type: PostType;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function PostTypeIcon({ type, showLabel = true, size = "sm" }: PostTypeIconProps) {
  const { label, icon } = config[type] ?? config.single;
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-[0.12em] text-slate-500 ${textSize}`}>
      <span>{icon}</span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
