import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function DashboardPage() {
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const { data: queueItems } = useQuery<MediaAsset[]>({
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
    .sort(
      (a, b) =>
        new Date(a.scheduledTime || 0).getTime() - new Date(b.scheduledTime || 0).getTime()
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Operational summary"
          description="This is the command center for everything inside the selected business. Import files from Drive, assign group IDs for carousels, and manage the queue from one table."
        >
          <div className="grid gap-4 md:grid-cols-5">
            <StatCard label="All Files" value={queueItems?.length ?? 0} />
            <StatCard label="New" value={statusCounts.new || 0} />
            <StatCard label="Scheduled" value={statusCounts.scheduled || 0} />
            <StatCard label="Live" value={statusCounts.live || 0} />
            <StatCard label="Errors" value={statusCounts.error || 0} />
          </div>
        </Panel>

        <Panel
          title="Recommended workflow"
          description="The flow is now centered around files first, not separate tools."
        >
          <ol className="space-y-3 text-sm leading-6 text-slate-700">
            <li>1. Connect Google Drive from the Drive Browser page.</li>
            <li>2. Open a folder, preview image/video files, and import the ones you want.</li>
            <li>3. Go to Content Queue and fill `Group ID`, `Post Type`, `Scheduled Time`, and caption data.</li>
            <li>4. Open any row to edit details, preview the file, and update posting data.</li>
          </ol>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Upcoming schedule"
          description="The next items in the queue for the selected business."
        >
          {!upcoming.length ? (
            <EmptyState
              title="No scheduled items yet"
              body="Import files from Drive or local upload, then assign a schedule from the queue."
              actionLabel="Open Queue"
              to="/queue"
            />
          ) : (
            <div className="space-y-3">
              {upcoming.map((item) => (
                <Link
                  key={item._id}
                  to={`/queue/${item._id}`}
                  className="flex items-center justify-between rounded-2xl border border-[#d7ddd4] px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.originalName}</p>
                    <p className="text-sm text-slate-500">{item.postType.toUpperCase()}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    {item.scheduledTime
                      ? new Date(item.scheduledTime).toLocaleString()
                      : "Not scheduled"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Where to manage what"
          description="The new navigation matches the work itself."
        >
          <div className="space-y-4 text-sm text-slate-700">
            <InfoLine label="Drive Browser" value="See folders and preview Google Drive images/videos" />
            <InfoLine label="Content Queue" value="View the full table with scheduling and posting metadata" />
            <InfoLine label="Queue Detail" value="Open one file and edit all details in one place" />
            <InfoLine label="Integrations" value="Connect Instagram accounts and review Drive connections" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl bg-[#10332b] p-5 text-white">
      <p className="text-xs uppercase tracking-[0.25em] text-emerald-100/70">{label}</p>
      <p className="mt-3 text-4xl font-semibold">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  to
}: {
  title: string;
  body: string;
  actionLabel: string;
  to: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] p-8 text-center">
      <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      <Link
        to={to}
        className="mt-5 inline-flex rounded-full bg-[#10332b] px-5 py-3 text-sm font-medium text-white"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
