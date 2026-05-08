import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function DashboardPage() {
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

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

  const stats = [
    { label: "All Files", value: queueItems?.length ?? 0, color: "bg-[#10332b]", textColor: "text-white" },
    { label: "New", value: statusCounts.new || 0, color: "bg-slate-100", textColor: "text-slate-900" },
    { label: "Scheduled", value: statusCounts.scheduled || 0, color: "bg-blue-50", textColor: "text-blue-900" },
    { label: "Live", value: statusCounts.live || 0, color: "bg-emerald-50", textColor: "text-emerald-900" },
    { label: "Errors", value: statusCounts.error || 0, color: "bg-red-50", textColor: "text-red-900" },
  ];

  const workflow = [
    { step: "1", text: "Connect Google Drive from the Drive Browser page." },
    { step: "2", text: "Select a folder and click Refresh Drive Data to load files." },
    { step: "3", text: "Go to Content Queue to organize media, Group IDs, and post types." },
    { step: "4", text: "Go to Posts to write captions, set schedules, and publish." },
  ];

  const navGuide = [
    { label: "Drive Browser", desc: "Fetch Drive data on demand and see cached image previews", to: "/drive-browser" },
    { label: "Content Queue", desc: "Manage imported media workflow, grouping and scheduling", to: "/queue" },
    { label: "Posts", desc: "Draft captions, set schedules, hashtags and publish to Instagram", to: "/posts" },
    { label: "Integrations", desc: "Connect Instagram accounts and review Drive connections", to: "/integrations" },
  ];

  if (!activeBusinessId) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[#d7ddd4] bg-white">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-[#f3f4ef]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-8 text-slate-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900">No workspace selected</h3>
          <p className="mt-1 text-sm text-slate-500">Create a business first to activate the workflow.</p>
        </div>
        <Link to="/businesses" className="rounded-full bg-[#10332b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0e2c25]">
          Create a business
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="mt-0.5 text-sm text-slate-500">Command center for the current workspace</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))
          : stats.map((stat) => (
              <div key={stat.label} className={`rounded-2xl ${stat.color} p-4`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${stat.textColor} opacity-60`}>
                  {stat.label}
                </p>
                <p className={`mt-2 text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
              </div>
            ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Upcoming schedule */}
        <div className="rounded-3xl border border-[#d7ddd4] bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Upcoming schedule</h2>
              <p className="mt-0.5 text-sm text-slate-500">Next items queued for publishing</p>
            </div>
            <Link
              to="/queue"
              className="rounded-full border border-[#d7ddd4] px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View all
            </Link>
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : !upcoming.length ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] py-10 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-8 text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-slate-700">No scheduled items yet</p>
                  <p className="mt-0.5 text-xs text-slate-400">Import files from Drive and assign a schedule</p>
                </div>
                <Link to="/queue" className="rounded-full bg-[#10332b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0e2c25]">
                  Open Queue
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((item) => (
                  <Link
                    key={item._id}
                    to={`/queue/${item._id}`}
                    className="flex items-center justify-between rounded-2xl border border-[#e8ece4] bg-[#fafbf8] px-4 py-3.5 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef1ea]">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-slate-500">
                          <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 9.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">{item.originalName}</p>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.postType}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-600">
                        {new Date(item.scheduledTime!).toLocaleDateString()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(item.scheduledTime!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Workflow steps */}
          <div className="rounded-3xl border border-[#d7ddd4] bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">Recommended workflow</h2>
            <p className="mt-0.5 text-sm text-slate-500">The flow is file-first, not tool-first</p>
            <ol className="mt-5 space-y-3">
              {workflow.map((w) => (
                <li key={w.step} className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#10332b] text-[11px] font-bold text-white">
                    {w.step}
                  </span>
                  <p className="text-sm leading-6 text-slate-700">{w.text}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Nav guide */}
          <div className="rounded-3xl border border-[#d7ddd4] bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">Where to manage what</h2>
            <div className="mt-4 space-y-2">
              {navGuide.map((g) => (
                <Link
                  key={g.to}
                  to={g.to}
                  className="block rounded-xl bg-[#f6f7f2] px-4 py-3 transition hover:bg-[#eef1ea]"
                >
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{g.label}</p>
                  <p className="mt-0.5 text-sm text-slate-700">{g.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
