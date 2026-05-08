import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { formatSchedule, getMediaPreviewUrl, resolveApiAssetUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

const POST_TYPES = [
  { value: "single", label: "Single", icon: "🖼" },
  { value: "carousel", label: "Carousel", icon: "🗂" },
  { value: "video", label: "Video", icon: "🎬" },
  { value: "reel", label: "Reel", icon: "🎞" }
] as const;

const STATUS_RING: Record<string, string> = {
  new: "ring-slate-200",
  scheduled: "ring-blue-400",
  posting: "ring-amber-400",
  live: "ring-emerald-500",
  error: "ring-red-400"
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-50 text-blue-700",
  posting: "bg-amber-50 text-amber-700",
  live: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700"
};

type TabId = "all" | "new" | "scheduled" | "live";
type ViewMode = "small" | "medium" | "large" | "list";

interface LocationState {
  mediaIds?: string[];
  postType?: "single" | "carousel" | "video" | "reel";
  aiCaption?: string;
  groupId?: string;
}

function findPreviewUrl(post: PostDraft, allMedia: MediaAsset[]): string {
  const firstId = post.mediaAssetIds?.[0]?._id;
  if (firstId) {
    const full = allMedia.find((m) => m._id === firstId);
    if (full) return getMediaPreviewUrl(full);
  }
  const m = post.mediaAssetIds?.[0];
  if (!m) return "";
  if (m.previewUrl) return resolveApiAssetUrl(m.previewUrl);
  if (m.driveThumbnailLink) return m.driveThumbnailLink;
  if (m.publicUrl?.startsWith("http")) return m.publicUrl;
  if (m.publicUrl) return resolveApiAssetUrl(m.publicUrl);
  return "";
}

export function PostsPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const prefill = (location.state as LocationState) ?? {};

  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("medium");
  const [showCreate, setShowCreate] = useState(Boolean(prefill.mediaIds?.length));
  const [selectedPost, setSelectedPost] = useState<PostDraft | null>(null);
  const [repairedIds, setRepairedIds] = useState<Set<string>>(new Set());

  const { data: posts = [], isLoading: postsLoading } = useQuery<PostDraft[]>({
    queryKey: ["posts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/posts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: media = [] } = useQuery<MediaAsset[]>({
    queryKey: ["media", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "all", label: "All", count: posts.length },
    { id: "new", label: "Draft", count: posts.filter((p) => p.status === "new").length },
    {
      id: "scheduled",
      label: "Scheduled",
      count: posts.filter((p) => p.status === "scheduled" || p.status === "posting").length
    },
    { id: "live", label: "Live", count: posts.filter((p) => p.status === "live").length }
  ];

  const filteredPosts = posts.filter((post) => {
    if (activeTab === "all") return true;
    if (activeTab === "new") return post.status === "new";
    if (activeTab === "scheduled") return post.status === "scheduled" || post.status === "posting";
    if (activeTab === "live") return post.status === "live" || post.status === "error";
    return true;
  });

  useEffect(() => {
    if (!activeBusinessId || !media.length) return;
    const broken = media.filter(
      (m) =>
        m.source === "google_drive" &&
        m.mediaType === "image" &&
        (!m.previewUrl || m.previewUrl.startsWith("http")) &&
        !repairedIds.has(m._id)
    );
    if (!broken.length) return;

    setRepairedIds((prev) => {
      const next = new Set(prev);
      broken.forEach((m) => next.add(m._id));
      return next;
    });

    Promise.all(
      broken.map((m) =>
        api
          .post(`/media/${m._id}/ensure-thumbnail`, { businessId: activeBusinessId })
          .catch(() => null)
      )
    ).then((results) => {
      if (results.some((r) => r !== null)) {
        queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
      }
    });
  }, [media, activeBusinessId]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
  }

  const gridClass: Record<ViewMode, string> = {
    small: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
    medium: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
    large: "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3",
    list: "flex flex-col gap-2"
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Posts</h1>
          <p className="text-sm text-slate-500">Manage your Instagram content</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggles */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <ViewModeButton mode="small" active={viewMode} onClick={setViewMode} title="Small grid">
              <SmallGridIcon />
            </ViewModeButton>
            <ViewModeButton mode="medium" active={viewMode} onClick={setViewMode} title="Medium grid">
              <MediumGridIcon />
            </ViewModeButton>
            <ViewModeButton mode="large" active={viewMode} onClick={setViewMode} title="Large grid">
              <LargeGridIcon />
            </ViewModeButton>
            <ViewModeButton mode="list" active={viewMode} onClick={setViewMode} title="List view">
              <ListIcon />
            </ViewModeButton>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-[#10332b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e2c25]"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" />
            </svg>
            New Post
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  activeTab === tab.id
                    ? "bg-slate-100 text-slate-700"
                    : "bg-white/70 text-slate-500"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid / List */}
      {postsLoading ? (
        <div className={gridClass[viewMode]}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-2xl bg-slate-100 ${viewMode === "list" ? "h-20" : "aspect-square"}`}
            />
          ))}
        </div>
      ) : filteredPosts.length === 0 && activeTab !== "all" ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          No {activeTab === "new" ? "drafts" : activeTab === "scheduled" ? "scheduled posts" : "live posts"} yet.
        </div>
      ) : (
        <div className={gridClass[viewMode]}>
          {filteredPosts.map((post) =>
            viewMode === "list" ? (
              <ListCard
                key={post._id}
                post={post}
                businessId={activeBusinessId ?? ""}
                allMedia={media}
                onRefresh={refresh}
                onOpenDetail={() => setSelectedPost(post)}
              />
            ) : (
              <PostCard
                key={post._id}
                post={post}
                businessId={activeBusinessId ?? ""}
                allMedia={media}
                viewMode={viewMode}
                onRefresh={refresh}
                onOpenDetail={() => setSelectedPost(post)}
              />
            )
          )}
          {viewMode !== "list" && <NewPostCard onClick={() => setShowCreate(true)} />}
          {viewMode === "list" && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
            >
              <span className="flex size-8 items-center justify-center rounded-xl bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              New Post
            </button>
          )}
        </div>
      )}

      {/* Create drawer */}
      {showCreate && (
        <CreateDrawer
          accounts={accounts}
          media={media}
          prefill={prefill}
          businessId={activeBusinessId ?? ""}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          allMedia={media}
          businessId={activeBusinessId ?? ""}
          onClose={() => setSelectedPost(null)}
          onRefresh={refresh}
          onDone={() => {
            refresh();
            setSelectedPost(null);
          }}
        />
      )}
    </div>
  );
}

/* ── View mode toggle button ─────────────────────────────── */
function ViewModeButton({
  mode,
  active,
  onClick,
  title,
  children
}: {
  mode: ViewMode;
  active: ViewMode;
  onClick: (m: ViewMode) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(mode)}
      title={title}
      className={`flex size-7 items-center justify-center rounded-lg transition ${
        active === mode ? "bg-white shadow-sm text-slate-800" : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function SmallGridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" />
      <rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" />
      <rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" />
      <rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" />
      <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" />
      <rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" />
      <rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" />
      <rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" />
      <rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" />
    </svg>
  );
}

function MediumGridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function LargeGridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="1" width="14" height="6" rx="1.5" />
      <rect x="1" y="9" width="14" height="6" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <rect x="1" y="2" width="14" height="2.5" rx="1" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1" />
    </svg>
  );
}

/* ── Post card (grid) ─────────────────────────────────────── */
function PostCard({
  post,
  businessId,
  allMedia,
  viewMode,
  onRefresh,
  onOpenDetail
}: {
  post: PostDraft;
  businessId: string;
  allMedia: MediaAsset[];
  viewMode: ViewMode;
  onRefresh: () => void;
  onOpenDetail: () => void;
}) {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const previewUrl = findPreviewUrl(post, allMedia);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";
  const isLive = post.status === "live";
  const isPosting = post.status === "posting";

  async function runAction(type: "hashtags" | "publish") {
    setLoading(type);
    setError("");
    try {
      const endpoint =
        type === "hashtags"
          ? `/posts/${post._id}/suggest-hashtags`
          : `/posts/${post._id}/publish`;
      await api.post(endpoint, { businessId });
      onRefresh();
    } catch (err) {
      setError(extractApiError(err, `Failed to ${type}.`));
    } finally {
      setLoading("");
    }
  }

  const infoVisible = viewMode !== "small";

  return (
    <div className="flex flex-col gap-2">
      {/* Thumbnail */}
      <div
        className={`group relative overflow-hidden rounded-2xl ring-2 ring-offset-2 ${STATUS_RING[post.status] ?? "ring-slate-200"} ${viewMode === "small" ? "aspect-square" : "aspect-square"}`}
        onClick={onOpenDetail}
        role="button"
        style={{ cursor: "pointer" }}
      >
        {previewUrl ? (
          isVideo ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img
              src={previewUrl}
              alt={post.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-100">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="size-8 text-slate-300"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path strokeLinecap="round" d="M3 15l5-5 4 4 3-3 5 5" />
            </svg>
          </div>
        )}

        {post.postType && post.postType !== "single" && (
          <div className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur-sm">
            {post.postType}
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {isLive ? (
            post.permalink ? (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white"
              >
                View on Instagram →
              </a>
            ) : (
              <span className="text-xs font-semibold text-white/80">Live</span>
            )
          ) : (
            <>
              <button
                onClick={() => runAction("hashtags")}
                disabled={!!loading}
                className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white disabled:opacity-60"
              >
                {loading === "hashtags" ? "Generating…" : "# Hashtags"}
              </button>
              <button
                onClick={() => runAction("publish")}
                disabled={!!loading || isPosting}
                className="rounded-full bg-[#10332b]/95 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#10332b] disabled:opacity-60"
              >
                {loading === "publish" || isPosting ? "Publishing…" : "Publish now"}
              </button>
              <button
                onClick={onOpenDetail}
                className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-white/30"
              >
                Edit / Details
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info below card (hidden in small mode) */}
      {infoVisible && (
        <div className="space-y-1 px-0.5">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">{post.title}</p>

          {!post.hashtags?.length && post.caption && (
            <p className="truncate text-[11px] text-slate-400">{post.caption}</p>
          )}

          {post.hashtags?.length ? (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                >
                  {tag}
                </span>
              ))}
              {post.hashtags.length > 4 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  +{post.hashtags.length - 4}
                </span>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[post.status] ?? "bg-slate-100 text-slate-600"}`}
            >
              {post.status}
            </span>
            {post.scheduledFor && (
              <span className="text-[10px] text-slate-500">{formatSchedule(post.scheduledFor)}</span>
            )}
          </div>

          {post.collaborators?.length ? (
            <p className="truncate text-[10px] text-slate-400">
              Collab: {post.collaborators.map((h) => `@${h}`).join(", ")}
            </p>
          ) : null}

          {error && <p className="text-[10px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ── List card (horizontal) ───────────────────────────────── */
function ListCard({
  post,
  businessId,
  allMedia,
  onRefresh,
  onOpenDetail
}: {
  post: PostDraft;
  businessId: string;
  allMedia: MediaAsset[];
  onRefresh: () => void;
  onOpenDetail: () => void;
}) {
  const previewUrl = findPreviewUrl(post, allMedia);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";
  const isLive = post.status === "live";
  const isPosting = post.status === "posting";
  const [loading, setLoading] = useState("");

  async function publishNow(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading("publish");
    try {
      await api.post(`/posts/${post._id}/publish`, { businessId });
      onRefresh();
    } catch {
      // noop
    } finally {
      setLoading("");
    }
  }

  return (
    <div
      onClick={onOpenDetail}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-sm transition hover:shadow-md"
    >
      {/* Thumbnail */}
      <div
        className={`relative size-14 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-1 ${STATUS_RING[post.status] ?? "ring-slate-200"}`}
      >
        {previewUrl ? (
          isVideo ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img
              src={previewUrl}
              alt={post.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-100">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="size-5 text-slate-300"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path strokeLinecap="round" d="M3 15l5-5 4 4 3-3 5 5" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{post.title}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[post.status] ?? "bg-slate-100 text-slate-600"}`}
          >
            {post.status}
          </span>
        </div>

        {post.caption && (
          <p className="truncate text-xs text-slate-400">{post.caption}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {post.hashtags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
            >
              {tag}
            </span>
          ))}
          {(post.hashtags?.length ?? 0) > 3 && (
            <span className="text-[10px] text-slate-400">+{post.hashtags!.length - 3} more</span>
          )}
          {post.scheduledFor && (
            <span className="text-[10px] text-slate-500">{formatSchedule(post.scheduledFor)}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {isLive && post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            View
          </a>
        ) : !isLive ? (
          <button
            onClick={publishNow}
            disabled={!!loading || isPosting}
            className="rounded-full bg-[#10332b] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0e2c25] disabled:opacity-60"
          >
            {loading === "publish" || isPosting ? "…" : "Publish"}
          </button>
        ) : null}
        <button
          onClick={onOpenDetail}
          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

/* ── New post card ────────────────────────────────────────── */
function NewPostCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="size-8"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      <span className="text-xs font-semibold">New Post</span>
    </button>
  );
}

/* ── Post Detail Modal ────────────────────────────────────── */
function PostDetailModal({
  post,
  allMedia,
  businessId,
  onClose,
  onRefresh,
  onDone
}: {
  post: PostDraft;
  allMedia: MediaAsset[];
  businessId: string;
  onClose: () => void;
  onRefresh: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const previewUrl = findPreviewUrl(post, allMedia);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";

  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtagInput, setHashtagInput] = useState(post.hashtags?.join(" ") ?? "");
  const [collaborators, setCollaborators] = useState(post.collaborators?.join(", ") ?? "");
  const [scheduledFor, setScheduledFor] = useState(
    post.scheduledFor ? new Date(post.scheduledFor).toISOString().slice(0, 16) : ""
  );
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(post.title ?? "");
    setCaption(post.caption ?? "");
    setHashtagInput(post.hashtags?.join(" ") ?? "");
    setCollaborators(post.collaborators?.join(", ") ?? "");
    setScheduledFor(post.scheduledFor ? new Date(post.scheduledFor).toISOString().slice(0, 16) : "");
    setActionError("");
    setConfirmDelete(false);
  }, [post._id]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const hashtags = hashtagInput
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter(Boolean)
        .map((h) => (h.startsWith("#") ? h : `#${h}`));
      const collabList = collaborators
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean);

      return api.patch(`/posts/${post._id}`, {
        businessId,
        title: title.trim() || undefined,
        caption: caption.trim(),
        hashtags,
        collaborators: collabList,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", businessId] });
      onRefresh(); // refresh data, keep modal open
    },
    onError: (err) => setActionError(extractApiError(err, "Failed to save."))
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post._id}/publish`, { businessId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", businessId] });
      onDone(); // refresh and close modal
    },
    onError: (err) => setActionError(extractApiError(err, "Publish failed."))
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${post._id}`, { params: { businessId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", businessId] });
      onDone(); // refresh and close modal
    },
    onError: (err) => setActionError(extractApiError(err, "Delete failed."))
  });

  const suggestHashtagsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/posts/${post._id}/suggest-hashtags`, { businessId });
      return res.data.data.hashtags as string[];
    },
    onSuccess: (tags) => {
      setHashtagInput(tags.join(" "));
    },
    onError: (err) => setActionError(extractApiError(err, "Hashtag generation failed."))
  });

  const isLive = post.status === "live";
  const isPosting = post.status === "posting";
  const anyLoading =
    updateMutation.isPending ||
    publishMutation.isPending ||
    deleteMutation.isPending ||
    suggestHashtagsMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 truncate max-w-xs">{post.title}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[post.status] ?? "bg-slate-100 text-slate-600"}`}
            >
              {post.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: preview */}
          <div className="hidden w-56 shrink-0 border-r border-slate-100 bg-slate-50 sm:flex sm:flex-col">
            <div className="flex flex-1 items-center justify-center p-4">
              {previewUrl ? (
                isVideo ? (
                  <video
                    src={previewUrl}
                    className="w-full rounded-2xl object-cover shadow-md"
                    style={{ maxHeight: 240 }}
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt={post.title}
                    className="w-full rounded-2xl object-cover shadow-md"
                    style={{ maxHeight: 240 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-slate-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="size-10 text-slate-300"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path strokeLinecap="round" d="M3 15l5-5 4 4 3-3 5 5" />
                  </svg>
                </div>
              )}
            </div>

            {/* Media count */}
            {(post.mediaAssetIds?.length ?? 0) > 1 && (
              <p className="pb-3 text-center text-xs text-slate-400">
                {post.mediaAssetIds!.length} media files
              </p>
            )}

            {/* Instagram link */}
            {isLive && post.permalink && (
              <div className="px-4 pb-4">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl bg-gradient-to-r from-[#405DE6] via-[#C13584] to-[#FD1D1D] py-2 text-center text-xs font-semibold text-white"
                >
                  View on Instagram
                </a>
              </div>
            )}
          </div>

          {/* Right: form */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 p-6">
              {/* Title */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isLive}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Caption
                </label>
                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={isLive}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              {/* Hashtags */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Hashtags
                  </label>
                  {!isLive && (
                    <button
                      onClick={() => suggestHashtagsMutation.mutate()}
                      disabled={anyLoading}
                      className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {suggestHashtagsMutation.isPending ? (
                        <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <span>✨</span>
                      )}
                      {suggestHashtagsMutation.isPending ? "Generating…" : "AI Suggest"}
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  disabled={isLive}
                  placeholder="#hashtag1 #hashtag2 #hashtag3…"
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
                {hashtagInput && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {hashtagInput
                      .split(/[\s,]+/)
                      .filter((h) => h.trim())
                      .slice(0, 8)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                        >
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Collaborators */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Collaborators
                </label>
                <input
                  value={collaborators}
                  onChange={(e) => setCollaborators(e.target.value)}
                  disabled={isLive}
                  placeholder="@username1, @username2"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              {/* Schedule */}
              {!isLive && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Scheduled For
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Clear to remove scheduling (saves as draft).
                  </p>
                </div>
              )}

              {/* Post info */}
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
                {post.postType && (
                  <div className="flex justify-between">
                    <span>Type</span>
                    <span className="font-medium capitalize text-slate-700">{post.postType}</span>
                  </div>
                )}
                {post.scheduledFor && (
                  <div className="flex justify-between">
                    <span>Scheduled</span>
                    <span className="font-medium text-slate-700">{formatSchedule(post.scheduledFor)}</span>
                  </div>
                )}
                {post.igMediaId && (
                  <div className="flex justify-between">
                    <span>Instagram ID</span>
                    <span className="font-mono text-slate-700">{post.igMediaId}</span>
                  </div>
                )}
              </div>

              {actionError && (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{actionError}</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={anyLoading}
                className="flex items-center gap-1.5 rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Sure?</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={anyLoading}
                  className="rounded-2xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Deleting…" : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="flex-1" />

            {/* Publish now (not for live posts) */}
            {!isLive && (
              <button
                onClick={() => publishMutation.mutate()}
                disabled={anyLoading || isPosting}
                className="rounded-2xl border border-[#10332b] px-4 py-2.5 text-sm font-semibold text-[#10332b] transition hover:bg-[#10332b]/5 disabled:opacity-50"
              >
                {publishMutation.isPending || isPosting ? "Publishing…" : "Publish Now"}
              </button>
            )}

            {/* Save */}
            {!isLive && (
              <button
                onClick={() => updateMutation.mutate()}
                disabled={anyLoading}
                className="rounded-2xl bg-[#10332b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e2c25] disabled:opacity-50"
              >
                {updateMutation.isPending
                  ? "Saving…"
                  : scheduledFor
                  ? "Save & Schedule"
                  : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create drawer ────────────────────────────────────────── */
function CreateDrawer({
  accounts,
  media,
  prefill,
  businessId,
  onClose,
  onSuccess
}: {
  accounts: any[];
  media: MediaAsset[];
  prefill: LocationState;
  businessId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [postType, setPostType] = useState<"single" | "carousel" | "video" | "reel">(
    prefill.postType ?? "single"
  );
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(prefill.mediaIds ?? []);
  const [igAccountId, setIgAccountId] = useState(accounts[0]?._id ?? "");
  const [caption, setCaption] = useState(prefill.aiCaption ?? "");
  const [title, setTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [collaborators, setCollaborators] = useState("");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [error, setError] = useState("");
  const captionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (accounts.length > 0 && !igAccountId) {
      setIgAccountId(accounts[0]._id);
    }
  }, [accounts]);

  const maxSelect = postType === "carousel" ? 10 : 1;
  const filteredMedia = media.filter((m) => {
    if (postType === "video" || postType === "reel") return m.mediaType === "video";
    return m.mediaType === "image";
  });

  function toggleMedia(id: string) {
    setSelectedMediaIds((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= maxSelect) return maxSelect === 1 ? [id] : prev;
      return [...prev, id];
    });
  }

  async function generateAiCaption() {
    if (!selectedMediaIds.length || !businessId) return;
    setGeneratingCaption(true);
    setError("");
    try {
      const response = await api.post(`/media/${selectedMediaIds[0]}/generate-caption`, {
        businessId
      });
      const generated =
        response.data?.data?.caption ?? response.data?.data?.asset?.aiCaption ?? "";
      setCaption(generated);
      if (!title.trim() && generated) {
        const words = generated
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6);
        setTitle(words.join(" "));
      }
      setTimeout(() => captionRef.current?.focus(), 100);
    } catch (err) {
      setError(extractApiError(err, "AI generation failed."));
    } finally {
      setGeneratingCaption(false);
    }
  }

  const willSchedule = Boolean(scheduledFor);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("No active business");
      if (!igAccountId) throw new Error("Select an Instagram account");
      if (!selectedMediaIds.length) throw new Error("Select at least one media item");
      if (!title.trim()) throw new Error("Title is required");

      const collaboratorList = collaborators
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean);

      return api.post("/posts", {
        businessId,
        instagramAccountId: igAccountId,
        mediaAssetIds: selectedMediaIds,
        title: title.trim(),
        caption: caption.trim(),
        postType,
        collaborators: collaboratorList,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined
      });
    },
    onSuccess,
    onError: (err) => setError(extractApiError(err, "Could not save post."))
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex w-full max-w-md flex-col bg-white shadow-2xl sm:rounded-l-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">New Post</h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Post type */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Post Type
              </p>
              <div className="grid grid-cols-4 gap-2">
                {POST_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    onClick={() => {
                      setPostType(pt.value);
                      setSelectedMediaIds([]);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition ${
                      postType === pt.value
                        ? "bg-[#10332b] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span className="text-base">{pt.icon}</span>
                    {pt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Instagram account */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Instagram Account
              </p>
              <select
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Select account…</option>
                {accounts.map((acc: any) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} (@{acc.handle?.replace(/^@/, "")})
                  </option>
                ))}
              </select>
            </section>

            {/* Media picker */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Select Media
                </p>
                <span className="text-[11px] text-slate-400">
                  {selectedMediaIds.length}/{maxSelect} selected
                </span>
              </div>
              {filteredMedia.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
                  No {postType === "video" || postType === "reel" ? "video" : "image"} assets.
                  <br />
                  Import files from Drive Browser first.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredMedia.map((m) => {
                    const selected = selectedMediaIds.includes(m._id);
                    const mPreviewUrl = getMediaPreviewUrl(m);
                    const order = selectedMediaIds.indexOf(m._id);
                    return (
                      <button
                        key={m._id}
                        onClick={() => toggleMedia(m._id)}
                        title={m.originalName}
                        className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                          selected
                            ? "border-emerald-500 ring-2 ring-emerald-200"
                            : "border-transparent hover:border-slate-300"
                        }`}
                      >
                        {mPreviewUrl ? (
                          m.mediaType === "video" ? (
                            <video
                              src={mPreviewUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={mPreviewUrl}
                              alt={m.originalName}
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center bg-slate-100 text-[9px] text-slate-400">
                            No preview
                          </div>
                        )}
                        {selected && (
                          <div className="absolute inset-0 flex items-start justify-end bg-emerald-900/20 p-1">
                            <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
              {order + 1}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Caption */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Caption
                </p>
                <button
                  onClick={generateAiCaption}
                  disabled={generatingCaption || !selectedMediaIds.length}
                  className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingCaption ? (
                    <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <span>✨</span>
                  )}
                  {generatingCaption ? "Generating…" : "AI Generate"}
                </button>
              </div>
              {!selectedMediaIds.length && (
                <p className="mb-1 text-[10px] text-slate-400">Select media first to enable AI.</p>
              )}
              <textarea
                ref={captionRef}
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your caption, or use ✨ AI Generate above…"
                className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </section>

            {/* Title */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Title
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled from AI caption, or type here…"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </section>

            {/* Schedule */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Schedule (optional)
              </p>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="mt-1.5 text-[10px] text-slate-400">
                Leave blank to save as draft. Set a time to auto-schedule the post.
              </p>
            </section>

            {/* Collaborators */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Collaborators (optional)
              </p>
              <input
                value={collaborators}
                onChange={(e) => setCollaborators(e.target.value)}
                placeholder="@username1, @username2"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="mt-1.5 text-[10px] text-slate-400">
                After publishing, each collaborator gets an invite in Instagram.
              </p>
            </section>
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          {error && (
            <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          )}
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full rounded-2xl bg-[#10332b] py-3 text-sm font-semibold text-white transition hover:bg-[#0e2c25] disabled:opacity-50"
          >
            {createMutation.isPending
              ? "Saving…"
              : willSchedule
              ? "Schedule Post"
              : "Save Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
