import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { formatSchedule, getMediaPreviewUrl, resolveApiAssetUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  live:      { bg: "bg-emerald-50",  text: "text-emerald-700", bar: "bg-emerald-500" },
  scheduled: { bg: "bg-blue-50",     text: "text-blue-700",    bar: "bg-blue-400"    },
  new:       { bg: "bg-slate-100",   text: "text-slate-600",   bar: "bg-slate-400"   },
  posting:   { bg: "bg-amber-50",    text: "text-amber-700",   bar: "bg-amber-400"   },
  error:     { bg: "bg-red-50",      text: "text-red-700",     bar: "bg-red-400"     }
};

const TYPE_COLORS: Record<string, string> = {
  single:   "bg-violet-400",
  carousel: "bg-blue-400",
  video:    "bg-orange-400",
  reel:     "bg-pink-400"
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getPostPreview(post: PostDraft, media: MediaAsset[]): string {
  const firstId = post.mediaAssetIds?.[0]?._id;
  if (firstId) {
    const full = media.find((m) => m._id === firstId);
    if (full) return getMediaPreviewUrl(full);
  }
  const m = post.mediaAssetIds?.[0];
  if (!m) return "";
  if (m.previewUrl) return resolveApiAssetUrl(m.previewUrl);
  if (m.publicUrl?.startsWith("http")) return m.publicUrl;
  if (m.publicUrl) return resolveApiAssetUrl(m.publicUrl);
  return "";
}



export function AnalyticsPage() {
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const memberships = useAuthStore((state) => state.memberships);
  const [reportDate, setReportDate] = useState("2026-05-07");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ fileName: string; savedTo: string } | null>(null);

  // Dev report state
  const [devDate, setDevDate] = useState(new Date().toISOString().slice(0, 10));
  const [devSaving, setDevSaving] = useState(false);
  const [devResult, setDevResult] = useState<{
    fileName: string; savedTo: string; commitsFound: number;
    wipFilesFound: number; newFilesFound: number; developerName: string;
  } | null>(null);
  const [devError, setDevError] = useState("");

  const activeMembership = memberships.find(
    (m) => (m.businessId as any)?._id === activeBusinessId
  );
  const businessName = (activeMembership?.businessId as any)?.name ?? "Business";

  const { data: posts = [], isLoading: postsLoading } = useQuery<PostDraft[]>({
    queryKey: ["posts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/posts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: media = [] } = useQuery<MediaAsset[]>({
    queryKey: ["media", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: likeSnapshots = [] } = useQuery<any[]>({
    queryKey: ["likes", activeBusinessId],
    queryFn: async () =>
      (await api.get("/analytics/likes", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const selectedDay = new Date(reportDate + "T00:00:00");

  const dayPosts    = posts.filter((p) => isSameDay(new Date(p.createdAt), selectedDay));
  const dayLikes    = likeSnapshots.filter((s: any) => isSameDay(new Date(s.fetchedAt), selectedDay));

  const totalLive      = posts.filter((p) => p.status === "live").length;
  const totalScheduled = posts.filter((p) => p.status === "scheduled").length;
  const totalDraft     = posts.filter((p) => p.status === "new").length;
  const totalError     = posts.filter((p) => p.status === "error").length;
  const totalPosting   = posts.filter((p) => p.status === "posting").length;

  const byType: Record<string, number> = {};
  for (const p of posts) {
    const t = p.postType ?? "single";
    byType[t] = (byType[t] ?? 0) + 1;
  }

  const statusGroups = [
    { key: "live",      label: "Live",      count: totalLive      },
    { key: "scheduled", label: "Scheduled", count: totalScheduled },
    { key: "new",       label: "Draft",     count: totalDraft     },
    { key: "posting",   label: "Posting",   count: totalPosting   },
    { key: "error",     label: "Error",     count: totalError     }
  ].filter((g) => g.count > 0);

  const formattedDate = selectedDay.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  async function saveDevReportToServer() {
    setDevSaving(true);
    setDevResult(null);
    setDevError("");
    try {
      const res = await api.post("/reports/dev-report", {
        reportDate: devDate
      });
      setDevResult(res.data.data);
    } catch (err: any) {
      setDevError(err?.response?.data?.message ?? "Failed to generate report.");
    } finally {
      setDevSaving(false);
    }
  }

  async function saveReportToServer() {
    if (!activeBusinessId) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await api.post("/reports/save", {
        businessId: activeBusinessId,
        reportDate
      });
      setSaveResult(res.data.data);
    } catch {
      setSaveResult(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Post activity and performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Report date</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={saveReportToServer}
            disabled={postsLoading || saving}
            className="flex items-center gap-2 rounded-xl bg-[#10332b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0e2c25] disabled:opacity-50"
          >
            {saving ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
            {saving ? "Saving…" : "Save Report"}
          </button>
        </div>
      </div>

      {/* Save result banner */}
      {saveResult && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0 text-emerald-600">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-800">Report saved successfully</p>
            <p className="mt-0.5 truncate font-mono text-xs text-emerald-700">{saveResult.savedTo}/{saveResult.fileName}</p>
          </div>
          <button onClick={() => setSaveResult(null)} className="ml-auto shrink-0 text-emerald-500 hover:text-emerald-700">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {/* Day banner */}
      <div className="rounded-2xl bg-gradient-to-br from-[#10332b] to-[#1a5c4a] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Daily Report</p>
        <p className="mt-1 text-lg font-bold text-white">{formattedDate}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DayStatCard label="Posts Created" value={dayPosts.length}                                              accent="white"   />
          <DayStatCard label="Published"     value={dayPosts.filter(p => p.status === "live").length}      accent="emerald" />
          <DayStatCard label="Scheduled"     value={dayPosts.filter(p => p.status === "scheduled").length} accent="blue"    />
          <DayStatCard label="Drafts"        value={dayPosts.filter(p => p.status === "new").length}       accent="slate"   />
        </div>
        {dayPosts.filter(p => p.status === "error").length > 0 && (
          <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200">
            ⚠ {dayPosts.filter(p => p.status === "error").length} post(s) encountered an error on this day.
          </p>
        )}
      </div>

      {/* Posts created on report date */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-800">
          Posts Created on {selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {dayPosts.length}
          </span>
        </h2>

        {postsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : dayPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            No posts were created on {formattedDate}.
          </div>
        ) : (
          <div className="space-y-3">
            {dayPosts.map((post) => (
              <PostDetailCard key={post._id} post={post} media={media} highlight />
            ))}
          </div>
        )}
      </section>

      {/* Like snapshots for date */}
      {dayLikes.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-800">
            Like Snapshots — {selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {dayLikes.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {dayLikes.map((s: any, idx: number) => (
              <div key={s._id} className={`flex items-center gap-3 px-4 py-3 ${idx !== dayLikes.length - 1 ? "border-b border-slate-50" : ""}`}>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-pink-50">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-pink-500">
                    <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.184C4.045 12.09 2 9.798 2 6.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 6.5c0 3.298-2.045 5.59-3.885 7.436a22.049 22.049 0 01-2.582 2.184 21.886 21.886 0 01-1.162.682l-.02.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{s.likeCount.toLocaleString()} likes</p>
                  <p className="truncate text-[10px] font-mono text-slate-400">{s.postDraftId}</p>
                </div>
                <p className="shrink-0 text-[11px] text-slate-400">
                  {new Date(s.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Breakdown grids */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">All-time Status Breakdown</h2>
          {posts.length === 0 ? <p className="text-sm text-slate-400">No posts yet.</p> : (
            <div className="space-y-3">
              {statusGroups.map((g) => {
                const pct = Math.round((g.count / posts.length) * 100);
                const c = STATUS_COLORS[g.key] ?? STATUS_COLORS.new;
                return (
                  <div key={g.key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{g.label}</span>
                      <span className="text-slate-400">{g.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-right text-[10px] text-slate-400">{posts.length} total posts</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">All-time Post Type Breakdown</h2>
          {posts.length === 0 ? <p className="text-sm text-slate-400">No posts yet.</p> : (
            <div className="space-y-3">
              {Object.entries(byType).map(([type, count]) => {
                const pct = Math.round((count / posts.length) * 100);
                return (
                  <div key={type}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold capitalize text-slate-700">{type}</span>
                      <span className="text-slate-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${TYPE_COLORS[type] ?? "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-right text-[10px] text-slate-400">{posts.length} total posts</p>
            </div>
          )}
        </section>
      </div>

      {/* All posts — full detail */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-800">
          All Posts — Full Detail
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {posts.length}
          </span>
        </h2>
        {postsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            No posts found.
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostDetailCard
                key={post._id}
                post={post}
                media={media}
                highlight={isSameDay(new Date(post.createdAt), selectedDay)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Dev Report ─────────────────────────────────────── */}
      <section className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-indigo-900">Developer Daily Report</h2>
            <p className="mt-0.5 text-xs text-indigo-500">
              Reads git commits + current changes and saves an HTML report for your team leader.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-indigo-500">Report date</label>
            <input
              type="date"
              value={devDate}
              onChange={(e) => setDevDate(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={saveDevReportToServer}
              disabled={devSaving}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {devSaving ? (
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                </svg>
              )}
              {devSaving ? "Generating…" : "Generate & Save"}
            </button>
          </div>
        </div>

        {/* What's included info */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: "🔖", label: "Git Commits", desc: "All commits on the selected date" },
            { icon: "📝", label: "Files Changed", desc: "Per commit + categorised by area" },
            { icon: "⚡", label: "Work in Progress", desc: "Current uncommitted changes" },
            { icon: "🆕", label: "New Files", desc: "Untracked files added today" }
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-xl bg-white px-3 py-2.5 shadow-sm">
              <p className="text-base">{icon}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">{label}</p>
              <p className="text-[10px] text-slate-400">{desc}</p>
            </div>
          ))}
        </div>

        {/* Result banner */}
        {devResult && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0 text-emerald-600">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-800">
                Report saved — {devResult.commitsFound} commits · {devResult.wipFilesFound + devResult.newFilesFound} WIP files
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-emerald-700">
                {devResult.savedTo}/{devResult.fileName}
              </p>
            </div>
            <button onClick={() => setDevResult(null)} className="shrink-0 text-emerald-400 hover:text-emerald-600">
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}

        {devError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{devError}</div>
        )}
      </section>
    </div>
  );
}

/* ── Full-detail post card ────────────────────────────────── */
function PostDetailCard({
  post,
  media,
  highlight
}: {
  post: PostDraft;
  media: MediaAsset[];
  highlight?: boolean;
}) {
  const sc = STATUS_COLORS[post.status] ?? STATUS_COLORS.new;
  const preview = getPostPreview(post, media);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100 bg-white"} shadow-sm`}>
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {preview ? (
            isVideo ? (
              <video src={preview} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img
                src={preview}
                alt={post.title}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-6 text-slate-300">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path strokeLinecap="round" d="M3 15l5-5 4 4 3-3 5 5" />
              </svg>
            </div>
          )}
        </div>

        {/* Header info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{post.title}</p>
            {highlight && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                Report Day
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sc.bg} ${sc.text}`}>
              {post.status}
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-violet-700">
              {post.postType ?? "single"}
            </span>
          </div>

          {/* Detail rows */}
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <DetailRow label="Created" value={new Date(post.createdAt).toLocaleString()} />
            {post.scheduledFor && (
              <DetailRow label="Scheduled For" value={formatSchedule(post.scheduledFor)} />
            )}
            {typeof post.instagramAccountId === "object" && post.instagramAccountId && (
              <DetailRow
                label="IG Account"
                value={`${(post.instagramAccountId as any).name} (@${(post.instagramAccountId as any).handle})`}
              />
            )}
            {(post.mediaAssetIds?.length ?? 0) > 0 && (
              <DetailRow
                label="Media Files"
                value={`${post.mediaAssetIds!.length} file(s): ${post.mediaAssetIds!.map((m: any) => m.originalName ?? "").join(", ")}`}
              />
            )}
            {post.igMediaId && (
              <DetailRow label="Instagram Media ID" value={post.igMediaId} mono />
            )}
          </div>
        </div>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Caption</p>
          <p className="whitespace-pre-wrap text-xs text-slate-700">{post.caption}</p>
        </div>
      )}

      {/* Hashtags */}
      {post.hashtags?.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Hashtags ({post.hashtags.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Collaborators */}
      {post.collaborators?.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Collaborators</p>
          <p className="text-xs text-slate-700">{post.collaborators.map((c) => `@${c}`).join(", ")}</p>
        </div>
      ) : null}

      {/* Instagram link */}
      {post.permalink && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-emerald-600 hover:underline"
          >
            View on Instagram →
          </a>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}: </span>
      <span className={`text-[11px] text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function DayStatCard({ label, value, accent }: { label: string; value: number; accent: "white" | "emerald" | "blue" | "slate" }) {
  const styles = {
    white:   "bg-white/10 text-white",
    emerald: "bg-emerald-400/20 text-emerald-100",
    blue:    "bg-blue-400/20 text-blue-100",
    slate:   "bg-slate-400/20 text-slate-200"
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${styles[accent]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
    </div>
  );
}
