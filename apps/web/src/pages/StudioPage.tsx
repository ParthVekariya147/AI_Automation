import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/queue/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { getMediaPreviewUrl, resolveApiAssetUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, Icons } from "../lib/ds";

type Stage = "media" | "draft" | "scheduled" | "live";

const STAGE_META: Record<Stage, { label: string; icon: React.ReactNode; emptyLabel: string; emptyAction?: string }> = {
  media:     { label: "Media",     icon: <Icons.Image size={15} />,       emptyLabel: "No imported media yet",         emptyAction: "Import from Drive" },
  draft:     { label: "Drafts",    icon: <Icons.Edit size={15} />,        emptyLabel: "No drafts yet",                 emptyAction: "Create a post" },
  scheduled: { label: "Scheduled", icon: <Icons.Calendar size={15} />,    emptyLabel: "No scheduled posts",            emptyAction: "Schedule a draft" },
  live:      { label: "Live",      icon: <Icons.CircleCheck size={15} />, emptyLabel: "Nothing published yet",         emptyAction: undefined },
};

type DraftMediaItem = { _id: string; originalName: string; mediaType: "image" | "video"; source: string; publicUrl?: string; previewUrl?: string; driveThumbnailLink?: string };

function mediaThumb(asset: MediaAsset | DraftMediaItem): string {
  if ("previewUrl" in asset) {
    if (asset.previewUrl?.startsWith("http")) return asset.previewUrl;
    if (asset.previewUrl) return resolveApiAssetUrl(asset.previewUrl);
  }
  if ("driveThumbnailLink" in asset && asset.driveThumbnailLink) return asset.driveThumbnailLink;
  return "";
}

function postThumb(post: PostDraft, allMedia: MediaAsset[]): string {
  if (post.status === "live" && post.livePostThumbnailUrl) return post.livePostThumbnailUrl;
  const firstId = post.mediaAssetIds?.[0]?._id;
  if (firstId) {
    const full = allMedia.find((m) => m._id === firstId);
    if (full) return getMediaPreviewUrl(full);
  }
  const m = post.mediaAssetIds?.[0];
  if (!m) return "";
  return mediaThumb(m);
}

function Thumb({ src, size = "md" }: { src: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "size-10" : size === "lg" ? "size-16" : "size-12";
  return (
    <div
      className={`${dim} shrink-0 rounded-xl overflow-hidden`}
      style={{ background: "var(--bg-2)" }}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Icons.Image size={16} style={{ color: "var(--line-2)" } as React.CSSProperties} />
        </div>
      )}
    </div>
  );
}

function PostTypeBadge({ type }: { type?: string }) {
  const map: Record<string, string> = { carousel: "Carousel", reel: "Reel", video: "Video", single: "Photo" };
  if (!type) return null;
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "var(--bg-2)", color: "var(--muted)" }}
    >
      {map[type] ?? type}
    </span>
  );
}

// ─── Stage bar ────────────────────────────────────────────────────────────────

function StageBar({
  active,
  counts,
  onSelect,
}: {
  active: Stage;
  counts: Record<Stage, number>;
  onSelect: (s: Stage) => void;
}) {
  const stages: Stage[] = ["media", "draft", "scheduled", "live"];
  return (
    <div className="grid grid-cols-4 gap-2">
      {stages.map((stage, i) => {
        const meta = STAGE_META[stage];
        const isActive = active === stage;
        const hasDivider = i < stages.length - 1;
        return (
          <div key={stage} className="relative flex items-stretch">
            <button
              onClick={() => onSelect(stage)}
              className="flex-1 rounded-[14px] p-3.5 text-left transition"
              style={{
                background: isActive ? "var(--ink)" : "var(--surface)",
                border: `1px solid ${isActive ? "var(--ink)" : "var(--line)"}`,
                color: isActive ? "#fff" : "var(--ink)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span style={{ opacity: isActive ? 1 : 0.5 }}>{meta.icon}</span>
                {counts[stage] > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.2)" : "var(--bg-2)",
                      color: isActive ? "#fff" : "var(--ink-2)",
                    }}
                  >
                    {counts[stage]}
                  </span>
                )}
              </div>
              <p className="text-[13px] font-semibold">{meta.label}</p>
            </button>
            {hasDivider && (
              <div className="absolute -right-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center">
                <span
                  className="flex size-5 items-center justify-center rounded-full text-[10px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--muted)" }}
                >
                  →
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Media card ───────────────────────────────────────────────────────────────

function MediaCard({
  asset,
  selected,
  onToggle,
  onCreatePost,
}: {
  asset: MediaAsset;
  selected: boolean;
  onToggle: () => void;
  onCreatePost: (ids: string[]) => void;
}) {
  const thumb = mediaThumb(asset);
  return (
    <div
      className="group rounded-[14px] overflow-hidden"
      style={{
        border: selected ? "2px solid var(--accent)" : "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square cursor-pointer" onClick={onToggle}>
        {thumb ? (
          <img src={thumb} alt={asset.originalName} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-2)" }}>
            {asset.mediaType === "video"
              ? <Icons.Film size={24} style={{ color: "var(--muted)" } as React.CSSProperties} />
              : <Icons.Image size={24} style={{ color: "var(--muted)" } as React.CSSProperties} />}
          </div>
        )}
        {/* Select overlay */}
        <div
          className="absolute inset-0 flex items-start justify-end p-2 opacity-0 group-hover:opacity-100 transition"
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          <div
            className="flex size-5 items-center justify-center rounded-full"
            style={{
              background: selected ? "var(--accent)" : "rgba(255,255,255,0.85)",
              border: selected ? "none" : "1px solid rgba(0,0,0,0.15)",
            }}
          >
            {selected && <Icons.Check size={11} className="text-white" />}
          </div>
        </div>
        {/* Type badge */}
        <div className="absolute bottom-2 left-2">
          <span
            className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
          >
            {asset.mediaType}
          </span>
        </div>
      </div>
      {/* Footer */}
      <div className="p-2.5">
        <p className="truncate text-[11px] font-medium mb-2" style={{ color: "var(--ink-2)" }} title={asset.originalName}>
          {asset.originalName}
        </p>
        <button
          onClick={() => onCreatePost([asset._id])}
          className="w-full rounded-[8px] py-1.5 text-[11px] font-semibold transition"
          style={{ background: "var(--ink)", color: "#fff" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Create Post
        </button>
      </div>
    </div>
  );
}

// ─── Post row (draft / scheduled / live) ─────────────────────────────────────

function PostRow({
  post,
  allMedia,
  businessId,
  onRefresh,
}: {
  post: PostDraft;
  allMedia: MediaAsset[];
  businessId: string;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const thumb = postThumb(post, allMedia);
  const assetCount = post.mediaAssetIds?.length ?? 0;

  const statusStyle = {
    new:           { bg: "var(--bg-2)",      color: "var(--ink-2)" },
    scheduled:     { bg: "var(--info-soft)", color: "var(--info)" },
    posting:       { bg: "var(--warn-soft)", color: "var(--warn)" },
    live:          { bg: "var(--ok-soft)",   color: "var(--ok)" },
    error:         { bg: "var(--err-soft)",  color: "var(--err)" },
    manual_review: { bg: "#fff3e0",          color: "#e65100" },
  }[post.status] ?? { bg: "var(--bg-2)", color: "var(--ink-2)" };

  async function publishNow() {
    setBusy(true);
    try {
      await api.post(`/posts/${post._id}/publish`, { businessId });
      toast({ tone: "success", title: "Published!" });
      onRefresh();
    } catch (err) {
      toast({ tone: "error", title: extractApiError(err, "Publish failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <Thumb src={thumb} />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <PostTypeBadge type={post.postType} />
          {assetCount > 1 && (
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              {assetCount} items
            </span>
          )}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: statusStyle.bg, color: statusStyle.color }}
          >
            {post.status === "new" ? "Draft" : post.status === "manual_review" ? "Review" : post.status}
          </span>
        </div>
        <p className="truncate text-[12px] font-medium" style={{ color: "var(--ink)" }}>
          {post.caption || post.title || "No caption"}
        </p>
        {post.scheduledFor && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
            <Icons.Calendar size={10} className="inline mr-1" />
            {new Date(post.scheduledFor).toLocaleDateString()} at{" "}
            {new Date(post.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {post.lastError && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--err)" }}>
            {post.lastError}
          </p>
        )}
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] hover:underline"
            style={{ color: "var(--accent)" }}
          >
            View on Instagram ↗
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {(post.status === "new" || post.status === "manual_review") && (
          <button
            onClick={publishNow}
            disabled={busy}
            className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-60"
            style={{ background: "var(--ok-soft)", color: "var(--ok)", border: "1px solid var(--ok)" }}
          >
            {busy ? "…" : "Publish"}
          </button>
        )}
        {post.status === "scheduled" && (
          <button
            onClick={publishNow}
            disabled={busy}
            className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-60"
            style={{ background: "var(--warn-soft)", color: "var(--warn)", border: "1px solid var(--warn)" }}
          >
            {busy ? "…" : "Publish Now"}
          </button>
        )}
        <button
          onClick={() => navigate("/posts")}
          className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition"
          style={{ background: "var(--bg-2)", color: "var(--ink-2)", border: "1px solid var(--line)" }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

// ─── Live post card ───────────────────────────────────────────────────────────

function LiveCard({ post, allMedia }: { post: PostDraft; allMedia: MediaAsset[] }) {
  const thumb = postThumb(post, allMedia);
  return (
    <div
      className="group relative aspect-square overflow-hidden rounded-[14px]"
      style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Icons.Image size={20} style={{ color: "var(--line-2)" } as React.CSSProperties} />
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2">
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
            style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)" }}
          >
            View ↗
          </a>
        )}
      </div>
      <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
        LIVE
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ stage, onAction }: { stage: Stage; onAction: () => void }) {
  const meta = STAGE_META[stage];
  const iconMap: Record<Stage, React.ReactNode> = {
    media:     <Icons.Drive size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />,
    draft:     <Icons.Edit size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />,
    scheduled: <Icons.Calendar size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />,
    live:      <Icons.CircleCheck size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />,
  };
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[18px] border-2 border-dashed py-16 text-center"
      style={{ borderColor: "var(--line-2)" }}
    >
      {iconMap[stage]}
      <p className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>{meta.emptyLabel}</p>
      {meta.emptyAction && (
        <button onClick={onAction} className="btn-primary">
          <Icons.Plus size={14} />
          {meta.emptyAction}
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudioPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const [stage, setStage] = useState<Stage>("media");
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [confirmCarousel, setConfirmCarousel] = useState(false);

  const { data: allMedia = [], isLoading: mediaLoading } = useQuery<MediaAsset[]>({
    queryKey: ["media", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery<PostDraft[]>({
    queryKey: ["posts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/posts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
  });

  // Media assets not yet linked to any post
  const linkedMediaIds = useMemo(() => {
    const ids = new Set<string>();
    posts.forEach((p) => p.mediaAssetIds?.forEach((m) => ids.add(m._id)));
    return ids;
  }, [posts]);

  const unlinkedMedia = useMemo(
    () => allMedia.filter((m) => !linkedMediaIds.has(m._id)),
    [allMedia, linkedMediaIds]
  );

  const drafts    = posts.filter((p) => p.status === "new");
  const scheduled = posts.filter((p) => p.status === "scheduled" || p.status === "posting");
  const live      = posts.filter((p) => p.status === "live");
  const needsReview = posts.filter((p) => p.status === "manual_review" || p.needsManualReview);

  const counts: Record<Stage, number> = {
    media:     unlinkedMedia.length,
    draft:     drafts.length,
    scheduled: scheduled.length,
    live:      live.length,
  };

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
  }

  const runSchedulerMutation = useMutation({
    mutationFn: () => api.post("/scheduler/run-now").then((r) => r.data.data as { postsTriggered: number }),
    onSuccess: (r) => {
      toast({
        tone: "success",
        title: r.postsTriggered === 0 ? "No posts due" : `Published ${r.postsTriggered} post${r.postsTriggered !== 1 ? "s" : ""}`,
      });
      setTimeout(refresh, 2000);
    },
    onError: (err) => toast({ tone: "error", title: extractApiError(err, "Scheduler failed") }),
  });

  function goCreatePost(mediaIds: string[], postType?: "single" | "carousel" | "video" | "reel") {
    navigate("/posts", { state: { mediaIds, postType } });
  }

  function toggleMediaSelect(id: string) {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleEmptyAction() {
    if (stage === "media") navigate("/drive-browser");
    else if (stage === "draft" || stage === "scheduled") navigate("/posts");
  }

  const isLoading = mediaLoading || postsLoading;

  if (!activeBusinessId) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p style={{ color: "var(--muted)" }}>Select a workspace to get started.</p>
        <Link to="/businesses" className="btn-primary">Go to Businesses</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Confirm carousel dialog */}
      <ConfirmDialog
        open={confirmCarousel}
        title={`Create carousel from ${selectedMediaIds.length} items?`}
        description="This will open the post editor with all selected media pre-loaded as a carousel."
        confirmLabel="Create Carousel"
        onConfirm={() => {
          setConfirmCarousel(false);
          goCreatePost(selectedMediaIds, "carousel");
          setSelectedMediaIds([]);
        }}
        onCancel={() => setConfirmCarousel(false)}
      />

      {/* Header */}
      <PageHeader
        eyebrow="Pipeline"
        title="Studio"
        subtitle="Your full content pipeline — from Drive to Instagram."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/drive-browser" className="btn-secondary">
              <Icons.Drive size={14} />
              Import
            </Link>
            <button
              onClick={() => runSchedulerMutation.mutate()}
              disabled={runSchedulerMutation.isPending}
              className="btn-secondary disabled:opacity-60"
            >
              {runSchedulerMutation.isPending ? (
                <><svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Running…</>
              ) : (
                <><Icons.Refresh size={14} /> Publish Due</>
              )}
            </button>
            <button onClick={() => goCreatePost([], undefined)} className="btn-primary">
              <Icons.Plus size={14} />
              New Post
            </button>
          </div>
        }
      />

      {/* Needs Review banner */}
      {needsReview.length > 0 && (
        <div
          className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-sm"
          style={{ background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)" }}
        >
          <span>
            <span className="font-semibold">{needsReview.length} post{needsReview.length !== 1 ? "s" : ""} need manual review.</span>
            {" "}Fix the error on each post, then retry.
          </span>
          <Link to="/posts" className="text-[12px] font-semibold underline whitespace-nowrap">
            View Posts →
          </Link>
        </div>
      )}

      {/* Pipeline stage bar */}
      <StageBar active={stage} counts={counts} onSelect={(s) => { setStage(s); setSelectedMediaIds([]); }} />

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-[14px]" style={{ background: "var(--bg-2)" }} />
          ))}
        </div>
      )}

      {/* ── Stage: Media ─────────────────────────────────── */}
      {!isLoading && stage === "media" && (
        <>
          {unlinkedMedia.length === 0 ? (
            <EmptyState stage="media" onAction={handleEmptyAction} />
          ) : (
            <>
              {/* Selection toolbar */}
              {selectedMediaIds.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3"
                  style={{ background: "var(--info-soft)", border: "1px solid var(--info)" }}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--info)" }}>
                    {selectedMediaIds.length} selected
                  </span>
                  <button
                    onClick={() => goCreatePost(selectedMediaIds, selectedMediaIds.length > 1 ? "carousel" : "single")}
                    className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: "var(--ink)", color: "#fff" }}
                  >
                    {selectedMediaIds.length > 1 ? "Create Carousel" : "Create Post"}
                  </button>
                  <button
                    onClick={() => setSelectedMediaIds([])}
                    className="ml-auto text-xs"
                    style={{ color: "var(--info)" }}
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Media grid */}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {unlinkedMedia.map((asset) => (
                  <MediaCard
                    key={asset._id}
                    asset={asset}
                    selected={selectedMediaIds.includes(asset._id)}
                    onToggle={() => toggleMediaSelect(asset._id)}
                    onCreatePost={(ids) => goCreatePost(ids, "single")}
                  />
                ))}
              </div>

              {/* Info row */}
              <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
                {unlinkedMedia.length} item{unlinkedMedia.length !== 1 ? "s" : ""} ready to post.
                Select multiple to create a carousel.
              </p>
            </>
          )}
        </>
      )}

      {/* ── Stage: Draft ──────────────────────────────────── */}
      {!isLoading && stage === "draft" && (
        <>
          {drafts.length === 0 ? (
            <EmptyState stage="draft" onAction={handleEmptyAction} />
          ) : (
            <div className="space-y-2">
              {drafts.map((post) => (
                <PostRow key={post._id} post={post} allMedia={allMedia} businessId={activeBusinessId} onRefresh={refresh} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Stage: Scheduled ──────────────────────────────── */}
      {!isLoading && stage === "scheduled" && (
        <>
          {scheduled.length === 0 ? (
            <EmptyState stage="scheduled" onAction={handleEmptyAction} />
          ) : (
            <div className="space-y-2">
              {[...scheduled]
                .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())
                .map((post) => (
                  <PostRow key={post._id} post={post} allMedia={allMedia} businessId={activeBusinessId} onRefresh={refresh} />
                ))}
            </div>
          )}
        </>
      )}

      {/* ── Stage: Live ───────────────────────────────────── */}
      {!isLoading && stage === "live" && (
        <>
          {live.length === 0 ? (
            <EmptyState stage="live" onAction={handleEmptyAction} />
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {live.map((post) => (
                <LiveCard key={post._id} post={post} allMedia={allMedia} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer link to full Posts page */}
      {!isLoading && (stage === "draft" || stage === "scheduled") && (
        <div className="text-center">
          <Link to="/posts" className="text-[12px] font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Open full Posts editor →
          </Link>
        </div>
      )}
    </div>
  );
}
