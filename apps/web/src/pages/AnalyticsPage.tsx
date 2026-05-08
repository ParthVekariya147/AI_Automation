import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { formatSchedule, getMediaPreviewUrl, resolveApiAssetUrl } from "../lib/media";
import type { MediaAsset, PostDraft } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, Icons } from "../lib/ds";

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
      const res = await api.post("/reports/dev-report", { reportDate: devDate });
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
      const res = await api.post("/reports/save", { businessId: activeBusinessId, reportDate });
      setSaveResult(res.data.data);
    } catch {
      setSaveResult(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        subtitle="Post activity and performance overview."
        actions={
          <div className="flex items-center gap-2">
            <label className="section-eyebrow">Report date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="input"
              style={{ width: "auto" }}
            />
            <button onClick={saveReportToServer} disabled={postsLoading || saving} className="btn-primary disabled:opacity-50">
              {saving ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Icons.Download size={14} />
              )}
              {saving ? "Saving…" : "Save Report"}
            </button>
          </div>
        }
      />

      {/* Save result */}
      {saveResult && (
        <div className="flex items-start gap-3 rounded-[14px] px-4 py-3" style={{ background: "var(--ok-soft)", border: "1px solid var(--ok)" }}>
          <Icons.CircleCheck size={16} style={{ color: "var(--ok)" } as React.CSSProperties} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>Report saved successfully</p>
            <p className="mt-0.5 truncate font-mono text-xs" style={{ color: "var(--ok)" }}>{saveResult.savedTo}/{saveResult.fileName}</p>
          </div>
          <button onClick={() => setSaveResult(null)} className="ml-auto shrink-0 btn-ghost p-1">
            <Icons.X size={13} />
          </button>
        </div>
      )}

      {/* Day stats banner */}
      <div className="rounded-[18px] p-6 ig-grad">
        <p className="section-eyebrow text-white/60">Daily Report</p>
        <p className="mt-1 text-lg font-bold text-white">{formattedDate}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Posts Created", value: dayPosts.length },
            { label: "Published", value: dayPosts.filter(p => p.status === "live").length },
            { label: "Scheduled", value: dayPosts.filter(p => p.status === "scheduled").length },
            { label: "Drafts", value: dayPosts.filter(p => p.status === "new").length },
          ].map((s) => (
            <div key={s.label} className="rounded-xl px-3 py-2.5 bg-white/15">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{s.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
        {dayPosts.filter(p => p.status === "error").length > 0 && (
          <p className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200">
            {dayPosts.filter(p => p.status === "error").length} post(s) encountered an error on this day.
          </p>
        )}
      </div>

      {/* All-time stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Live", value: totalLive, tone: "ok" },
          { label: "Scheduled", value: totalScheduled, tone: "info" },
          { label: "Draft", value: totalDraft, tone: "default" },
          { label: "Posting", value: totalPosting, tone: "warn" },
          { label: "Error", value: totalError, tone: "err" },
        ].map((s) => {
          const toneMap: Record<string, { bg: string; fg: string }> = {
            default: { bg: "var(--surface)", fg: "var(--ink)" },
            ok:      { bg: "var(--ok-soft)", fg: "var(--ok)" },
            info:    { bg: "var(--info-soft)", fg: "var(--info)" },
            warn:    { bg: "var(--warn-soft)", fg: "var(--warn)" },
            err:     { bg: "var(--err-soft)", fg: "var(--err)" },
          };
          const t = toneMap[s.tone] ?? toneMap.default;
          return (
            <div key={s.label} className="rounded-[14px] p-4" style={{ background: t.bg, border: "1px solid var(--line)" }}>
              <p className="section-eyebrow mb-2">{s.label}</p>
              <p className="text-[26px] font-bold leading-none" style={{ color: t.fg }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Posts created on report date */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>
            Posts on {selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </h2>
          <span className="chip">{dayPosts.length}</span>
        </div>

        {postsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-[14px]" style={{ background: "var(--bg-2)" }} />)}
          </div>
        ) : dayPosts.length === 0 ? (
          <div className="rounded-[14px] border-2 border-dashed py-10 text-center text-sm" style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}>
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

      {/* Like snapshots */}
      {dayLikes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>
              Like Snapshots — {selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </h2>
            <span className="chip">{dayLikes.length}</span>
          </div>
          <div className="overflow-hidden rounded-[14px] divide-line" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
            {dayLikes.map((s: any) => (
              <div key={s._id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)" }}>
                  <Icons.Heart size={14} style={{ color: "var(--accent)" } as React.CSSProperties} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{s.likeCount.toLocaleString()} likes</p>
                  <p className="truncate text-[10px] font-mono" style={{ color: "var(--muted)" }}>{s.postDraftId}</p>
                </div>
                <p className="shrink-0 text-[11px]" style={{ color: "var(--muted)" }}>
                  {new Date(s.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Breakdown grids */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold" style={{ color: "var(--ink)" }}>All-time Status Breakdown</h2>
          {posts.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p> : (
            <div className="space-y-3">
              {statusGroups.map((g) => {
                const pct = Math.round((g.count / posts.length) * 100);
                const c = STATUS_COLORS[g.key] ?? STATUS_COLORS.new;
                return (
                  <div key={g.key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold" style={{ color: "var(--ink-2)" }}>{g.label}</span>
                      <span style={{ color: "var(--muted)" }}>{g.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-2)" }}>
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-right text-[10px]" style={{ color: "var(--muted)" }}>{posts.length} total posts</p>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold" style={{ color: "var(--ink)" }}>All-time Post Type Breakdown</h2>
          {posts.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p> : (
            <div className="space-y-3">
              {Object.entries(byType).map(([type, count]) => {
                const pct = Math.round((count / posts.length) * 100);
                return (
                  <div key={type}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold capitalize" style={{ color: "var(--ink-2)" }}>{type}</span>
                      <span style={{ color: "var(--muted)" }}>{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-2)" }}>
                      <div className={`h-full rounded-full ${TYPE_COLORS[type] ?? "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-right text-[10px]" style={{ color: "var(--muted)" }}>{posts.length} total posts</p>
            </div>
          )}
        </section>
      </div>

      {/* All posts */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>All Posts — Full Detail</h2>
          <span className="chip">{posts.length}</span>
        </div>
        {postsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-[14px]" style={{ background: "var(--bg-2)" }} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-[14px] border-2 border-dashed py-10 text-center text-sm" style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}>No posts found.</div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostDetailCard key={post._id} post={post} media={media} highlight={isSameDay(new Date(post.createdAt), selectedDay)} />
            ))}
          </div>
        )}
      </section>

      {/* Dev Report */}
      <section className="rounded-[18px] p-6" style={{ background: "var(--info-soft)", border: "2px solid var(--info)" }}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: "var(--info)" }}>Developer Daily Report</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--info)" }}>Reads git commits + current changes and saves an HTML report for your team leader.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="section-eyebrow">Report date</label>
            <input type="date" value={devDate} onChange={(e) => setDevDate(e.target.value)} className="input" style={{ width: "auto" }} />
            <button onClick={saveDevReportToServer} disabled={devSaving} className="btn-primary disabled:opacity-50" style={{ background: "var(--info)" }}>
              {devSaving ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Icons.Save size={14} />
              )}
              {devSaving ? "Generating…" : "Generate & Save"}
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: "🔖", label: "Git Commits", desc: "All commits on the selected date" },
            { icon: "📝", label: "Files Changed", desc: "Per commit + categorised by area" },
            { icon: "⚡", label: "Work in Progress", desc: "Current uncommitted changes" },
            { icon: "🆕", label: "New Files", desc: "Untracked files added today" }
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface)" }}>
              <p className="text-base">{icon}</p>
              <p className="mt-1 text-xs font-semibold" style={{ color: "var(--ink)" }}>{label}</p>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>{desc}</p>
            </div>
          ))}
        </div>

        {devResult && (
          <div className="mb-3 flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "var(--ok-soft)", border: "1px solid var(--ok)" }}>
            <Icons.CircleCheck size={16} style={{ color: "var(--ok)" } as React.CSSProperties} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
                Report saved — {devResult.commitsFound} commits · {devResult.wipFilesFound + devResult.newFilesFound} WIP files
              </p>
              <p className="mt-0.5 truncate font-mono text-xs" style={{ color: "var(--ok)" }}>{devResult.savedTo}/{devResult.fileName}</p>
            </div>
            <button onClick={() => setDevResult(null)} className="shrink-0 btn-ghost p-1">
              <Icons.X size={13} />
            </button>
          </div>
        )}
        {devError && (
          <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "var(--err-soft)", color: "var(--err)" }}>{devError}</div>
        )}
      </section>
    </div>
  );
}

/* ── Full-detail post card ────────────────────────────────── */
function PostDetailCard({ post, media, highlight }: { post: PostDraft; media: MediaAsset[]; highlight?: boolean }) {
  const sc = STATUS_COLORS[post.status] ?? STATUS_COLORS.new;
  const preview = getPostPreview(post, media);
  const isVideo = post.mediaAssetIds?.[0]?.mediaType === "video";

  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: highlight ? "var(--ok-soft)" : "var(--surface)",
        border: `1px solid ${highlight ? "var(--ok)" : "var(--line)"}`,
      }}
    >
      <div className="flex items-start gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-xl" style={{ background: "var(--bg-2)" }}>
          {preview ? (
            isVideo ? (
              <video src={preview} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img src={preview} alt={post.title} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <Icons.Image size={20} style={{ color: "var(--line-2)" } as React.CSSProperties} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>{post.title}</p>
            {highlight && <span className="chip" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>Report Day</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sc.bg} ${sc.text}`}>{post.status}</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-violet-700">{post.postType ?? "single"}</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <DetailRow label="Created" value={new Date(post.createdAt).toLocaleString()} />
            {post.scheduledFor && <DetailRow label="Scheduled For" value={formatSchedule(post.scheduledFor)} />}
            {typeof post.instagramAccountId === "object" && post.instagramAccountId && (
              <DetailRow label="IG Account" value={`${(post.instagramAccountId as any).name} (@${(post.instagramAccountId as any).handle})`} />
            )}
            {(post.mediaAssetIds?.length ?? 0) > 0 && (
              <DetailRow label="Media Files" value={`${post.mediaAssetIds!.length} file(s): ${post.mediaAssetIds!.map((m: any) => m.originalName ?? "").join(", ")}`} />
            )}
            {post.igMediaId && <DetailRow label="Instagram Media ID" value={post.igMediaId} mono />}
          </div>
        </div>
      </div>

      {post.caption && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="section-eyebrow mb-1">Caption</p>
          <p className="whitespace-pre-wrap text-xs" style={{ color: "var(--ink-2)" }}>{post.caption}</p>
        </div>
      )}

      {post.hashtags?.length ? (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="section-eyebrow mb-1.5">Hashtags ({post.hashtags.length})</p>
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className="chip" style={{ background: "var(--info-soft)", color: "var(--info)" }}>{tag}</span>
            ))}
          </div>
        </div>
      ) : null}

      {post.collaborators?.length ? (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="section-eyebrow mb-1">Collaborators</p>
          <p className="text-xs" style={{ color: "var(--ink-2)" }}>{post.collaborators.map((c) => `@${c}`).join(", ")}</p>
        </div>
      ) : null}

      {post.permalink && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
          <a href={post.permalink} target="_blank" rel="noreferrer" className="text-xs font-semibold" style={{ color: "var(--ok)" }}>
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
      <span className="section-eyebrow">{label}: </span>
      <span className={`text-[11px] ${mono ? "font-mono" : ""}`} style={{ color: "var(--ink-2)" }}>{value}</span>
    </div>
  );
}
