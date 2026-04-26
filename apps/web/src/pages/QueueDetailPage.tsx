import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { formatSchedule, getMediaOpenUrl, getMediaPreviewUrl } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function QueueDetailPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { id } = useParams();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiCaption, setAiCaption] = useState("");

  const { data, isLoading } = useQuery<{
    asset: MediaAsset;
    relatedGroupAssets: MediaAsset[];
  }>({
    queryKey: ["queue-detail", id, activeBusinessId],
    queryFn: async () =>
      (await api.get(`/media/${id}`, { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(id && activeBusinessId)
  });

  useEffect(() => {
    if (data?.asset) {
      setAiCaption(data.asset.aiCaption || "");
    }
  }, [data?.asset?._id, data?.asset?.aiCaption]);

  async function updateAsset(payload: Record<string, unknown>) {
    if (!id || !activeBusinessId) return;
    setSaving(true);
    try {
      await api.patch(`/media/${id}`, { businessId: activeBusinessId, ...payload });
      queryClient.invalidateQueries({ queryKey: ["queue-detail", id, activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    } catch (error) {
      toast({
        tone: "error",
        title: "Update failed",
        description: extractApiError(error, "Queue details could not be updated.")
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Panel title="Loading file details">
        <div className="h-96 animate-pulse rounded-3xl bg-[#f4f5f0]" />
      </Panel>
    );
  }

  const asset = data.asset;
  const previewUrl = getMediaPreviewUrl(asset);
  const openUrl = getMediaOpenUrl(asset);

  async function generateCaptionWithGemini() {
    if (!id || !activeBusinessId || generating) return;
    setGenerating(true);

    try {
      const response = await api.post(`/media/${id}/generate-caption`, {
        businessId: activeBusinessId
      });
      const generatedCaption = response.data?.data?.caption || response.data?.data?.asset?.aiCaption || "";
      setAiCaption(generatedCaption);
      queryClient.invalidateQueries({ queryKey: ["queue-detail", id, activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      toast({
        tone: "success",
        title: "Caption generated",
        description: "Gemini created a new caption for this media."
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/queue" className="text-sm font-medium text-emerald-800">
            Back to queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{asset.originalName}</h1>
        </div>
        {openUrl ? (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[#10332b] px-5 py-3 text-sm font-medium text-white"
          >
            Open original file
          </a>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Preview"
          description="Compact preview mode for faster review before editing scheduling and caption details."
        >
          <div className="mx-auto w-full max-w-lg overflow-hidden rounded-3xl border border-[#d7ddd4] bg-[#f5f6f1] p-4">
            <div className="aspect-square overflow-hidden rounded-2xl bg-[#edf1e8]">
              {asset.mediaType === "image" && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={asset.originalName}
                  className="h-full w-full bg-[#f0f2eb] object-contain"
                />
              ) : asset.mediaType === "video" ? (
                previewUrl ? (
                  <video src={previewUrl} controls className="h-full w-full bg-[#0f172a] object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    Video preview is not available
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500">
                  No preview available
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <MetaCard label="Drive File ID" value={asset.driveFileId || "Not from Drive"} />
            <MetaCard label="Folder" value={asset.folderName || "Not assigned"} />
            <MetaCard label="Status" value={asset.workflowStatus} />
            <MetaCard label="Post Type" value={asset.postType} />
            <MetaCard label="Group ID" value={asset.groupId || "No group"} />
            <MetaCard label="Scheduled Time" value={formatSchedule(asset.scheduledTime)} />
            <MetaCard label="IG Media ID" value={asset.igMediaId || "Not linked"} />
            <MetaCard
              label="Likes / Reach"
              value={`${asset.likeCount || 0} / ${asset.reachCount || 0}`}
            />
          </div>
        </Panel>

        <Panel title="Plan this file" description="Update the queue metadata from here.">
          <div className="space-y-4">
            <Field
              label="Status"
              input={
                <select
                  defaultValue={asset.workflowStatus}
                  onChange={(event) => updateAsset({ workflowStatus: event.target.value })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
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
              label="Group ID"
              input={
                <input
                  defaultValue={asset.groupId || ""}
                  onBlur={(event) => updateAsset({ groupId: event.target.value || null })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                />
              }
            />
            <Field
              label="Post Type"
              input={
                <select
                  defaultValue={asset.postType}
                  onChange={(event) => updateAsset({ postType: event.target.value })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
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
              label="Scheduled Time"
              input={
                <input
                  type="datetime-local"
                  defaultValue={toInputDateTime(asset.scheduledTime)}
                  onBlur={(event) =>
                    updateAsset({
                      scheduledTime: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null
                    })
                  }
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                />
              }
            />
            <Field
              label="AI Caption"
              input={
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={generateCaptionWithGemini}
                    disabled={generating}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? "Generating..." : "Generate with Gemini"}
                  </button>
                  <textarea
                    rows={6}
                    value={aiCaption}
                    onChange={(event) => setAiCaption(event.target.value)}
                    onBlur={() => updateAsset({ aiCaption })}
                    className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                  />
                </div>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="IG Media ID"
                input={
                  <input
                    defaultValue={asset.igMediaId || ""}
                    onBlur={(event) => updateAsset({ igMediaId: event.target.value })}
                    className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                  />
                }
              />
              <Field
                label="Likes"
                input={
                  <input
                    type="number"
                    defaultValue={asset.likeCount || 0}
                    onBlur={(event) => updateAsset({ likeCount: Number(event.target.value) })}
                    className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                  />
                }
              />
            </div>
            <Field
              label="Reach"
              input={
                <input
                  type="number"
                  defaultValue={asset.reachCount || 0}
                  onBlur={(event) => updateAsset({ reachCount: Number(event.target.value) })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3"
                />
              }
            />

            <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-600">
              {saving ? "Saving changes..." : "Changes save as you update each field."}
            </div>
          </div>
        </Panel>
      </div>

      {data.relatedGroupAssets.length > 1 ? (
        <Panel
          title="Related files in this group"
          description={
            <div className="flex items-center justify-between">
              <span>Compact suggestions for files that share the same Group ID.</span>
              <Link
                to={`/queue/group/${asset.groupId}`}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View Full Group
              </Link>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {data.relatedGroupAssets.map((related) => (
              <Link
                key={related._id}
                to={`/queue/${related._id}`}
                className="overflow-hidden rounded-2xl border border-[#d7ddd4] bg-[#fbfbf8] transition hover:border-emerald-300"
              >
                <div className="h-28 bg-[#eef1ea]">
                  {getMediaPreviewUrl(related) ? (
                    related.mediaType === "video" ? (
                      <video
                        src={getMediaPreviewUrl(related)}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={getMediaPreviewUrl(related)}
                        alt={related.originalName}
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No preview
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium text-slate-900">{related.originalName}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {related.workflowStatus}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Field({ label, input }: { label: string; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {input}
    </label>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f7f2] px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function toInputDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
