import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { formatSchedule, getMediaPreviewUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

const POST_TYPES = [
  { value: "single", label: "Single Image", icon: "🖼" },
  { value: "carousel", label: "Carousel", icon: "🗂" },
  { value: "video", label: "Video", icon: "🎬" },
  { value: "reel", label: "Reel", icon: "🎞" }
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-50 text-blue-700",
  posting: "bg-amber-50 text-amber-700",
  live: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700"
};

interface LocationState {
  mediaIds?: string[];
  postType?: "single" | "carousel" | "video" | "reel";
  aiCaption?: string;
  groupId?: string;
}

export function PostsPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const prefill = (location.state as LocationState) ?? {};

  const [igAccountId, setIgAccountId] = useState("");
  const [postType, setPostType] = useState<"single" | "carousel" | "video" | "reel">(
    prefill.postType ?? "single"
  );
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(prefill.mediaIds ?? []);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState(prefill.aiCaption ?? "");
  const [scheduledFor, setScheduledFor] = useState("");
  const [collaborators, setCollaborators] = useState("");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [createError, setCreateError] = useState("");
  const [actionStates, setActionStates] = useState<Record<string, { loading?: string; error?: string }>>({});
  const captionRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (accounts.length > 0 && !igAccountId) {
      setIgAccountId(accounts[0]._id);
    }
  }, [accounts, igAccountId]);

  const maxSelect = postType === "carousel" ? 10 : 1;

  function toggleMedia(id: string) {
    setSelectedMediaIds((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= maxSelect) return maxSelect === 1 ? [id] : prev;
      return [...prev, id];
    });
  }

  async function generateAiCaption() {
    if (!selectedMediaIds.length || !activeBusinessId) return;
    setGeneratingCaption(true);
    try {
      const response = await api.post(`/media/${selectedMediaIds[0]}/generate-caption`, {
        businessId: activeBusinessId
      });
      const generated =
        response.data?.data?.caption ?? response.data?.data?.asset?.aiCaption ?? "";
      setCaption(generated);
      setTimeout(() => captionRef.current?.focus(), 100);
    } catch (err) {
      setCreateError(extractApiError(err, "AI caption generation failed."));
    } finally {
      setGeneratingCaption(false);
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeBusinessId) throw new Error("No active business");
      if (!igAccountId) throw new Error("Select an Instagram account");
      if (!selectedMediaIds.length) throw new Error("Select at least one media item");
      if (!title.trim()) throw new Error("Title is required");

      const collaboratorList = collaborators
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean);

      return api.post("/posts", {
        businessId: activeBusinessId,
        instagramAccountId: igAccountId,
        mediaAssetIds: selectedMediaIds,
        title: title.trim(),
        caption: caption.trim(),
        postType,
        collaborators: collaboratorList,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined
      });
    },
    onSuccess: () => {
      setTitle("");
      setCaption("");
      setScheduledFor("");
      setCollaborators("");
      setSelectedMediaIds([]);
      setCreateError("");
      queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
    },
    onError: (err) => setCreateError(extractApiError(err, "Could not create draft."))
  });

  function setPostAction(postId: string, loading?: string, error?: string) {
    setActionStates((prev) => ({ ...prev, [postId]: { loading, error } }));
  }

  async function runPostAction(postId: string, action: "hashtags" | "schedule" | "publish") {
    setPostAction(postId, action);
    try {
      const endpoint =
        action === "hashtags"
          ? `/posts/${postId}/suggest-hashtags`
          : action === "schedule"
          ? `/posts/${postId}/schedule`
          : `/posts/${postId}/publish`;
      await api.post(endpoint, { businessId: activeBusinessId });
      queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
      setPostAction(postId);
    } catch (err) {
      setPostAction(postId, undefined, extractApiError(err, `Failed to ${action}.`));
    }
  }

  const filteredMedia = media.filter((m) => {
    if (postType === "video" || postType === "reel") return m.mediaType === "video";
    return m.mediaType === "image";
  });

  return (
    <div className="space-y-6">
      {/* ── Drafts table ── */}
      <Panel
        title="Post drafts"
        description="Manage captions, scheduling, and publishing for all your drafts."
      >
        {postsLoading ? (
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
            No drafts yet. Create your first post below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 pb-1">Title / Caption</th>
                  <th className="px-4 pb-1">Account</th>
                  <th className="px-4 pb-1">Type</th>
                  <th className="px-4 pb-1">Collab</th>
                  <th className="px-4 pb-1">Status</th>
                  <th className="px-4 pb-1">Scheduled</th>
                  <th className="px-4 pb-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <>
                    <tr key={post._id} className="bg-[#fbfbf8]">
                      <td className="rounded-l-2xl px-4 py-3">
                        <p className="font-semibold text-slate-900">{post.title}</p>
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">
                          {post.caption || "No caption"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {(post.instagramAccountId as any)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                          {post.postType ?? "single"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {post.collaborators?.length
                          ? post.collaborators.map((h) => `@${h}`).join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_COLORS[post.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {post.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatSchedule(post.scheduledFor) ?? "—"}
                      </td>
                      <td className="rounded-r-2xl px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <ActionButton
                            label={actionStates[post._id]?.loading === "hashtags" ? "…" : "Hashtags"}
                            onClick={() => runPostAction(post._id, "hashtags")}
                            disabled={!!actionStates[post._id]?.loading || post.status === "live"}
                          />
                          <ActionButton
                            label={actionStates[post._id]?.loading === "schedule" ? "…" : "Schedule"}
                            onClick={() => runPostAction(post._id, "schedule")}
                            disabled={!!actionStates[post._id]?.loading || post.status === "live"}
                          />
                          <ActionButton
                            label={actionStates[post._id]?.loading === "publish" ? "Publishing…" : "Publish now"}
                            primary
                            onClick={() => runPostAction(post._id, "publish")}
                            disabled={!!actionStates[post._id]?.loading || post.status === "live" || post.status === "posting"}
                          />
                        </div>
                      </td>
                    </tr>
                    {actionStates[post._id]?.error ? (
                      <tr key={`${post._id}-err`}>
                        <td colSpan={7} className="px-4 pb-2 pt-0 text-xs text-red-600">
                          {actionStates[post._id]?.error}
                        </td>
                      </tr>
                    ) : null}
                    {post.permalink ? (
                      <tr key={`${post._id}-link`}>
                        <td colSpan={7} className="px-4 pb-2 pt-0">
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-emerald-700 hover:underline"
                          >
                            View on Instagram →
                          </a>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Create draft ── */}
      <Panel title="Create new draft" description="Select media, write or generate a caption, and schedule or publish.">
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">

          {/* Left — media picker */}
          <div className="space-y-5">
            {/* Post type */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Post type</p>
              <div className="flex flex-wrap gap-2">
                {POST_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => {
                      setPostType(pt.value);
                      setSelectedMediaIds([]);
                    }}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                      postType === pt.value
                        ? "bg-[#10332b] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <span>{pt.icon}</span>
                    {pt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {postType === "carousel"
                  ? "Carousel — select up to 10 images. They post as a single swipeable post."
                  : postType === "reel"
                  ? "Reel — select one video. Appears in the Reels tab on Instagram."
                  : postType === "video"
                  ? "Video — select one video file. Posts as a standard feed video."
                  : "Single image post."}
              </p>
            </div>

            {/* Media selector */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Select media{" "}
                <span className="font-normal normal-case tracking-normal text-slate-400">
                  — {selectedMediaIds.length} of {maxSelect} selected
                </span>
              </p>

              {prefill.mediaIds?.length ? (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-emerald-600">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium text-emerald-800">
                    {prefill.mediaIds.length} item{prefill.mediaIds.length !== 1 ? "s" : ""} pre-selected from group <strong>{prefill.groupId}</strong>
                  </span>
                </div>
              ) : null}

              {filteredMedia.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                  No {postType === "video" || postType === "reel" ? "video" : "image"} assets found.
                  Import files from Drive Browser first.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {filteredMedia.map((m) => {
                    const selected = selectedMediaIds.includes(m._id);
                    const previewUrl = getMediaPreviewUrl(m);
                    const order = selectedMediaIds.indexOf(m._id);
                    return (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => toggleMedia(m._id)}
                        title={m.originalName}
                        className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                          selected
                            ? "border-emerald-500 ring-2 ring-emerald-200"
                            : "border-transparent hover:border-slate-300"
                        }`}
                      >
                        {previewUrl ? (
                          m.mediaType === "video" ? (
                            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
                          ) : (
                            <img src={previewUrl} alt={m.originalName} className="h-full w-full object-cover" />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center bg-slate-100 text-[9px] text-slate-400">
                            No preview
                          </div>
                        )}
                        {selected && (
                          <div className="absolute inset-0 flex items-start justify-end bg-emerald-900/20 p-1">
                            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow">
                              {order + 1}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right — form fields */}
          <div className="space-y-4">
            {/* Instagram account */}
            <Field label="Instagram account">
              <select
                value={igAccountId}
                onChange={(e) => setIgAccountId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Select account</option>
                {accounts.map((acc: any) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} (@{acc.handle?.replace(/^@/, "")})
                  </option>
                ))}
              </select>
            </Field>

            {/* Title */}
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. May Campaign — Post 1"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </Field>

            {/* Caption + AI generate */}
            <Field label="Caption">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={generateAiCaption}
                  disabled={generatingCaption || !selectedMediaIds.length}
                  className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingCaption ? (
                    <>
                      <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>✨ Generate with AI</>
                  )}
                </button>
                {!selectedMediaIds.length && (
                  <p className="text-[10px] text-slate-400">Select a media item first to enable AI caption.</p>
                )}
                <textarea
                  ref={captionRef}
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write your caption, or use ✨ Generate with AI above…"
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </Field>

            {/* Collaborators */}
            <Field label="Collaborators (optional)">
              <input
                value={collaborators}
                onChange={(e) => setCollaborators(e.target.value)}
                placeholder="@username1, @username2"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Enter Instagram handles to tag as collaborators. After publishing, each collaborator receives an invite in their Instagram app to accept — the post then appears on their profile too.
              </p>
            </Field>

            {/* Schedule */}
            <Field label="Schedule for (optional)">
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">Leave blank to use AI smart timing suggestion.</p>
            </Field>

            {createError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{createError}</div>
            )}

            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full rounded-2xl bg-[#10332b] py-3 text-sm font-semibold text-white transition hover:bg-[#0e2c25] disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating draft…" : "Create draft"}
            </button>
          </div>
        </div>
      </Panel>

      {/* ── How collaborators work ── */}
      <Panel title="How each feature works">
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="AI Caption"
            body="Select a media item, then click ✨ Generate with AI. Gemini analyses the image and writes an Instagram-ready caption. You can edit it before creating the draft."
          />
          <InfoCard
            title="Hashtags"
            body='After creating a draft, click "Hashtags" in the table. The system generates relevant hashtags from your caption text and saves them to the draft automatically.'
          />
          <InfoCard
            title="Collaborators"
            body="Enter Instagram @handles. After you publish, each person gets an invite notification inside the Instagram app. Once they accept, the post appears on their profile too. Meta does not allow accepting via API — it must be done manually in the app."
          />
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionButton({
  label,
  onClick,
  primary = false,
  disabled = false
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        primary
          ? "bg-[#10332b] text-white hover:bg-[#0e2c25]"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f7f2] p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{body}</p>
    </div>
  );
}
