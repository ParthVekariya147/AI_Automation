import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { CountdownBadge } from "../components/queue/CountdownBadge";
import { HashtagInput } from "../components/queue/HashtagInput";
import { MediaPreview } from "../components/queue/MediaPreview";
import { SchedulePicker } from "../components/queue/SchedulePicker";
import { StatusPill } from "../components/queue/StatusPill";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { formatSchedule, getMediaOpenUrl, type WorkflowStatus } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

const STATUS_OPTIONS: WorkflowStatus[] = ["new", "scheduled", "posting", "live", "error"];
const POST_TYPES = ["single", "carousel", "video", "reel"] as const;

export function QueueDetailPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { id } = useParams();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiCaption, setAiCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "metadata" | "activity">("preview");

  const { data, isLoading } = useQuery<{ asset: MediaAsset; relatedGroupAssets: MediaAsset[] }>({
    queryKey: ["queue-detail", id, activeBusinessId],
    queryFn: async () =>
      (await api.get(`/media/${id}`, { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(id && activeBusinessId),
    refetchInterval: (query) => {
      const asset = (query.state.data as { asset: MediaAsset } | undefined)?.asset;
      return asset?.workflowStatus === "posting" ? 15_000 : false;
    },
  });

  useEffect(() => {
    if (data?.asset) {
      setAiCaption(data.asset.aiCaption || "");
      setHashtags(data.asset.hashtags || []);
    }
  }, [data?.asset?._id]);

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
        description: extractApiError(error, "Queue details could not be updated."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function generateCaption() {
    if (!id || !activeBusinessId || generating) return;
    setGenerating(true);
    try {
      const res = await api.post(`/media/${id}/generate-caption`, { businessId: activeBusinessId });
      const caption = res.data?.data?.caption || res.data?.data?.asset?.aiCaption || "";
      setAiCaption(caption);
      queryClient.invalidateQueries({ queryKey: ["queue-detail", id, activeBusinessId] });
      toast({ tone: "success", title: "Caption generated" });
    } catch (error) {
      toast({ tone: "error", title: "Generation failed", description: extractApiError(error, "Could not generate caption.") });
    } finally {
      setGenerating(false);
    }
  }

  async function suggestHashtags(): Promise<string[]> {
    if (!id || !activeBusinessId) return [];
    setSuggesting(true);
    try {
      const res = await api.post(`/media/${id}/suggest-hashtags`, { businessId: activeBusinessId });
      return res.data?.data?.hashtags ?? [];
    } catch (error) {
      toast({ tone: "error", title: "Hashtag suggestion failed", description: extractApiError(error, "") });
      return [];
    } finally {
      setSuggesting(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Panel title="Loading…">
        <div className="h-96 animate-pulse rounded-3xl bg-[#f4f5f0]" />
      </Panel>
    );
  }

  const asset = data.asset;
  const openUrl = getMediaOpenUrl(asset);
  const isPastSchedule = asset.scheduledTime && new Date(asset.scheduledTime).getTime() < Date.now();

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
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{asset.originalName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={asset.workflowStatus as WorkflowStatus} pulse />
            {asset.scheduledTime && <CountdownBadge scheduledTime={asset.scheduledTime} />}
          </div>
        </div>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full bg-[#10332b] px-5 py-2.5 text-sm font-medium text-white"
          >
            Open original
          </a>
        )}
      </div>

      {/* Past schedule warning */}
      {isPastSchedule && asset.workflowStatus === "scheduled" && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">⚠</span>
          Scheduled time is in the past. Update the time or the scheduler will attempt to publish soon.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left column: preview + tabs */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-[#d7ddd4] bg-[#f5f6f1]">
            {/* Tab bar */}
            <div className="flex border-b border-[#d7ddd4]">
              {(["preview", "metadata", "activity"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                    activeTab === tab
                      ? "border-b-2 border-emerald-600 text-emerald-800"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Preview tab */}
            {activeTab === "preview" && (
              <div className="p-4">
                <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-[#edf1e8]" style={{ maxHeight: "60vh" }}>
                  <div className="aspect-square overflow-hidden">
                    <MediaPreview asset={asset} className="h-full w-full" objectFit="contain" />
                  </div>
                </div>
              </div>
            )}

            {/* Metadata tab */}
            {activeTab === "metadata" && (
              <div className="grid grid-cols-2 gap-3 p-4">
                <MetaCard label="Drive File ID" value={asset.driveFileId || "Not from Drive"} />
                <MetaCard label="Folder" value={asset.folderName || "Not assigned"} />
                <MetaCard label="Media Type" value={asset.mediaType} />
                <MetaCard label="Post Type" value={asset.postType} />
                <MetaCard label="Group ID" value={asset.groupId || "No group"} />
                <MetaCard label="Scheduled" value={formatSchedule(asset.scheduledTime)} />
                <MetaCard label="IG Media ID" value={asset.igMediaId || "Not published"} />
                <MetaCard label="Likes / Reach" value={`${asset.likeCount || 0} / ${asset.reachCount || 0}`} />
              </div>
            )}

            {/* Activity tab */}
            {activeTab === "activity" && (
              <div className="p-4">
                <ol className="relative border-l border-[#d7ddd4] pl-6 space-y-4">
                  <ActivityItem label="Imported" date={asset.createdAt} active />
                  {asset.workflowStatus !== "new" && (
                    <ActivityItem label={`Status: ${asset.workflowStatus}`} date={null} active />
                  )}
                  {asset.scheduledTime && (
                    <ActivityItem label="Scheduled to publish" date={asset.scheduledTime} active={false} />
                  )}
                  {asset.igMediaId && (
                    <ActivityItem label="Published to Instagram" date={null} active />
                  )}
                </ol>
              </div>
            )}
          </div>

          {/* Related group items */}
          {data.relatedGroupAssets.length > 1 && (
            <Panel
              title="Related group files"
              description={
                <div className="flex items-center justify-between">
                  <span>Files sharing the same Group ID.</span>
                  <Link to={`/queue/group/${asset.groupId}`} className="text-xs font-semibold text-emerald-700">
                    View full group →
                  </Link>
                </div>
              }
            >
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                {data.relatedGroupAssets.map((rel) => (
                  <Link
                    key={rel._id}
                    to={`/queue/${rel._id}`}
                    className="overflow-hidden rounded-2xl border border-[#d7ddd4] bg-[#fbfbf8] transition hover:border-emerald-300"
                  >
                    <div className="aspect-square overflow-hidden bg-[#eef1ea]">
                      <MediaPreview asset={rel} className="h-full w-full" objectFit="cover" />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-slate-900">{rel.originalName}</p>
                      <StatusPill status={rel.workflowStatus as WorkflowStatus} size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Right column: plan card */}
        <div className="space-y-4">
          {/* Status & Schedule */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-[0.14em]">Status & Schedule</h3>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateAsset({ workflowStatus: s })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      asset.workflowStatus === s
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
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Post Type</p>
              <div className="flex flex-wrap gap-2">
                {POST_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => updateAsset({ postType: t })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      asset.postType === t
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
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Scheduled Time</p>
              <SchedulePicker
                value={asset.scheduledTime}
                onChange={(iso) => updateAsset({ scheduledTime: iso ?? null })}
              />
            </div>
          </section>

          {/* Caption */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-[0.14em]">Caption</h3>
            <button
              type="button"
              onClick={generateCaption}
              disabled={generating}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              {generating ? "Generating…" : "✦ Generate with Gemini"}
            </button>
            <textarea
              rows={5}
              value={aiCaption}
              onChange={(e) => setAiCaption(e.target.value)}
              onBlur={() => updateAsset({ aiCaption })}
              placeholder="Write or generate a caption…"
              className="w-full resize-none rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
            />
            <p className="text-right text-[10px] text-slate-400">{aiCaption.length}/2200</p>
          </section>

          {/* Hashtags */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-[0.14em]">Hashtags</h3>
            <HashtagInput
              tags={hashtags}
              onChange={(tags) => {
                setHashtags(tags);
                updateAsset({ hashtags: tags });
              }}
              onSuggest={suggestHashtags}
              suggesting={suggesting}
            />
          </section>

          {/* Group */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-[0.14em]">Carousel Group</h3>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Group ID</span>
              <input
                defaultValue={asset.groupId || ""}
                onBlur={(e) => updateAsset({ groupId: e.target.value || null })}
                placeholder="Leave blank for no group"
                className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
              />
            </label>
            {asset.groupId && (
              <Link
                to={`/queue/group/${asset.groupId}`}
                className="inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View group ({data.relatedGroupAssets.length} items) →
              </Link>
            )}
          </section>

          {/* Analytics */}
          <section className="rounded-3xl border border-[#d7ddd4] bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-[0.14em]">Analytics</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">IG Media ID</span>
                <input
                  defaultValue={asset.igMediaId || ""}
                  onBlur={(e) => updateAsset({ igMediaId: e.target.value })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Likes</span>
                <input
                  type="number"
                  defaultValue={asset.likeCount || 0}
                  onBlur={(e) => updateAsset({ likeCount: Number(e.target.value) })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
                />
              </label>
              <label className="block col-span-2">
                <span className="mb-1 block text-xs text-slate-500">Reach</span>
                <input
                  type="number"
                  defaultValue={asset.reachCount || 0}
                  onBlur={(e) => updateAsset({ reachCount: Number(e.target.value) })}
                  className="w-full rounded-2xl border border-[#d7ddd4] px-3 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
                />
              </label>
            </div>
            {asset.igMediaId && (
              <a
                href={`https://www.instagram.com/p/${asset.igMediaId}/`}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View on Instagram →
              </a>
            )}
          </section>

          {/* Save status */}
          <p className="text-center text-xs text-slate-400">
            {saving ? "Saving…" : "Changes auto-save on field blur."}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ActivityItem({ label, date, active }: { label: string; date: string | null | undefined; active: boolean }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[19px] mt-1 flex h-3 w-3 items-center justify-center rounded-full border-2 ${active ? "border-emerald-500 bg-emerald-500" : "border-[#d7ddd4] bg-white"}`} />
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {date && <p className="text-xs text-slate-400">{new Date(date).toLocaleString()}</p>}
    </li>
  );
}
