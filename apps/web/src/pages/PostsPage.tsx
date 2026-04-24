import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { formatSchedule } from "../lib/media";
import type { PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function PostsPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [form, setForm] = useState({
    instagramAccountId: "",
    mediaAssetIds: "",
    title: "",
    caption: "",
    driveUploadRequested: false
  });

  const { data: posts = [] } = useQuery<PostDraft[]>({
    queryKey: ["posts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/posts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: accounts } = useQuery({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data
        .data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: media } = useQuery({
    queryKey: ["media", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  useEffect(() => {
    if (accounts?.[0]?._id && !form.instagramAccountId) {
      setForm((current) => ({ ...current, instagramAccountId: accounts[0]._id }));
    }
  }, [accounts, form.instagramAccountId]);

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBusinessId) return;

    await api.post("/posts", {
      businessId: activeBusinessId,
      instagramAccountId: form.instagramAccountId,
      mediaAssetIds: form.mediaAssetIds.split(",").map((item) => item.trim()).filter(Boolean),
      title: form.title,
      caption: form.caption,
      driveUploadRequested: form.driveUploadRequested
    });

    setForm({
      instagramAccountId: accounts?.[0]?._id ?? "",
      mediaAssetIds: "",
      title: "",
      caption: "",
      driveUploadRequested: false
    });
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
  }

  async function suggestHashtags(postId: string) {
    await api.post(`/posts/${postId}/suggest-hashtags`, {
      businessId: activeBusinessId
    });
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
  }

  async function schedulePost(postId: string) {
    await api.post(`/posts/${postId}/schedule`, {
      businessId: activeBusinessId
    });
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
  }

  async function publishPost(postId: string) {
    await api.post(`/posts/${postId}/publish`, {
      businessId: activeBusinessId
    });
    queryClient.invalidateQueries({ queryKey: ["posts", activeBusinessId] });
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Post management"
        description="Use this table to manage draft captions, scheduling, hashtags, and publish actions in one place."
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="px-3">Title</th>
                <th className="px-3">Instagram</th>
                <th className="px-3">Media</th>
                <th className="px-3">Status</th>
                <th className="px-3">Scheduled</th>
                <th className="px-3">Suggested</th>
                <th className="px-3">Hashtags</th>
                <th className="px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  key={post._id}
                  className="rounded-2xl bg-[#fbfbf8] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                >
                  <td className="rounded-l-2xl px-3 py-4">
                    <div>
                      <p className="font-medium text-slate-900">{post.title}</p>
                      <p className="mt-1 max-w-[260px] text-sm text-slate-600">
                        {post.caption || "No caption yet"}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700">
                    {post.instagramAccountId
                      ? `${post.instagramAccountId.name} (${post.instagramAccountId.handle})`
                      : "No account"}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700">
                    {post.mediaAssetIds?.length || 0} item{post.mediaAssetIds?.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-4">
                    <span className="rounded-full bg-[#eef2e5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                      {post.status}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700">
                    {formatSchedule(post.scheduledFor)}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700">
                    {formatSchedule(post.smartTimingSuggestedFor)}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-700">
                    {post.hashtags?.length ? post.hashtags.join(", ") : "Not generated"}
                  </td>
                  <td className="rounded-r-2xl px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => suggestHashtags(post._id)}
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium"
                      >
                        Hashtags
                      </button>
                      <button
                        onClick={() => schedulePost(post._id)}
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium"
                      >
                        Smart schedule
                      </button>
                      <button
                        onClick={() => publishPost(post._id)}
                        className="rounded-full bg-brand-600 px-3 py-2 text-xs font-medium text-white"
                      >
                        Publish now
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!posts.length ? (
          <div className="mt-6 rounded-3xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] p-8 text-center text-sm text-slate-600">
            No post drafts yet. Create one below after selecting an Instagram account and media.
          </div>
        ) : null}
      </Panel>

      <Panel title="Create draft">
        <form className="grid gap-3" onSubmit={createDraft}>
          <select
            className="rounded-2xl border border-slate-200 px-4 py-3"
            value={form.instagramAccountId}
            onChange={(event) => setForm({ ...form, instagramAccountId: event.target.value })}
          >
            <option value="">Select Instagram account</option>
            {accounts?.map((account: any) => (
              <option key={account._id} value={account._id}>
                {account.name} ({account.handle})
              </option>
            ))}
          </select>
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <textarea
            className="min-h-36 rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Final admin caption"
            value={form.caption}
            onChange={(event) => setForm({ ...form, caption: event.target.value })}
          />
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder={
              media?.length
                ? `Media IDs, e.g. ${media[0]._id}${media[1]?._id ? `, ${media[1]._id}` : ""}`
                : "Comma-separated media IDs"
            }
            value={form.mediaAssetIds}
            onChange={(event) => setForm({ ...form, mediaAssetIds: event.target.value })}
          />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
            <input
              checked={form.driveUploadRequested}
              onChange={(event) =>
                setForm({ ...form, driveUploadRequested: event.target.checked })
              }
              type="checkbox"
            />
            Upload to Drive as part of the admin flow
          </label>
          <button className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
            Create post draft
          </button>
        </form>
      </Panel>
    </div>
  );
}
