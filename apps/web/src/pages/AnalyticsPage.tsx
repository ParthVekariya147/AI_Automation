import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [form, setForm] = useState({
    instagramAccountId: "",
    postDraftId: "",
    likeCount: "0"
  });

  const { data: likes } = useQuery({
    queryKey: ["likes", activeBusinessId],
    queryFn: async () =>
      (await api.get("/analytics/likes", { params: { businessId: activeBusinessId } })).data
        .data,
    enabled: Boolean(activeBusinessId)
  });

  async function submitSnapshot(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBusinessId) return;
    await api.post("/analytics/likes", {
      businessId: activeBusinessId,
      instagramAccountId: form.instagramAccountId,
      postDraftId: form.postDraftId,
      likeCount: Number(form.likeCount)
    });
    setForm({ instagramAccountId: "", postDraftId: "", likeCount: "0" });
    queryClient.invalidateQueries({ queryKey: ["likes", activeBusinessId] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Like analytics" description="This release stores only likes snapshots, as requested.">
        <div className="space-y-3">
          {likes?.map((snapshot: any) => (
            <div
              key={snapshot._id}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            >
              <p className="font-semibold text-slate-900">Likes: {snapshot.likeCount}</p>
              <p className="text-slate-600">
                {new Date(snapshot.fetchedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Record like count">
        <form className="grid gap-3" onSubmit={submitSnapshot}>
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Instagram account ID"
            value={form.instagramAccountId}
            onChange={(event) => setForm({ ...form, instagramAccountId: event.target.value })}
          />
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Post draft ID"
            value={form.postDraftId}
            onChange={(event) => setForm({ ...form, postDraftId: event.target.value })}
          />
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Like count"
            type="number"
            value={form.likeCount}
            onChange={(event) => setForm({ ...form, likeCount: event.target.value })}
          />
          <button className="rounded-2xl bg-brand-600 px-4 py-3 text-white">
            Save snapshot
          </button>
        </form>
      </Panel>
    </div>
  );
}
