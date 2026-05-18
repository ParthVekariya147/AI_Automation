import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ConfirmDialog } from "../components/queue/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { formatSchedule, getMediaPreviewUrl, resolveApiAssetUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, Icons, Pill } from "../lib/ds";

const POST_TYPES = [
  { value: "single", label: "Single", icon: "🖼" },
  { value: "carousel", label: "Carousel", icon: "🗂" },
  { value: "video", label: "Video", icon: "🎬" },
  { value: "reel", label: "Reel", icon: "🎞" }
] as const;

const STATUS_RING: Record<string, string> = {
  new: "ring-2 ring-offset-2",
  scheduled: "ring-2 ring-offset-2",
  posting: "ring-2 ring-offset-2",
  live: "ring-2 ring-offset-2",
  error: "ring-2 ring-offset-2"
};

const STATUS_RING_COLOR: Record<string, string> = {
  new: "var(--line)",
  scheduled: "var(--info)",
  posting: "var(--warn)",
  live: "var(--ok)",
  error: "var(--err)"
};

const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  new: { bg: "var(--bg-2)", color: "var(--ink-2)" },
  scheduled: { bg: "var(--info-soft)", color: "var(--info)" },
  posting: { bg: "var(--warn-soft)", color: "var(--warn)" },
  live: { bg: "var(--ok-soft)", color: "var(--ok)" },
  error: { bg: "var(--err-soft)", color: "var(--err)" },
  manual_review: { bg: "#fff3e0", color: "#e65100" }
};

type TabId = "all" | "new" | "scheduled" | "live" | "manual_review";
type ViewMode = "small" | "medium" | "large" | "list";

interface LocationState {
  mediaIds?: string[];
  postType?: "single" | "carousel" | "video" | "reel";
  aiCaption?: string;
  groupId?: string;
}

function findPreviewUrl(post: PostDraft, allMedia: MediaAsset[]): string {
  if (post.status === "live" && post.livePostThumbnailUrl) return post.livePostThumbnailUrl;
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
  const toast = useToast();
  const prefill = (location.state as LocationState) ?? {};

  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showCreate, setShowCreate] = useState(Boolean(prefill.mediaIds?.length));
  const [selectedPost, setSelectedPost] = useState<PostDraft | null>(null);
  const [repairedIds, setRepairedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
    { id: "live", label: "Live", count: posts.filter((p) => p.status === "live").length },
    { id: "manual_review", label: "Needs Review", count: posts.filter((p) => p.status === "manual_review" || p.needsManualReview).length }
  ];

  const filteredPosts = posts.filter((post) => {
    if (activeTab === "all") return true;
    if (activeTab === "new") return post.status === "new";
    if (activeTab === "scheduled") return post.status === "scheduled" || post.status === "posting";
    if (activeTab === "live") return post.status === "live" || post.status === "error";
    if (activeTab === "manual_review") return post.status === "manual_review" || post.needsManualReview;
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
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
  }

  const runSchedulerMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/scheduler/run-now");
      return res.data.data as { postsTriggered: number; automationsTriggered: number };
    },
    onSuccess: (result) => {
      const total = result.postsTriggered;
      if (total === 0) {
        toast({ tone: "success", title: "No posts due", description: "No scheduled posts were ready to publish right now." });
      } else {
        toast({
          tone: "success",
          title: `Triggered ${total} post${total !== 1 ? "s" : ""}`,
          description: `${result.postsTriggered} draft${result.postsTriggered !== 1 ? "s" : ""} sent to Instagram.`,
        });
      }
      setTimeout(refresh, 2000);
    },
    onError: (err) => {
      toast({ tone: "error", title: "Scheduler failed", description: extractApiError(err, "Could not run scheduler.") });
    },
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.length > 0 && selectedIds.length < filteredPosts.length;
    }
  }, [selectedIds.length, filteredPosts.length]);

  function toggleSelectAll() {
    if (selectedIds.length === filteredPosts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPosts.map((p) => p._id));
    }
  }

  async function bulkDelete() {
    if (!activeBusinessId || !selectedIds.length) return;
    setConfirmBulkRemove(false);
    setIsBulkDeleting(true);
    try {
      await Promise.allSettled(
        selectedIds.map((id) =>
          api.delete(`/posts/${id}`, { params: { businessId: activeBusinessId } })
        )
      );
      toast({ tone: "success", title: `Deleted ${selectedIds.length} post${selectedIds.length !== 1 ? "s" : ""}.` });
      setSelectedIds([]);
      refresh();
    } catch {
      toast({ tone: "error", title: "Bulk delete failed" });
    } finally {
      setIsBulkDeleting(false);
    }
  }

  const gridClass: Record<ViewMode, string> = {
    small: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
    medium: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
    large: "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3",
    list: "flex flex-col gap-2"
  };

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={confirmBulkRemove}
        title={`Delete ${selectedIds.length} post${selectedIds.length !== 1 ? "s" : ""}?`}
        description="This will permanently delete all selected posts. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkRemove(false)}
      />

      <PageHeader
        eyebrow="Workspace"
        title="Posts"
        subtitle="Manage your Instagram content from drafts to published."
        actions={
          <div className="flex items-center gap-2">
            {/* View mode toggles */}
            <div
              className="flex rounded-[10px] p-0.5"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}
            >
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
              onClick={() => runSchedulerMutation.mutate()}
              disabled={runSchedulerMutation.isPending}
              className="btn-secondary disabled:opacity-60"
              title="Manually trigger the scheduler — publishes all posts whose scheduled time has passed"
            >
              {runSchedulerMutation.isPending ? (
                <>
                  <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <Icons.Refresh size={14} />
                  Publish Due
                </>
              )}
            </button>

            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Icons.Plus size={14} />
              New Post
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-[14px] p-1"
        style={{ background: "var(--bg-2)" }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isReview = tab.id === "manual_review";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-xs font-semibold transition"
              style={{
                background: isActive ? (isReview ? "var(--err-soft)" : "var(--surface)") : "transparent",
                color: isActive
                  ? isReview ? "var(--err)" : "var(--ink)"
                  : isReview ? "var(--err)" : "var(--muted)",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                  style={{
                    background: isActive
                      ? isReview ? "var(--err)" : "var(--bg-2)"
                      : isReview ? "var(--err-soft)" : "var(--surface)",
                    color: isActive
                      ? isReview ? "#fff" : "var(--ink-2)"
                      : isReview ? "var(--err)" : "var(--muted)"
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3"
          style={{ background: "var(--err-soft)", border: "1px solid var(--err)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--err)" }}>
            {selectedIds.length} selected
          </span>
          <div className="h-4 w-px" style={{ background: "var(--err)" }} />
          <button
            onClick={() => setConfirmBulkRemove(true)}
            disabled={isBulkDeleting}
            className="rounded-[10px] px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--err)",
              color: "var(--err)"
            }}
          >
            {isBulkDeleting ? "Deleting…" : "Delete Selected"}
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="ml-auto text-xs"
            style={{ color: "var(--err)" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Banner for Manual Review */}
      {activeTab === "manual_review" && filteredPosts.length > 0 && (
        <div
          className="rounded-[14px] px-4 py-3 text-sm"
          style={{ background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)" }}
        >
          <span className="font-semibold">These posts failed to publish twice.</span>
          {" "}Fix the issue shown on each post, then hit Retry.
        </div>
      )}

      {/* Select all row */}
      {!postsLoading && filteredPosts.length > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={selectedIds.length === filteredPosts.length && filteredPosts.length > 0}
            onChange={toggleSelectAll}
            className="h-4 w-4 cursor-pointer rounded"
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {selectedIds.length > 0
              ? `${selectedIds.length} of ${filteredPosts.length} selected`
              : `Select all (${filteredPosts.length})`}
          </span>
          {selectedIds.length > 0 && selectedIds.length < filteredPosts.length && (
            <button
              onClick={() => setSelectedIds(filteredPosts.map((p) => p._id))}
              className="text-xs font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Select all {filteredPosts.length}
            </button>
          )}
        </div>
      )}

      {/* Grid / List */}
      {postsLoading ? (
        <div className={gridClass[viewMode]}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-[14px] ${viewMode === "list" ? "h-20" : "aspect-square"}`}
              style={{ background: "var(--bg-2)" }}
            />
          ))}
        </div>
      ) : filteredPosts.length === 0 && activeTab !== "all" ? (
        <div
          className="rounded-[18px] border-2 border-dashed py-16 text-center"
          style={{ borderColor: "var(--line-2)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No {activeTab === "new" ? "drafts" : activeTab === "scheduled" ? "scheduled posts" : "live posts"} yet.
          </p>
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
                selected={selectedIds.includes(post._id)}
                onToggleSelect={() => toggleSelect(post._id)}
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
                selected={selectedIds.includes(post._id)}
                onToggleSelect={() => toggleSelect(post._id)}
              />
            )
          )}
          {viewMode !== "list" && <NewPostCard onClick={() => setShowCreate(true)} />}
          {viewMode === "list" && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-3 rounded-[14px] border-2 border-dashed px-4 py-3 text-xs font-semibold transition"
              style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.background = "var(--accent-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line-2)";
                e.currentTarget.style.color = "var(--muted)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                className="flex size-8 items-center justify-center rounded-[10px]"
                style={{ background: "var(--bg-2)" }}
              >
                <Icons.Plus size={14} />
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
      className="flex size-7 items-center justify-center rounded-[8px] transition"
      style={{
        background: active === mode ? "var(--surface)" : "transparent",
        color: active === mode ? "var(--ink)" : "var(--muted)",
        boxShadow: active === mode ? "0 1px 3px rgba(0,0,0,0.07)" : "none"
      }}
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
  onOpenDetail,
  selected,
  onToggleSelect
}: {
  post: PostDraft;
  businessId: string;
  allMedia: MediaAsset[];
  viewMode: ViewMode;
  onRefresh: () => void;
  onOpenDetail: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const previewUrl = findPreviewUrl(post, allMedia);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";
  const isLive = post.status === "live";
  const isPosting = post.status === "posting";
  const badgeStyle = STATUS_BADGE_STYLE[post.status] ?? { bg: "var(--bg-2)", color: "var(--ink-2)" };

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
        className={`relative overflow-hidden rounded-[14px] ${STATUS_RING[post.status] ?? ""} aspect-square`}
        style={{ outlineColor: STATUS_RING_COLOR[post.status] ?? "transparent", cursor: "pointer" }}
        onClick={onOpenDetail}
        role="button"
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
          <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-2)" }}>
            <Icons.Image size={32} style={{ color: "var(--line-2)" } as React.CSSProperties} />
          </div>
        )}

        {/* Publish loader overlay */}
        {(loading === "publish" || isPosting) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
            <span className="inline-block size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {post.postType && post.postType !== "single" && (
          <div className="absolute left-2 top-2 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur-sm">
            {post.postType}
          </div>
        )}

        {post.needsManualReview && (
          <div className="absolute left-2 top-8 z-20 flex size-3 items-center justify-center rounded-full bg-red-500 shadow-sm ring-2 ring-white" />
        )}

        {/* Checkbox */}
        {onToggleSelect && (
          <div className="absolute right-2 top-2 z-20">
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 cursor-pointer rounded"
              style={{ accentColor: "var(--accent)" }}
            />
          </div>
        )}

        {/* Always-visible action strip at bottom of thumbnail */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-1.5 px-2 py-2"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {isLive ? (
            post.permalink ? (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow"
              >
                View →
              </a>
            ) : null
          ) : post.needsManualReview ? (
            <button
              onClick={(e) => { e.stopPropagation(); runAction("publish"); }}
              disabled={!!loading || isPosting}
              className="rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-semibold text-white shadow disabled:opacity-60"
            >
              {loading === "publish" || isPosting ? "…" : "Retry"}
            </button>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); runAction("hashtags"); }}
                disabled={!!loading}
                className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white shadow disabled:opacity-60"
                title="Generate hashtags"
              >
                {loading === "hashtags" ? "…" : "#"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); runAction("publish"); }}
                disabled={!!loading || isPosting}
                className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow disabled:opacity-60"
              >
                {loading === "publish" || isPosting ? "…" : "Publish"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white shadow"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info below card (hidden in small mode) */}
      {infoVisible && (
        <div className="space-y-1 px-0.5">
          <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--ink)" }}>
            {post.title}
          </p>

          {!post.hashtags?.length && post.caption && (
            <p className="truncate text-[11px]" style={{ color: "var(--muted)" }}>{post.caption}</p>
          )}

          {post.hashtags?.length ? (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--info-soft)", color: "var(--info)" }}
                >
                  {tag}
                </span>
              ))}
              {post.hashtags.length > 4 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--bg-2)", color: "var(--muted)" }}
                >
                  +{post.hashtags.length - 4}
                </span>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: badgeStyle.bg, color: badgeStyle.color }}
            >
              {post.status}
            </span>
            {post.scheduledFor && (
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                {formatSchedule(post.scheduledFor)}
              </span>
            )}
          </div>

          {post.collaborators?.length ? (
            <p className="truncate text-[10px]" style={{ color: "var(--muted)" }}>
              Collab: {post.collaborators.map((h) => `@${h}`).join(", ")}
            </p>
          ) : null}

          {error && <p className="text-[10px]" style={{ color: "var(--err)" }}>{error}</p>}
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
  onOpenDetail,
  selected,
  onToggleSelect
}: {
  post: PostDraft;
  businessId: string;
  allMedia: MediaAsset[];
  onRefresh: () => void;
  onOpenDetail: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const previewUrl = findPreviewUrl(post, allMedia);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";
  const isLive = post.status === "live";
  const isPosting = post.status === "posting";
  const [loading, setLoading] = useState("");
  const [rowError, setRowError] = useState("");
  const [showStatus, setShowStatus] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const badgeStyle = STATUS_BADGE_STYLE[post.status] ?? { bg: "var(--bg-2)", color: "var(--ink-2)" };
  const toast = useToast();

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatus(false);
      }
    }
    if (showStatus) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showStatus]);

  async function changeStatus(newStatus: string) {
    setShowStatus(false);
    try {
      await api.patch(`/posts/${post._id}`, { businessId, status: newStatus });
      onRefresh();
    } catch (err) {
      toast({ tone: "error", title: "Status update failed", description: extractApiError(err, "Could not update status.") });
    }
  }

  async function publishNow(e: React.MouseEvent) {
    e.stopPropagation();
    setRowError("");
    setLoading("publish");
    try {
      await api.post(`/posts/${post._id}/publish`, { businessId });
      onRefresh();
    } catch (err) {
      setRowError(extractApiError(err, "Publish failed."));
    } finally {
      setLoading("");
    }
  }

  async function retryCaption(e: React.MouseEvent) {
    e.stopPropagation();
    setRowError("");
    setLoading("caption");
    try {
      const assetIds = post.mediaAssetIds?.map((m) => (typeof m === "string" ? m : m._id)) ?? [];
      await Promise.all(assetIds.map((id) => api.post(`/media/${id}/generate-caption`, { businessId })));
      onRefresh();
    } catch (err) {
      setRowError(extractApiError(err, "Caption retry failed."));
    } finally {
      setLoading("");
    }
  }

  async function approveSchedule(e: React.MouseEvent) {
    e.stopPropagation();
    setRowError("");
    setLoading("approve");
    try {
      await api.post(`/posts/${post._id}/approve-schedule`, { businessId });
      onRefresh();
    } catch (err) {
      setRowError(extractApiError(err, "Approve failed."));
    } finally {
      setLoading("");
    }
  }

  const isManualReview = post.status === "manual_review" || post.needsManualReview;

  return (
    <div
      onClick={onOpenDetail}
      className="group flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-3 transition"
      style={{
        background: selected ? "var(--err-soft)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--err)" : isManualReview ? "#e65100" : "var(--line)"}`,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "var(--line-2)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "var(--line)";
      }}
    >
      {/* Checkbox */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 shrink-0 cursor-pointer rounded"
          style={{ accentColor: "var(--accent)" }}
        />
      )}

      {/* Thumbnail */}
      <div
        className="relative size-14 shrink-0 overflow-hidden rounded-[10px]"
        style={{
          outline: `2px solid ${STATUS_RING_COLOR[post.status] ?? "var(--line)"}`,
          outlineOffset: "2px"
        }}
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
          <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-2)" }}>
            <Icons.Image size={20} style={{ color: "var(--line-2)" } as React.CSSProperties} />
          </div>
        )}

        {(loading === "publish" || isPosting) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{post.title}</p>

          {/* Inline status selector */}
          <div ref={statusRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { if (!isLive) setShowStatus((v) => !v); }}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition"
              style={{
                background: badgeStyle.bg,
                color: badgeStyle.color,
                cursor: !isLive ? "pointer" : "default"
              }}
            >
              {post.status}
              {!isLive && <span className="opacity-50">▾</span>}
            </button>
            {showStatus && !isLive && (
              <div
                className="absolute right-0 top-6 z-30 min-w-[130px] rounded-[12px] py-1 shadow-lg"
                style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
              >
                {(["new", "scheduled", "error"] as const).map((s) => {
                  const sStyle = STATUS_BADGE_STYLE[s] ?? { bg: "var(--bg-2)", color: "var(--ink-2)" };
                  return (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs capitalize transition"
                      style={{
                        fontWeight: s === post.status ? 700 : 500,
                        color: s === post.status ? "var(--accent)" : "var(--ink-2)"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: sStyle.color }}
                      />
                      {s === "new" ? "Draft" : s}
                    </button>
                  );
                })}
                <div className="my-1" style={{ borderTop: "1px solid var(--line)" }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setShowStatus(false); publishNow(e as unknown as React.MouseEvent); }}
                  disabled={!!loading || isPosting}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition disabled:opacity-50"
                  style={{ color: "var(--ok)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ok-soft)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--ok)" }} />
                  {loading === "publish" || isPosting ? "Publishing…" : "Publish now"}
                </button>
              </div>
            )}
          </div>

          {post.needsManualReview && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset"
              style={{ background: "var(--err-soft)", color: "var(--err)", outline: "1px solid var(--err)" }}
            >
              Review
            </span>
          )}
        </div>

        {post.caption && (
          <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{post.caption}</p>
        )}

        {(post.lastError || rowError) && (
          <p className="truncate text-[10px] font-medium" style={{ color: "var(--err)" }}>
            {rowError || post.lastError}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {post.hashtags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--info-soft)", color: "var(--info)" }}
            >
              {tag}
            </span>
          ))}
          {(post.hashtags?.length ?? 0) > 3 && (
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              +{post.hashtags!.length - 3} more
            </span>
          )}
          {post.scheduledFor && (
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>
              {formatSchedule(post.scheduledFor)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {isLive && post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-2.5 py-1 text-xs font-semibold transition"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
          >
            View
          </a>
        ) : isManualReview ? (
          <>
            <button
              onClick={retryCaption}
              disabled={!!loading}
              className="rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
              style={{ background: "#fff3e0", border: "1px solid #e65100", color: "#e65100" }}
            >
              {loading === "caption" ? "…" : "Retry Caption"}
            </button>
            <button
              onClick={approveSchedule}
              disabled={!!loading}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: "#e65100" }}
            >
              {loading === "approve" ? "…" : "Approve"}
            </button>
          </>
        ) : !isLive ? (
          <button
            onClick={publishNow}
            disabled={!!loading || isPosting}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink)" }}
          >
            {loading === "publish" || isPosting ? "…" : "Publish"}
          </button>
        ) : null}
        <button
          onClick={onOpenDetail}
          className="rounded-full px-2.5 py-1 text-xs font-semibold transition"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
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
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed transition"
      style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.color = "var(--accent)";
        e.currentTarget.style.background = "var(--accent-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line-2)";
        e.currentTarget.style.color = "var(--muted)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icons.Plus size={28} />
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

  const [carouselIndex, setCarouselIndex] = useState(0);

  const allMediaUrls: { url: string; isVideo: boolean }[] = (post.mediaAssetIds ?? []).map((m) => {
    const full = allMedia.find((a) => a._id === m._id);
    const url = full
      ? getMediaPreviewUrl(full)
      : m.previewUrl
        ? resolveApiAssetUrl(m.previewUrl)
        : m.driveThumbnailLink ?? (m.publicUrl?.startsWith("http") ? m.publicUrl : m.publicUrl ? resolveApiAssetUrl(m.publicUrl) : "");
    return { url, isVideo: m.mediaType === "video" };
  });

  const carouselCount = allMediaUrls.length;
  const activeMedia = allMediaUrls[carouselIndex] ?? { url: previewUrl, isVideo };

  const storedDefaultCollaborator = useAuthStore((s) => s.defaultCollaborator);
  const setDefaultCollaborator = useAuthStore((s) => s.setDefaultCollaborator);

  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtagInput, setHashtagInput] = useState(post.hashtags?.join(" ") ?? "");
  const existingCollabStr = post.collaborators?.join(", ") ?? "";
  const [collaborators, setCollaborators] = useState(
    existingCollabStr ||
    (storedDefaultCollaborator ? `@${storedDefaultCollaborator}` : "")
  );
  const [useDefaultCollab, setUseDefaultCollab] = useState(
    !existingCollabStr && Boolean(storedDefaultCollaborator)
  );
  const [scheduledFor, setScheduledFor] = useState(
    post.scheduledFor ? new Date(post.scheduledFor).toISOString().slice(0, 16) : ""
  );
  const [actionError, setActionError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(post.title ?? "");
    setCaption(post.caption ?? "");
    setHashtagInput(post.hashtags?.join(" ") ?? "");
    const freshCollab = post.collaborators?.join(", ") ?? "";
    setCollaborators(freshCollab || (storedDefaultCollaborator ? `@${storedDefaultCollaborator}` : ""));
    setUseDefaultCollab(!freshCollab && Boolean(storedDefaultCollaborator));
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
      onRefresh();
    },
    onError: (err) => setActionError(extractApiError(err, "Failed to save."))
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post._id}/publish`, { businessId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", businessId] });
      onDone();
    },
    onError: (err) => setActionError(extractApiError(err, "Publish failed."))
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${post._id}`, { params: { businessId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", businessId] });
      onDone();
    },
    onError: (err) => setActionError(extractApiError(err, "Delete failed."))
  });

  const generateCaptionMutation = useMutation({
    mutationFn: async () => {
      const assetIds = (post.mediaAssetIds ?? []).map((m) => (typeof m === "string" ? m : m._id));
      if (assetIds.length > 1) {
        const res = await api.post("/media/generate-carousel-caption", { businessId, mediaIds: assetIds });
        return { caption: (res.data?.data?.caption ?? "") as string, hashtags: (res.data?.data?.hashtags ?? []) as string[] };
      }
      const id = assetIds[0];
      if (!id) throw new Error("No media asset attached to this post");
      const res = await api.post(`/media/${id}/generate-caption`, { businessId });
      return {
        caption: (res.data?.data?.caption ?? res.data?.data?.asset?.aiCaption ?? "") as string,
        hashtags: (res.data?.data?.hashtags ?? []) as string[]
      };
    },
    onSuccess: ({ caption: newCaption, hashtags }) => {
      if (newCaption) setCaption(newCaption);
      if (hashtags.length) setHashtagInput(hashtags.join(" "));
    },
    onError: (err) => setActionError(extractApiError(err, "Caption generation failed."))
  });

  const isLive = post.status === "live";
  const isPosting = post.status === "posting";
  const anyLoading =
    updateMutation.isPending ||
    publishMutation.isPending ||
    deleteMutation.isPending ||
    generateCaptionMutation.isPending;

  const badgeStyle = STATUS_BADGE_STYLE[post.status] ?? { bg: "var(--bg-2)", color: "var(--ink-2)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden shadow-2xl max-h-[90vh]"
        style={{ background: "var(--surface)", borderRadius: "22px" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold truncate max-w-xs" style={{ color: "var(--ink)" }}>
              {post.title}
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: badgeStyle.bg, color: badgeStyle.color }}
            >
              {post.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full transition"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Icons.X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: preview */}
          <div
            className="hidden w-56 shrink-0 sm:flex sm:flex-col"
            style={{ borderRight: "1px solid var(--line)", background: "var(--bg)" }}
          >
            <div className="relative flex flex-1 items-center justify-center p-4">
              {activeMedia.url ? (
                activeMedia.isVideo ? (
                  <video
                    key={activeMedia.url}
                    src={activeMedia.url}
                    className="w-full rounded-[14px] object-cover shadow-md"
                    style={{ maxHeight: 240 }}
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    key={activeMedia.url}
                    src={activeMedia.url}
                    alt={post.title}
                    className="w-full rounded-[14px] object-cover shadow-md"
                    style={{ maxHeight: 240 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )
              ) : (
                <div
                  className="flex aspect-square w-full items-center justify-center rounded-[14px]"
                  style={{ background: "var(--bg-2)" }}
                >
                  <Icons.Image size={40} style={{ color: "var(--line-2)" } as React.CSSProperties} />
                </div>
              )}

              {carouselCount > 1 && (
                <>
                  <button
                    onClick={() => setCarouselIndex((i) => (i - 1 + carouselCount) % carouselCount)}
                    className="absolute left-5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                  >
                    <Icons.ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setCarouselIndex((i) => (i + 1) % carouselCount)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                  >
                    <Icons.ChevronRight size={13} />
                  </button>
                </>
              )}
            </div>

            {carouselCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 pb-3">
                {allMediaUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIndex(i)}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === carouselIndex ? 16 : 6,
                      background: i === carouselIndex ? "var(--accent)" : "var(--line-2)"
                    }}
                  />
                ))}
              </div>
            )}

            {isLive && post.permalink && (
              <div className="px-4 pb-4">
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[12px] py-2 text-center text-xs font-semibold text-white ig-grad"
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
                <label className="section-eyebrow mb-1.5 block">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isLive}
                  className="input w-full"
                />
              </div>

              {/* Caption */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="section-eyebrow">Caption</label>
                  {!isLive && (
                    <button
                      onClick={() => generateCaptionMutation.mutate()}
                      disabled={anyLoading || !post.mediaAssetIds?.length}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50"
                      style={{
                        background: "var(--accent-soft)",
                        border: "1px solid var(--accent)",
                        color: "var(--accent)"
                      }}
                    >
                      {generateCaptionMutation.isPending ? (
                        <span className="inline-block size-3 animate-spin rounded-full border border-current border-t-transparent" />
                      ) : (
                        <Icons.Sparkles size={11} />
                      )}
                      {generateCaptionMutation.isPending ? "Generating…" : "Generate Caption & Hashtags"}
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={isLive}
                  className="input w-full resize-none"
                />
              </div>

              {/* Hashtags */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="section-eyebrow">Hashtags</label>
                </div>
                <textarea
                  rows={2}
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  disabled={isLive}
                  placeholder="#hashtag1 #hashtag2 #hashtag3…"
                  className="input w-full resize-none"
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
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--info-soft)", color: "var(--info)" }}
                        >
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Collaborators */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="section-eyebrow">Collaborators</label>
                  {storedDefaultCollaborator && !isLive && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={useDefaultCollab}
                        onChange={(e) => {
                          setUseDefaultCollab(e.target.checked);
                          setCollaborators(e.target.checked ? `@${storedDefaultCollaborator}` : "");
                        }}
                        className="h-3 w-3 rounded accent-[var(--brand)]"
                      />
                      Use @{storedDefaultCollaborator}
                    </label>
                  )}
                </div>
                <input
                  value={collaborators}
                  onChange={(e) => {
                    setCollaborators(e.target.value);
                    if (useDefaultCollab) setUseDefaultCollab(false);
                  }}
                  disabled={isLive}
                  placeholder="@username1, @username2"
                  className="input w-full"
                />
                {!isLive && collaborators.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const handle = collaborators.trim().split(",")[0].trim().replace(/^@/, "");
                      if (handle) {
                        setDefaultCollaborator(handle);
                        setUseDefaultCollab(true);
                      }
                    }}
                    className="mt-1 text-[10px] font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--brand)" }}
                  >
                    Save as default
                  </button>
                )}
              </div>

              {/* Schedule */}
              {!isLive && (
                <div>
                  <label className="section-eyebrow mb-1.5 block">Scheduled For</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="input w-full"
                  />
                  <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                    Clear to remove scheduling (saves as draft).
                  </p>
                </div>
              )}

              {/* Post info */}
              <div
                className="rounded-[14px] px-4 py-3 text-xs space-y-1"
                style={{ background: "var(--bg)", color: "var(--muted)" }}
              >
                {post.postType && (
                  <div className="flex justify-between">
                    <span>Type</span>
                    <span className="font-medium capitalize" style={{ color: "var(--ink-2)" }}>{post.postType}</span>
                  </div>
                )}
                {post.scheduledFor && (
                  <div className="flex justify-between">
                    <span>Scheduled</span>
                    <span className="font-medium" style={{ color: "var(--ink-2)" }}>{formatSchedule(post.scheduledFor)}</span>
                  </div>
                )}
                {post.igMediaId && (
                  <div className="flex justify-between">
                    <span>Instagram ID</span>
                    <span className="font-mono" style={{ color: "var(--ink-2)" }}>{post.igMediaId}</span>
                  </div>
                )}
                {post.retryCount ? (
                  <div className="flex justify-between">
                    <span>Retry attempts</span>
                    <span className="font-medium" style={{ color: "var(--warn)" }}>{post.retryCount}/2</span>
                  </div>
                ) : null}
              </div>

              {post.lastError && (
                <div
                  className="rounded-[14px] px-4 py-3 text-xs space-y-1"
                  style={{ background: "var(--err-soft)", border: "1px solid var(--err)" }}
                >
                  <p className="font-semibold" style={{ color: "var(--err)" }}>Last publish error</p>
                  <p style={{ color: "var(--err)", opacity: 0.85 }}>{post.lastError}</p>
                </div>
              )}

              {actionError && (
                <div
                  className="rounded-[12px] px-3 py-2 text-xs"
                  style={{ background: "var(--err-soft)", color: "var(--err)" }}
                >
                  {actionError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex items-center gap-2">
            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={anyLoading}
                className="flex items-center gap-1.5 rounded-[12px] px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
                style={{
                  border: "1px solid var(--err)",
                  color: "var(--err)"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--err-soft)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Icons.Trash size={15} />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--err)" }}>Sure?</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={anyLoading}
                  className="rounded-[12px] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--err)" }}
                >
                  {deleteMutation.isPending ? "Deleting…" : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-[12px] px-3 py-2 text-xs font-semibold transition"
                  style={{ border: "1px solid var(--line)", color: "var(--ink-2)" }}
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
                className="btn-secondary disabled:opacity-50"
              >
                {publishMutation.isPending || isPosting ? "Publishing…" : "Publish Now"}
              </button>
            )}

            {/* Save */}
            {!isLive && (
              <button
                onClick={() => updateMutation.mutate()}
                disabled={anyLoading}
                className="btn-primary disabled:opacity-50"
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
  const storedDefaultCollaborator = useAuthStore((s) => s.defaultCollaborator);
  const setDefaultCollaborator = useAuthStore((s) => s.setDefaultCollaborator);

  const [postType, setPostType] = useState<"single" | "carousel" | "video" | "reel">(
    prefill.postType ?? "single"
  );
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(prefill.mediaIds ?? []);
  const [igAccountId, setIgAccountId] = useState(accounts[0]?._id ?? "");
  const [caption, setCaption] = useState(prefill.aiCaption ?? "");
  const [title, setTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [useDefaultCollab, setUseDefaultCollab] = useState(Boolean(storedDefaultCollaborator));
  const [collaborators, setCollaborators] = useState(
    storedDefaultCollaborator ? `@${storedDefaultCollaborator}` : ""
  );
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
      let generated = "";
      if (selectedMediaIds.length > 1) {
        const response = await api.post("/media/generate-carousel-caption", {
          businessId,
          mediaIds: selectedMediaIds
        });
        generated = response.data?.data?.caption ?? "";
      } else {
        const response = await api.post(`/media/${selectedMediaIds[0]}/generate-caption`, {
          businessId
        });
        generated = response.data?.data?.caption ?? response.data?.data?.asset?.aiCaption ?? "";
      }
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

      <div
        className="relative flex w-full max-w-md flex-col shadow-2xl sm:rounded-l-[22px]"
        style={{ background: "var(--surface)" }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <p className="section-eyebrow mb-0.5">New Post</p>
            <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>Create Post</h2>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full transition"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Icons.X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Post type */}
            <section>
              <p className="section-eyebrow mb-2">Post Type</p>
              <div className="grid grid-cols-4 gap-2">
                {POST_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    onClick={() => {
                      setPostType(pt.value);
                      setSelectedMediaIds([]);
                    }}
                    className="flex flex-col items-center gap-1 rounded-[12px] py-2.5 text-xs font-semibold transition"
                    style={{
                      background: postType === pt.value ? "var(--ink)" : "var(--bg-2)",
                      color: postType === pt.value ? "#fff" : "var(--ink-2)"
                    }}
                  >
                    <span className="text-base">{pt.icon}</span>
                    {pt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Instagram account */}
            <section>
              <p className="section-eyebrow mb-2">Instagram Account</p>
              <select
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                className="input w-full"
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
                <p className="section-eyebrow">Select Media</p>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {selectedMediaIds.length}/{maxSelect} selected
                </span>
              </div>
              {filteredMedia.length === 0 ? (
                <div
                  className="rounded-[14px] border-2 border-dashed py-8 text-center text-xs"
                  style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}
                >
                  No {postType === "video" || postType === "reel" ? "video" : "image"} assets.
                  <br />
                  Import files from Drive Browser first.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {filteredMedia.map((m) => {
                    const sel = selectedMediaIds.includes(m._id);
                    const mPreviewUrl = getMediaPreviewUrl(m);
                    const order = selectedMediaIds.indexOf(m._id);
                    return (
                      <button
                        key={m._id}
                        onClick={() => toggleMedia(m._id)}
                        title={m.originalName}
                        className="relative aspect-square overflow-hidden rounded-[10px] border-2 transition"
                        style={{
                          borderColor: sel ? "var(--ok)" : "transparent",
                          outline: sel ? "2px solid var(--ok-soft)" : "none"
                        }}
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
                          <div
                            className="flex h-full items-center justify-center text-[9px]"
                            style={{ background: "var(--bg-2)", color: "var(--muted)" }}
                          >
                            No preview
                          </div>
                        )}
                        {sel && (
                          <div
                            className="absolute inset-0 flex items-start justify-end p-1"
                            style={{ background: "rgba(47,143,92,0.18)" }}
                          >
                            <span
                              className="flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                              style={{ background: "var(--ok)" }}
                            >
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
                <p className="section-eyebrow">Caption</p>
                <button
                  onClick={generateAiCaption}
                  disabled={generatingCaption || !selectedMediaIds.length}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid var(--accent)",
                    color: "var(--accent)"
                  }}
                >
                  {generatingCaption ? (
                    <span className="inline-block size-3 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : (
                    <Icons.Sparkles size={11} />
                  )}
                  {generatingCaption ? "Generating…" : "AI Generate"}
                </button>
              </div>
              {!selectedMediaIds.length && (
                <p className="mb-1 text-[10px]" style={{ color: "var(--muted)" }}>
                  Select media first to enable AI.
                </p>
              )}
              <textarea
                ref={captionRef}
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your caption, or use AI Generate above…"
                className="input w-full resize-none"
              />
            </section>

            {/* Title */}
            <section>
              <p className="section-eyebrow mb-2">Title</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled from AI caption, or type here…"
                className="input w-full"
              />
            </section>

            {/* Schedule */}
            <section>
              <p className="section-eyebrow mb-2">Schedule (optional)</p>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="input w-full"
              />
              <p className="mt-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                Leave blank to save as draft. Set a time to auto-schedule the post.
              </p>
            </section>

            {/* Collaborators */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="section-eyebrow">Collaborators (optional)</p>
                {storedDefaultCollaborator && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                    <input
                      type="checkbox"
                      checked={useDefaultCollab}
                      onChange={(e) => {
                        setUseDefaultCollab(e.target.checked);
                        setCollaborators(e.target.checked ? `@${storedDefaultCollaborator}` : "");
                      }}
                      className="h-3 w-3 rounded accent-[var(--brand)]"
                    />
                    Use @{storedDefaultCollaborator}
                  </label>
                )}
              </div>
              <input
                value={collaborators}
                onChange={(e) => {
                  setCollaborators(e.target.value);
                  if (useDefaultCollab) setUseDefaultCollab(false);
                }}
                placeholder="@username1, @username2"
                className="input w-full"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  After publishing, each collaborator gets an invite in Instagram.
                </p>
                {collaborators.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const handle = collaborators.trim().split(",")[0].trim().replace(/^@/, "");
                      if (handle) {
                        setDefaultCollaborator(handle);
                        setUseDefaultCollab(true);
                      }
                    }}
                    className="ml-2 shrink-0 text-[10px] font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--brand)" }}
                  >
                    Save as default
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Drawer footer */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--line)" }}>
          {error && (
            <div
              className="mb-3 rounded-[12px] px-3 py-2 text-xs"
              style={{ background: "var(--err-soft)", color: "var(--err)" }}
            >
              {error}
            </div>
          )}
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="btn-primary w-full justify-center disabled:opacity-50"
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
