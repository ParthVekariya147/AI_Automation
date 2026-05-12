import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { ConfirmDialog } from "../components/queue/ConfirmDialog";
import { CountdownBadge } from "../components/queue/CountdownBadge";
import { HashtagInput } from "../components/queue/HashtagInput";
import { SchedulePicker } from "../components/queue/SchedulePicker";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { getMediaPreviewUrl } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, StatusPill, Tabs, Icons } from "../lib/ds";

const STATUS_RING: Record<string, string> = {
  new: "ring-slate-200",
  scheduled: "ring-blue-400",
  posting: "ring-amber-400",
  live: "ring-emerald-500",
  error: "ring-red-400",
  manual_review: "ring-orange-400",
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  new:           { bg: "var(--bg)",        color: "var(--ink-2)" },
  scheduled:     { bg: "var(--info-soft)", color: "var(--info)" },
  posting:       { bg: "var(--warn-soft)", color: "var(--warn)" },
  live:          { bg: "var(--ok-soft)",   color: "var(--ok)" },
  error:         { bg: "var(--err-soft)",  color: "var(--err)" },
  manual_review: { bg: "#fff3e0",          color: "#e65100" },
};

const STATUS_FILTERS = ["all", "new", "scheduled", "posting", "live", "error", "manual_review"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type ViewMode = "small" | "medium" | "large" | "list";

const gridClass: Record<ViewMode, string> = {
  small: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
  medium: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  large: "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3",
  list: "flex flex-col gap-2",
};

export function QueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<MediaAsset | null>(null);
  const [repairedIds, setRepairedIds] = useState<Set<string>>(new Set());

  const { data: items = [] } = useQuery<MediaAsset[]>({
    queryKey: ["queue", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
    refetchInterval: (query) => {
      const data = query.state.data as MediaAsset[] | undefined;
      return data?.some((item) => item.workflowStatus === "posting") ? 30_000 : false;
    },
  });

  useEffect(() => {
    if (!activeBusinessId || !items.length) return;
    const broken = items.filter(
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
        queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      }
    });
  }, [items, activeBusinessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) {
      c[item.workflowStatus] = (c[item.workflowStatus] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return items
      .filter((item) => statusFilter === "all" || item.workflowStatus === statusFilter)
      .filter((item) => {
        if (!needle) return true;
        return [item.originalName, item.driveFileId, item.groupId, item.aiCaption, item.folderName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      });
  }, [items, search, statusFilter]);

  async function patchRow(id: string, payload: Record<string, unknown>) {
    if (!activeBusinessId) return;
    try {
      await api.patch(`/media/${id}`, { businessId: activeBusinessId, ...payload });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    } catch (error) {
      toast({ tone: "error", title: "Update failed", description: extractApiError(error, "Could not update.") });
    }
  }

  async function removeRow(id: string) {
    if (!activeBusinessId || deletingId === id) return;
    try {
      setDeletingId(id);
      setConfirmDelete(null);
      await api.delete(`/media/${id}`, { params: { businessId: activeBusinessId } });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      toast({ tone: "success", title: "Removed from queue" });
    } catch (error) {
      toast({ tone: "error", title: "Remove failed", description: extractApiError(error, "Could not remove.") });
    } finally {
      setDeletingId(null);
    }
  }

  async function retryCaption(id: string) {
    if (!activeBusinessId) return;
    try {
      await api.post(`/media/${id}/generate-caption`, { businessId: activeBusinessId });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      toast({ tone: "success", title: "Caption regenerated" });
    } catch (error) {
      toast({ tone: "error", title: "Retry failed", description: extractApiError(error, "Could not retry caption.") });
    }
  }

  async function applyBulkGroupId() {
    if (!activeBusinessId || !selectedIds.length) return;
    setIsApplyingBulk(true);
    try {
      await Promise.allSettled(
        selectedIds.map((id) =>
          api.patch(`/media/${id}`, { businessId: activeBusinessId, groupId: bulkGroupId || null })
        )
      );
      toast({ tone: "success", title: "Group applied", description: `Updated ${selectedIds.length} items.` });
      setSelectedIds([]);
      setBulkGroupId("");
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
    } catch {
      toast({ tone: "error", title: "Bulk update failed" });
    } finally {
      setIsApplyingBulk(false);
    }
  }

  async function applyBulkRemove() {
    if (!activeBusinessId || !selectedIds.length) return;
    setConfirmBulkRemove(false);
    setIsApplyingBulk(true);
    try {
      await Promise.allSettled(
        selectedIds.map((id) =>
          api.delete(`/media/${id}`, { params: { businessId: activeBusinessId } })
        )
      );
      toast({ tone: "success", title: `Removed ${selectedIds.length} items.` });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
    } catch {
      toast({ tone: "error", title: "Bulk remove failed" });
    } finally {
      setIsApplyingBulk(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.length > 0 && selectedIds.length < filtered.length;
    }
  }, [selectedIds.length, filtered.length]);

  function toggleSelectAll() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((item) => item._id));
    }
  }

  const tabs = STATUS_FILTERS.map((s) => ({
    id: s,
    label: s === "all" ? "All"
         : s === "manual_review" ? "Manual Review"
         : s.charAt(0).toUpperCase() + s.slice(1),
    count: counts[s] ?? 0,
  }));

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Remove "${confirmDelete?.name}"?`}
        description="This will permanently delete the item from your queue."
        confirmLabel="Remove"
        destructive
        onConfirm={() => confirmDelete && removeRow(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmDialog
        open={confirmBulkRemove}
        title={`Remove ${selectedIds.length} items?`}
        description="This will permanently delete all selected items."
        confirmLabel="Remove all"
        destructive
        onConfirm={applyBulkRemove}
        onCancel={() => setConfirmBulkRemove(false)}
      />

      <PageHeader
        eyebrow="Pipeline"
        title="Content Queue"
        subtitle="Manage media, assign groups, schedule, and auto-publish."
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          tabs={tabs}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <div className="flex-1" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="input w-44"
          style={{ width: "176px" }}
        />
        {/* View mode */}
        <div
          className="flex items-center p-1 rounded-xl gap-0.5"
          style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
        >
          {(["small", "medium", "large", "list"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              title={m}
              className="flex size-7 items-center justify-center rounded-lg transition"
              style={{
                background: viewMode === m ? "var(--surface)" : "transparent",
                color: viewMode === m ? "var(--ink)" : "var(--muted)",
                boxShadow: viewMode === m ? "0 1px 2px rgba(0,0,0,.06)" : "none",
              }}
            >
              {m === "small" && <SmallGridIcon />}
              {m === "medium" && <MediumGridIcon />}
              {m === "large" && <LargeGridIcon />}
              {m === "list" && <ListIcon />}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3"
          style={{ background: "var(--info-soft)", border: "1px solid var(--info)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--info)" }}>
            {selectedIds.length} selected
          </span>
          <div className="h-4 w-px" style={{ background: "var(--info)" }} />
          <input
            value={bulkGroupId}
            onChange={(e) => setBulkGroupId(e.target.value)}
            placeholder="Group ID"
            className="input"
            style={{ width: "120px" }}
          />
          <button onClick={applyBulkGroupId} disabled={isApplyingBulk} className="btn-primary disabled:opacity-50">
            Apply Group
          </button>
          <div className="h-4 w-px" style={{ background: "var(--info)" }} />
          <button
            onClick={() => setConfirmBulkRemove(true)}
            disabled={isApplyingBulk}
            className="btn-secondary disabled:opacity-50"
            style={{ color: "var(--err)" }}
          >
            Remove Selected
          </button>
          <button onClick={() => setSelectedIds([])} className="ml-auto btn-ghost text-xs">
            Clear
          </button>
        </div>
      )}

      {/* Select all row */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={selectedIds.length === filtered.length && filtered.length > 0}
            onChange={toggleSelectAll}
            className="h-4 w-4 cursor-pointer rounded"
          />
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {selectedIds.length > 0
              ? `${selectedIds.length} of ${filtered.length} selected`
              : `Select all (${filtered.length})`}
          </span>
          {selectedIds.length > 0 && selectedIds.length < filtered.length && (
            <button
              onClick={() => setSelectedIds(filtered.map((item) => item._id))}
              className="text-xs font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Select all {filtered.length}
            </button>
          )}
        </div>
      )}

      {/* Content grid / list */}
      {filtered.length === 0 ? (
        <div
          className="rounded-[14px] border-2 border-dashed p-10 text-center"
          style={{ borderColor: "var(--line-2)", background: "var(--bg)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>No media in queue</p>
          <p className="mt-1 text-xs mb-4" style={{ color: "var(--muted)" }}>Import files from Drive Browser to get started</p>
          <Link to="/drive-browser" className="btn-primary">
            <Icons.Drive size={14} /> Browse Drive
          </Link>
        </div>
      ) : (
        <div className={gridClass[viewMode]}>
          {filtered.map((item) =>
            viewMode === "list" ? (
              <QueueListCard
                key={item._id}
                item={item}
                selected={selectedIds.includes(item._id)}
                deletingId={deletingId}
                onToggleSelect={toggleSelect}
                onEdit={() => setEditItem(item)}
                onDelete={() => setConfirmDelete({ id: item._id, name: item.originalName })}
                onPatch={(payload) => patchRow(item._id, payload)}
                onRetryCaption={item.workflowStatus === "manual_review" ? () => retryCaption(item._id) : undefined}
                onOpenInPosts={() =>
                  navigate("/posts", {
                    state: {
                      mediaIds: [item._id],
                      postType: item.postType,
                      aiCaption: item.aiCaption,
                      groupId: item.groupId,
                    },
                  })
                }
              />
            ) : (
              <QueueCard
                key={item._id}
                item={item}
                viewMode={viewMode}
                selected={selectedIds.includes(item._id)}
                deletingId={deletingId}
                onToggleSelect={toggleSelect}
                onEdit={() => setEditItem(item)}
                onDelete={() => setConfirmDelete({ id: item._id, name: item.originalName })}
              />
            )
          )}
        </div>
      )}

      <Panel title="Queue tips" description="How the workflow is structured.">
        <div className="grid gap-3 md:grid-cols-3">
          <Tip
            title="Carousel logic"
            body="Give the same Group ID to multiple images. They'll be posted as a carousel."
          />
          <Tip
            title="Auto-publish"
            body="Set a scheduled time and status to Scheduled. The backend will auto-publish at that time."
          />
          <Tip
            title="Analytics"
            body="Likes and reach are tracked per item so you can monitor performance without leaving the queue."
          />
        </div>
      </Panel>

      {editItem && (
        <EditDrawer
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(payload) => {
            patchRow(editItem._id, payload);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

/* ── View mode icons ──────────────────────────────────── */
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

/* ── Grid card ────────────────────────────────────────── */

function QueueCard({
  item,
  viewMode,
  selected,
  deletingId,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  item: MediaAsset;
  viewMode: ViewMode;
  selected: boolean;
  deletingId: string | null;
  onToggleSelect: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const infoVisible = viewMode !== "small";
  const previewUrl = getMediaPreviewUrl(item);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`relative aspect-square overflow-hidden rounded-2xl ring-2 ring-offset-2 ${STATUS_RING[item.workflowStatus] ?? "ring-slate-200"}`}
      >
        {item.postType && item.postType !== "single" && (
          <div className="absolute left-2 top-2 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur-sm">
            {item.postType}
          </div>
        )}

        <div className="absolute right-2 top-2 z-20">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item._id)}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 cursor-pointer rounded border-white/70 bg-white/80"
          />
        </div>

        <Link to={`/queue/${item._id}`} className="block h-full w-full">
          {previewUrl ? (
            item.mediaType === "video" ? (
              <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img
                src={previewUrl}
                alt={item.originalName}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-2)" }}>
              <Icons.Image size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />
            </div>
          )}
        </Link>

        {item.workflowStatus === "posting" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <svg className="size-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white drop-shadow-md">Posting</span>
          </div>
        )}

        {/* Always-visible action strip */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 px-2 py-2"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link to={`/queue/${item._id}`} className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow">
            Open
          </Link>
          <button onClick={onEdit} className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-white shadow">
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deletingId === item._id}
            className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-semibold text-white shadow disabled:opacity-60"
          >
            {deletingId === item._id ? "…" : "✕"}
          </button>
        </div>
      </div>

      {infoVisible && (
        <div className="space-y-0.5 px-0.5">
          <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--ink)" }} title={item.originalName}>
            {item.originalName}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={item.workflowStatus} />
            {item.scheduledTime && <CountdownBadge scheduledTime={item.scheduledTime} />}
          </div>
          {item.groupId && (
            <Link
              to={`/queue/group/${item.groupId}`}
              className="block truncate text-[10px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Group: {item.groupId}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* ── List card ────────────────────────────────────────── */

function QueueListCard({
  item,
  selected,
  deletingId,
  onToggleSelect,
  onEdit,
  onDelete,
  onPatch,
  onOpenInPosts,
  onRetryCaption,
}: {
  item: MediaAsset;
  selected: boolean;
  deletingId: string | null;
  onToggleSelect: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPatch?: (payload: Record<string, unknown>) => void;
  onOpenInPosts?: () => void;
  onRetryCaption?: () => void;
}) {
  const previewUrl = getMediaPreviewUrl(item);
  const [showStatus, setShowStatus] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatus(false);
      }
    }
    if (showStatus) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showStatus]);

  const sb = STATUS_BADGE[item.workflowStatus] ?? STATUS_BADGE.new;

  return (
    <div
      className="group flex items-center gap-3 rounded-[14px] px-3 py-3 transition"
      style={{
        background: selected ? "var(--info-soft)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--info)" : "var(--line)"}`,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(item._id)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded"
      />

      <Link
        to={`/queue/${item._id}`}
        className={`relative size-14 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-1 ${STATUS_RING[item.workflowStatus] ?? "ring-slate-200"}`}
      >
        {previewUrl ? (
          item.mediaType === "video" ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img
              src={previewUrl}
              alt={item.originalName}
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-2)" }}>
            <Icons.Image size={18} style={{ color: "var(--line-2)" } as React.CSSProperties} />
          </div>
        )}

        {item.workflowStatus === "posting" && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <svg className="size-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.originalName}</p>

          <div ref={statusRef} className="relative shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); if (onPatch) setShowStatus((v) => !v); }}
              className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition cursor-pointer"
              style={{ background: sb.bg, color: sb.color }}
            >
              {item.workflowStatus}
              {onPatch && <Icons.ChevronDown size={10} />}
            </button>
            {showStatus && onPatch && (
              <div
                className="absolute right-0 top-6 z-30 min-w-[130px] rounded-xl py-1 shadow-lg"
                style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
              >
                {(["new", "scheduled", "posting", "live", "error"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); onPatch({ workflowStatus: s }); setShowStatus(false); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs capitalize transition"
                    style={{
                      color: s === item.workflowStatus ? "var(--accent)" : "var(--ink-2)",
                      fontWeight: s === item.workflowStatus ? 700 : 500,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: STATUS_BADGE[s]?.color ?? "var(--muted)" }}
                    />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {item.postType && item.postType !== "single" && (
            <span className="chip-soft chip">{item.postType}</span>
          )}
          {item.folderName && (
            <span className="max-w-[100px] truncate text-[10px]" style={{ color: "var(--muted)" }}>{item.folderName}</span>
          )}
          {item.scheduledTime && <CountdownBadge scheduledTime={item.scheduledTime} />}
          {item.groupId && (
            <Link
              to={`/queue/group/${item.groupId}`}
              className="text-[10px] font-semibold"
              style={{ color: "var(--accent)" }}
              onClick={(e) => e.stopPropagation()}
            >
              Group: {item.groupId}
            </Link>
          )}
        </div>

        {(item.hashtags?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.hashtags!.slice(0, 4).map((tag) => (
              <span key={tag} className="chip" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                {tag}
              </span>
            ))}
            {item.hashtags!.length > 4 && (
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>+{item.hashtags!.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Link to={`/queue/${item._id}`} className="btn-secondary text-[11px]">Open</Link>
        <button onClick={onEdit} className="btn-secondary text-[11px]">Edit</button>
        {onOpenInPosts && (
          <button
            onClick={onOpenInPosts}
            className="btn-secondary text-[11px]"
            style={{ color: "var(--accent)" }}
          >
            → Posts
          </button>
        )}
        {item.workflowStatus === "manual_review" && onRetryCaption && (
          <button
            onClick={onRetryCaption}
            className="btn-secondary text-[11px]"
            style={{ color: "#e65100", borderColor: "#e65100" }}
          >
            Retry Caption
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deletingId === item._id}
          className="btn-secondary text-[11px] disabled:opacity-60"
          style={{ color: "var(--err)" }}
        >
          {deletingId === item._id ? "…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

/* ── Edit drawer ──────────────────────────────────────── */

function EditDrawer({
  item,
  onClose,
  onSave,
}: {
  item: MediaAsset;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const navigate = useNavigate();
  const [workflowStatus, setWorkflowStatus] = useState(item.workflowStatus);
  const [postType, setPostType] = useState<"single" | "carousel" | "video" | "reel">(
    item.postType ?? "single"
  );
  const [groupId, setGroupId] = useState(item.groupId ?? "");
  const [scheduledTime, setScheduledTime] = useState<string | null>(item.scheduledTime ?? null);
  const [aiCaption, setAiCaption] = useState(item.aiCaption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(item.hashtags ?? []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    onSave({
      workflowStatus,
      postType,
      groupId: groupId.trim() || null,
      scheduledTime,
      aiCaption: aiCaption.trim(),
      hashtags,
    });
  }

  function openInPosts() {
    onClose();
    navigate("/posts", {
      state: {
        mediaIds: [item._id],
        postType,
        aiCaption: aiCaption.trim() || item.aiCaption,
        groupId: groupId.trim() || item.groupId,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-sm flex-col shadow-2xl sm:rounded-l-[24px]" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>Edit Item</h2>
            <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{item.originalName}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex size-8 items-center justify-center rounded-full btn-ghost"
          >
            <Icons.X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            <section>
              <p className="section-eyebrow mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {(["new", "scheduled", "posting", "live", "error"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setWorkflowStatus(s)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition"
                    style={{
                      background: workflowStatus === s ? "var(--ink)" : "var(--bg)",
                      color: workflowStatus === s ? "#fff" : "var(--ink-2)",
                      border: `1px solid ${workflowStatus === s ? "var(--ink)" : "var(--line)"}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-eyebrow mb-2">Post Type</p>
              <div className="flex flex-wrap gap-2">
                {(["single", "carousel", "video", "reel"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPostType(t)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition"
                    style={{
                      background: postType === t ? "var(--ink)" : "var(--bg)",
                      color: postType === t ? "#fff" : "var(--ink-2)",
                      border: `1px solid ${postType === t ? "var(--ink)" : "var(--line)"}`,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-eyebrow mb-2">Group ID</p>
              <div className="flex items-center gap-2">
                <input
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="Leave blank to remove from group"
                  className="input flex-1"
                />
                {groupId.trim() && (
                  <Link
                    to={`/queue/group/${groupId.trim()}`}
                    onClick={onClose}
                    className="btn-secondary text-xs shrink-0"
                  >
                    View
                  </Link>
                )}
              </div>
            </section>

            <section>
              <p className="section-eyebrow mb-2">Schedule</p>
              <SchedulePicker value={scheduledTime} onChange={(iso) => setScheduledTime(iso ?? null)} />
            </section>

            <section>
              <p className="section-eyebrow mb-2">Caption</p>
              <textarea
                rows={4}
                value={aiCaption}
                onChange={(e) => setAiCaption(e.target.value)}
                placeholder="Write a caption…"
                className="input w-full resize-none"
                style={{ fontFamily: "inherit", fontSize: "13px", lineHeight: "1.5" }}
              />
              <p className="mt-1 text-right text-[10px]" style={{ color: "var(--muted)" }}>
                {aiCaption.length}/2200
              </p>
            </section>

            <section>
              <p className="section-eyebrow mb-2">Hashtags</p>
              <HashtagInput tags={hashtags} onChange={setHashtags} />
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-6 py-4" style={{ borderTop: "1px solid var(--line)" }}>
          <button
            onClick={openInPosts}
            className="btn-secondary w-full justify-center"
            style={{ color: "var(--accent)" }}
          >
            Open in Posts →
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1 justify-center">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tip ──────────────────────────────────────────────── */

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] p-3.5" style={{ background: "var(--bg)" }}>
      <h4 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{title}</h4>
      <p className="mt-1 text-xs leading-5" style={{ color: "var(--ink-2)" }}>{body}</p>
    </div>
  );
}
