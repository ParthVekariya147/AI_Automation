import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
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

  const { data: posts } = useQuery({
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
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Post pipeline" description="Drafts, smart timing, scheduling, and publishing actions.">
        <div className="space-y-3">
          {posts?.map((post: any) => (
            <div
              key={post._id}
              className="rounded-2xl border border-slate-200 px-4 py-4 text-sm text-slate-700"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{post.title}</p>
                  <p className="mt-1">{post.caption || "No caption yet"}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                    {post.status}
                  </p>
                </div>
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
              </div>
            </div>
          ))}
        </div>
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
