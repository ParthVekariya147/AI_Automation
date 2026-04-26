import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { getMediaPreviewUrl } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function QueueGroupPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { groupId } = useParams();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  const [workflowStatus, setWorkflowStatus] = useState("new");
  const [postType, setPostType] = useState("carousel");
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState("");

  const { data: allItems = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["queue", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const groupItems = allItems.filter(item => item.groupId === groupId);

  // Initialize form state from the first item if not yet set
  useEffect(() => {
    if (groupItems.length > 0) {
      const first = groupItems[0];
      setWorkflowStatus(first.workflowStatus || "new");
      setPostType(first.postType || "carousel");
      setScheduledTime(first.scheduledTime || null);
      setAiCaption(first.aiCaption || "");
    }
  }, [groupId, groupItems.length > 0 ? groupItems[0]._id : null]);

  async function updateGroup(payload: Record<string, unknown>) {
    if (!groupId || !activeBusinessId || !groupItems.length) return;
    setSaving(true);
    
    // Update local state for immediate feedback
    if (payload.workflowStatus !== undefined) setWorkflowStatus(payload.workflowStatus as string);
    if (payload.postType !== undefined) setPostType(payload.postType as string);
    if (payload.scheduledTime !== undefined) setScheduledTime(payload.scheduledTime as string | null);
    if (payload.aiCaption !== undefined) setAiCaption(payload.aiCaption as string);

    try {
      await Promise.all(
        groupItems.map(item =>
          api.patch(`/media/${item._id}`, { businessId: activeBusinessId, ...payload })
        )
      );
      
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      toast({
        tone: "success",
        title: "Group updated",
        description: "Applied changes to all items in this group."
      });
    } catch (error) {
      toast({
        tone: "error",
        title: "Update failed",
        description: extractApiError(error, "Group details could not be updated.")
      });
    } finally {
      setSaving(false);
    }
  }

  async function generateCaptionWithGemini() {
    if (!groupId || !activeBusinessId || generating || !groupItems.length) return;
    setGenerating(true);

    try {
      // Use the first item to generate the caption context
      const representativeId = groupItems[0]._id;
      const response = await api.post(`/media/${representativeId}/generate-caption`, {
        businessId: activeBusinessId
      });
      
      const generatedCaption = response.data?.data?.caption || response.data?.data?.asset?.aiCaption || "";
      setAiCaption(generatedCaption);
      
      // Save it to all group items immediately
      await updateGroup({ aiCaption: generatedCaption });
      
      toast({
        tone: "success",
        title: "Group Caption generated",
        description: "Gemini created a new caption based on the first image, applied to the group."
      });
    } catch (error) {
      toast({
        tone: "error",
        title: "Caption generation failed",
        description: extractApiError(error, "Gemini could not generate the caption.")
      });
    } finally {
      setGenerating(false);
    }
  }

  if (isLoading) {
    return (
      <Panel title="Loading group details">
        <div className="h-96 animate-pulse rounded-3xl bg-[#f4f5f0]" />
      </Panel>
    );
  }

  if (!groupItems.length) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/queue" className="text-sm font-medium text-emerald-800">
            Back to queue
          </Link>
        </div>
        <Panel title="Group not found">
          <p className="text-sm text-slate-600">No media items found for Group ID: {groupId}</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/queue" className="text-sm font-medium text-emerald-800">
            Back to queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Group: {groupId}</h1>
          <p className="mt-1 text-sm text-slate-500">{groupItems.length} media items in this group</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <Panel
            title="Grouped Media"
            description="All items sharing this Group ID. For carousels, these will be posted together."
          >
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {groupItems.map((item, index) => {
                const previewUrl = getMediaPreviewUrl(item);
                return (
                  <Link
                    key={item._id}
                    to={`/queue/${item._id}`}
                    className="group overflow-hidden rounded-2xl border border-[#d7ddd4] bg-[#fbfbf8] transition hover:border-emerald-400 hover:ring-2 hover:ring-emerald-100"
                  >
                    <div className="relative aspect-square overflow-hidden bg-[#eef1ea]">
                      <span className="absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                        {index + 1}
                      </span>
                      {previewUrl ? (
                        item.mediaType === "video" ? (
                          <video
                            src={previewUrl}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={previewUrl}
                            alt={item.originalName}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-medium uppercase tracking-wider text-slate-500">
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="border-t border-[#d7ddd4] bg-white p-3">
                      <p className="truncate text-sm font-medium text-slate-900" title={item.originalName}>{item.originalName}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">
                        {item.mediaType}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title="Plan this group" description="Update metadata for all items simultaneously.">
          <div className="space-y-4">
            <Field
              label="Status (All Items)"
              input={
                <select
                  value={workflowStatus}
                  onChange={(event) => updateGroup({ workflowStatus: event.target.value })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {["new", "scheduled", "posting", "live", "error"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              }
            />
            <Field
              label="Post Type (All Items)"
              input={
                <select
                  value={postType}
                  onChange={(event) => updateGroup({ postType: event.target.value })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {["single", "carousel", "video"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              }
            />
            <Field
              label="Scheduled Time (All Items)"
              input={
                <input
                  type="datetime-local"
                  value={toInputDateTime(scheduledTime)}
                  onChange={(event) => setScheduledTime(event.target.value ? new Date(event.target.value).toISOString() : null)}
                  onBlur={(event) =>
                    updateGroup({
                      scheduledTime: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null
                    })
                  }
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              }
            />
            <Field
              label="AI Caption (All Items)"
              input={
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={generateCaptionWithGemini}
                    disabled={generating}
                    className="w-full rounded-full border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? "Generating..." : "Generate Group Caption"}
                  </button>
                  <textarea
                    rows={8}
                    value={aiCaption}
                    onChange={(event) => setAiCaption(event.target.value)}
                    onBlur={() => updateGroup({ aiCaption })}
                    placeholder="Enter a caption for the entire group..."
                    className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              }
            />

            <div className="mt-6 rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-600">
              {saving ? "Saving changes to group..." : "Changes save automatically as you update each field."}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, input }: { label: string; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</span>
      {input}
    </label>
  );
}

function toInputDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
