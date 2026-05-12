import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { HashtagInput } from "../components/queue/HashtagInput";
import { MediaPreview } from "../components/queue/MediaPreview";
import { SchedulePicker } from "../components/queue/SchedulePicker";
import { StatusPill } from "../components/queue/StatusPill";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { type WorkflowStatus } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function QueueGroupPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { groupId } = useParams();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState("new");
  const [postType, setPostType] = useState("carousel");
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: allItems = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["queue", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
  });

  const groupItems = allItems.filter((item) => item.groupId === groupId);
  const orderedItems = orderedIds.length
    ? orderedIds.map((id) => groupItems.find((i) => i._id === id)).filter(Boolean) as MediaAsset[]
    : groupItems;

  useEffect(() => {
    if (groupItems.length > 0) {
      const first = groupItems[0];
      setWorkflowStatus(first.workflowStatus || "new");
      setPostType(first.postType || "carousel");
      setScheduledTime(first.scheduledTime || null);
      setAiCaption(first.aiCaption || "");
      setHashtags(first.hashtags || []);
      if (!orderedIds.length) {
        setOrderedIds(groupItems.map((i) => i._id));
      }
    }
  }, [groupId, groupItems.length > 0 ? groupItems[0]._id : null]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedIds((ids) => {
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        return arrayMove(ids, oldIndex, newIndex);
      });
    }
  }

  async function updateGroup(payload: Record<string, unknown>) {
    if (!groupId || !activeBusinessId || !groupItems.length) return;
    setSaving(true);
    if (payload.workflowStatus !== undefined) setWorkflowStatus(payload.workflowStatus as string);
    if (payload.postType !== undefined) setPostType(payload.postType as string);
    if (payload.scheduledTime !== undefined) setScheduledTime(payload.scheduledTime as string | null);
    if (payload.aiCaption !== undefined) setAiCaption(payload.aiCaption as string);
    if (Array.isArray(payload.hashtags)) setHashtags(payload.hashtags as string[]);

    try {
      await Promise.allSettled(
        groupItems.map((item) =>
          api.patch(`/media/${item._id}`, { businessId: activeBusinessId, ...payload })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      toast({ tone: "success", title: "Group updated" });
    } catch (error) {
      toast({ tone: "error", title: "Update failed", description: extractApiError(error, "Could not update group.") });
    } finally {
      setSaving(false);
    }
  }

  async function generateCaption() {
    if (!groupId || !activeBusinessId || generating || !groupItems.length) return;
    setGenerating(true);
    try {
      const res = await api.post(`/media/${groupItems[0]._id}/generate-caption`, {
        businessId: activeBusinessId,
      });
      const caption = res.data?.data?.caption || res.data?.data?.asset?.aiCaption || "";
      const newHashtags: string[] = res.data?.data?.hashtags ?? [];
      setAiCaption(caption);
      const update: Record<string, unknown> = { aiCaption: caption };
      if (newHashtags.length) {
        setHashtags(newHashtags);
        update.hashtags = newHashtags;
      }
      await updateGroup(update);
      toast({ tone: "success", title: "Caption & hashtags generated" });
    } catch (error) {
      toast({ tone: "error", title: "Generation failed", description: extractApiError(error, "") });
    } finally {
      setGenerating(false);
    }
  }

  // Validation warnings
  const hasVideo = groupItems.some((i) => i.mediaType === "video");
  const hasImage = groupItems.some((i) => i.mediaType === "image");
  const isMixed = hasVideo && hasImage;
  const tooFew = groupItems.length < 2;
  const tooMany = groupItems.length > 10;

  if (isLoading) {
    return (
      <Panel title="Loading group…">
        <div className="h-96 animate-pulse rounded-3xl bg-[#f4f5f0]" />
      </Panel>
    );
  }

  if (!groupItems.length) {
    return (
      <div className="space-y-6">
        <Link to="/queue" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
          <ArrowLeft className="h-4 w-4" />
          Back to queue
        </Link>
        <Panel title="Group not found">
          <p className="text-sm text-slate-600">No media items found for Group ID: {groupId}</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/queue"
            className="flex items-center gap-2 text-sm font-medium text-emerald-800 hover:text-emerald-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Group: {groupId}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
            {postType === "carousel" ? " · Carousel" : ""}
          </p>
        </div>
        <button
          onClick={() =>
            navigate("/posts", {
              state: { mediaIds: orderedItems.map((i) => i._id), postType, aiCaption, groupId },
            })
          }
          className="shrink-0 rounded-2xl bg-[#10332b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0e2c25]"
        >
          Create Post Draft →
        </button>
      </div>

      {/* Validation warnings */}
      {(isMixed || tooFew || tooMany) && (
        <div className="space-y-2">
          {tooFew && (
            <Warning text="Carousel requires at least 2 items. Add more media to this group." />
          )}
          {tooMany && (
            <Warning text="Instagram carousels support a maximum of 10 items. Remove excess items." />
          )}
          {isMixed && (
            <Warning text="Mixing images and videos in one carousel is not supported by Instagram." />
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left: drag-to-reorder thumbnails */}
        <Panel
          title="Grouped Media"
          description="Drag to reorder carousel slides. Click a thumbnail to open its detail page."
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {orderedItems.map((item, index) => (
                  <SortableCard key={item._id} item={item} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </Panel>

        {/* Right: plan card */}
        <div className="space-y-4">
          {/* Status */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Status & Type</h3>

            <div>
              <p className="mb-2 text-xs text-slate-500 uppercase tracking-[0.14em]">Status (all items)</p>
              <div className="flex flex-wrap gap-2">
                {["new", "scheduled", "posting", "live", "error"].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateGroup({ workflowStatus: s })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      workflowStatus === s
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-[#d7ddd4] text-slate-500 hover:border-emerald-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-slate-500 uppercase tracking-[0.14em]">Post Type (all items)</p>
              <div className="flex flex-wrap gap-2">
                {["single", "carousel", "video", "reel"].map((t) => (
                  <button
                    key={t}
                    onClick={() => updateGroup({ postType: t })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      postType === t
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-[#d7ddd4] text-slate-500 hover:border-emerald-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-slate-500 uppercase tracking-[0.14em]">Schedule (all items)</p>
              <SchedulePicker
                value={scheduledTime}
                onChange={(iso) => updateGroup({ scheduledTime: iso ?? null })}
              />
            </div>
          </section>

          {/* Caption */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Caption</h3>
            <button
              type="button"
              onClick={generateCaption}
              disabled={generating}
              className="w-full rounded-full border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              {generating ? "Generating…" : "✦ Generate Group Caption"}
            </button>
            <textarea
              rows={6}
              value={aiCaption}
              onChange={(e) => setAiCaption(e.target.value)}
              onBlur={() => updateGroup({ aiCaption })}
              placeholder="Caption for the entire group…"
              className="w-full resize-none rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
            />
            <p className="text-right text-[10px] text-slate-400">{aiCaption.length}/2200</p>
          </section>

          {/* Hashtags */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Hashtags</h3>
            <HashtagInput
              tags={hashtags}
              onChange={(tags) => {
                setHashtags(tags);
                updateGroup({ hashtags: tags });
              }}
            />
          </section>

          {/* Save status */}
          <p className="text-center text-xs text-slate-400">
            {saving ? "Saving to all group items…" : "Changes apply to every item in this group."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Card ────────────────────────────────────────────────────────────

function SortableCard({ item, index }: { item: MediaAsset; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="overflow-hidden rounded-2xl border border-[#d7ddd4] bg-[#fbfbf8]">
      <div className="relative aspect-square overflow-hidden bg-[#eef1ea]">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 z-20 cursor-grab rounded-lg bg-black/40 p-1.5 text-white backdrop-blur-sm hover:bg-black/60 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
            <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM4 11a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" />
          </svg>
        </button>

        {/* Order badge */}
        <span className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-[10px] font-bold text-white backdrop-blur-sm">
          {index + 1}
        </span>

        <Link to={`/queue/${item._id}`} className="block h-full">
          <MediaPreview asset={item} className="h-full w-full" objectFit="cover" />
        </Link>
      </div>
      <div className="border-t border-[#d7ddd4] bg-white p-3">
        <p className="truncate text-sm font-medium text-slate-900" title={item.originalName}>
          {item.originalName}
        </p>
        <div className="mt-1">
          <StatusPill status={item.workflowStatus as WorkflowStatus} size="sm" />
        </div>
      </div>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="mt-0.5 shrink-0 font-bold">⚠</span>
      <span>{text}</span>
    </div>
  );
}
