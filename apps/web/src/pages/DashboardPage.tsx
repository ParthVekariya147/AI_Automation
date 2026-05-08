import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, StatusPill, Icons } from "../lib/ds";

function StatCard({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "ok" | "info" | "warn" | "err";
  icon?: React.ReactNode;
}) {
  const toneMap: Record<string, { bg: string; fg: string; num: string }> = {
    default: { bg: "var(--surface)", fg: "var(--muted)", num: "var(--ink)" },
    ok:      { bg: "var(--ok-soft)", fg: "var(--ok)", num: "var(--ok)" },
    info:    { bg: "var(--info-soft)", fg: "var(--info)", num: "var(--info)" },
    warn:    { bg: "var(--warn-soft)", fg: "var(--warn)", num: "var(--warn)" },
    err:     { bg: "var(--err-soft)", fg: "var(--err)", num: "var(--err)" },
  };
  const t = toneMap[tone];
  return (
    <div
      className="rounded-[18px] p-5 flex flex-col gap-3"
      style={{ background: t.bg, border: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between">
        <p className="section-eyebrow">{label}</p>
        {icon && <span style={{ color: t.fg }}>{icon}</span>}
      </div>
      <p className="text-[32px] font-bold leading-none" style={{ color: t.num }}>
        {value}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { user, activeBusinessId } = useAuthStore();

  const { data: queueItems, isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["queue-overview", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const statusCounts = (queueItems || []).reduce<Record<string, number>>((acc, item) => {
    acc[item.workflowStatus] = (acc[item.workflowStatus] || 0) + 1;
    return acc;
  }, {});

  const upcoming = (queueItems || [])
    .filter((item) => item.scheduledTime)
    .sort((a, b) => new Date(a.scheduledTime!).getTime() - new Date(b.scheduledTime!).getTime())
    .slice(0, 5);

  const recentLive = (queueItems || [])
    .filter((item) => item.workflowStatus === "live")
    .slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.name?.split(" ")[0] ?? "there";

  if (!activeBusinessId) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 card">
        <div
          className="flex size-16 items-center justify-center rounded-2xl"
          style={{ background: "var(--bg)" }}
        >
          <Icons.Building size={28} style={{ color: "var(--muted)" } as React.CSSProperties} />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>No workspace selected</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Create a business first to activate the workflow.</p>
        </div>
        <Link to="/businesses" className="btn-primary">
          Create a business
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting}, ${displayName}`}
        subtitle="Here's what's happening with your content today."
        actions={
          <Link to="/posts" className="btn-primary">
            <Icons.Plus size={14} />
            New Post
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-[18px]" style={{ background: "var(--bg-2)" }} />
            ))
          : (
            <>
              <StatCard label="Live Posts" value={statusCounts.live || 0} tone="ok" icon={<Icons.CircleCheck size={16} />} />
              <StatCard label="Scheduled" value={statusCounts.scheduled || 0} tone="info" icon={<Icons.Calendar size={16} />} />
              <StatCard label="Drafts" value={statusCounts.new || 0} tone="default" icon={<Icons.Edit size={16} />} />
              <StatCard label="Errors" value={statusCounts.error || 0} tone="err" icon={<Icons.AlertTriangle size={16} />} />
            </>
          )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* Up next */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="section-eyebrow mb-1">Pipeline</p>
              <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>Up next</h2>
            </div>
            <Link to="/queue" className="btn-secondary text-[12px]">
              View Queue
              <Icons.ArrowRight size={13} />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl" style={{ background: "var(--bg)" }} />
              ))}
            </div>
          ) : !upcoming.length ? (
            <div
              className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center"
              style={{ borderColor: "var(--line-2)", background: "var(--bg)" }}
            >
              <Icons.Calendar size={28} style={{ color: "var(--line-2)" } as React.CSSProperties} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>No scheduled items yet</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>Import files from Drive and assign a schedule</p>
              </div>
              <Link to="/queue" className="btn-primary text-[12px]">Open Queue</Link>
            </div>
          ) : (
            <div className="divide-line">
              {upcoming.map((item, i) => (
                <Link
                  key={item._id}
                  to={`/queue/${item._id}`}
                  className="flex items-center justify-between py-3 gap-3 group"
                  style={{ color: "var(--ink)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: "var(--bg)" }}
                    >
                      <Icons.Image size={16} style={{ color: "var(--muted)" } as React.CSSProperties} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold leading-tight truncate max-w-[240px]">{item.originalName}</p>
                      <p className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: "var(--muted)" }}>{item.postType}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>
                      {new Date(item.scheduledTime!).toLocaleDateString()}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {new Date(item.scheduledTime!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-6">
          <div className="mb-5">
            <p className="section-eyebrow mb-1">Activity</p>
            <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>Quick links</h2>
          </div>
          <div className="space-y-1.5">
            {[
              { to: "/drive-browser", label: "Drive Browser", desc: "Browse & import media", icon: <Icons.Drive size={14} /> },
              { to: "/queue", label: "Content Queue", desc: "Manage media workflow", icon: <Icons.Layers size={14} /> },
              { to: "/posts", label: "Posts", desc: "Draft, schedule & publish", icon: <Icons.Image size={14} /> },
              { to: "/automations", label: "Automations", desc: "Set-and-forget publishing", icon: <Icons.Bolt size={14} /> },
              { to: "/integrations", label: "Integrations", desc: "Connect accounts", icon: <Icons.Plug size={14} /> },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition group"
                style={{ color: "var(--ink-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--accent)" }}>{link.icon}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{link.label}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>{link.desc}</p>
                </div>
                <Icons.ChevronRight size={13} className="ml-auto opacity-0 group-hover:opacity-100 transition" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Last published grid */}
      {recentLive.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-eyebrow mb-1">Content</p>
              <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>Last published</h2>
            </div>
            <Link to="/queue?status=live" className="btn-ghost">
              View all <Icons.ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {recentLive.map((item) => (
              <Link
                key={item._id}
                to={`/queue/${item._id}`}
                className="group relative aspect-square overflow-hidden rounded-xl"
                style={{ background: "var(--bg-2)" }}
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.originalName}
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Icons.Image size={20} style={{ color: "var(--line-2)" } as React.CSSProperties} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Icons.Eye size={16} className="text-white" />
                </div>
                <div className="absolute top-1.5 left-1.5">
                  <span className="px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[9px] font-semibold flex items-center gap-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
