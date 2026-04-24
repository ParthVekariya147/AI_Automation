import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { getMediaPreviewUrl } from "../lib/media";
import type { MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

const statusOptions = ["new", "scheduled", "posting", "live", "error"] as const;
const postTypeOptions = ["single", "carousel", "video"] as const;

export function QueuePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [search, setSearch] = useState("");

  const { data: items = [] } = useQuery<MediaAsset[]>({
    queryKey: ["queue", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    if (!needle) return items;
    return items.filter((item) =>
      [item.originalName, item.driveFileId, item.groupId, item.aiCaption]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, search]);

  async function patchRow(id: string, payload: Record<string, unknown>) {
    if (!activeBusinessId) return;
    try {
      await api.patch(`/media/${id}`, { businessId: activeBusinessId, ...payload });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    } catch (error) {
      toast({
        tone: "error",
        title: "Update failed",
        description: extractApiError(error, "Queue row could not be updated.")
      });
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Content Queue"
        description="Each row is one imported media file. Use this table for media workflow updates, then use the Posts page for draft scheduling and publish actions."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file name, Drive file ID, group, or caption"
            className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2 lg:max-w-md"
          />
          <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-600">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} in queue
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[1360px] border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="px-3">Preview</th>
                <th className="px-3">File Name</th>
                <th className="px-3">Drive File ID</th>
                <th className="px-3">Status</th>
                <th className="px-3">Group ID</th>
                <th className="px-3">Post Type</th>
                <th className="px-3">Scheduled Time</th>
                <th className="px-3">AI Caption</th>
                <th className="px-3">IG Media ID</th>
                <th className="px-3">Likes / Reach</th>
                <th className="px-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item._id} className="rounded-2xl bg-[#fbfbf8] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  <td className="rounded-l-2xl px-3 py-4">
                    <Link
                      to={`/queue/${item._id}`}
                      className="flex h-14 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#d7ddd4] bg-[#eef1ea]"
                    >
                      {getMediaPreviewUrl(item) ? (
                        item.mediaType === "video" ? (
                          <video
                            src={getMediaPreviewUrl(item)}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={getMediaPreviewUrl(item)}
                            alt={item.originalName}
                            className="h-full w-full object-cover"
                          />
                        )
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                          No preview
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.originalName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {item.mediaType}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-600">
                    {item.driveFileId || "Local file"}
                  </td>
                  <td className="px-3 py-4">
                    <select
                      value={item.workflowStatus}
                      onChange={(event) =>
                        patchRow(item._id, { workflowStatus: event.target.value })
                      }
                      className="rounded-xl border border-[#d7ddd4] bg-white px-3 py-2 text-sm"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-4">
                    <input
                      defaultValue={item.groupId || ""}
                      onBlur={(event) => patchRow(item._id, { groupId: event.target.value || null })}
                      className="w-24 rounded-xl border border-[#d7ddd4] px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <select
                      value={item.postType}
                      onChange={(event) => patchRow(item._id, { postType: event.target.value })}
                      className="rounded-xl border border-[#d7ddd4] bg-white px-3 py-2 text-sm"
                    >
                      {postTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-4">
                    <input
                      type="datetime-local"
                      defaultValue={toInputDateTime(item.scheduledTime)}
                      onBlur={(event) =>
                        patchRow(item._id, {
                          scheduledTime: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : null
                        })
                      }
                      className="rounded-xl border border-[#d7ddd4] px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="max-w-[260px] px-3 py-4 text-sm text-slate-600">
                    <textarea
                      defaultValue={item.aiCaption || ""}
                      rows={3}
                      onBlur={(event) => patchRow(item._id, { aiCaption: event.target.value })}
                      className="w-full rounded-xl border border-[#d7ddd4] px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <input
                      defaultValue={item.igMediaId || ""}
                      onBlur={(event) => patchRow(item._id, { igMediaId: event.target.value })}
                      className="w-40 rounded-xl border border-[#d7ddd4] px-3 py-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-600">
                    {(item.likeCount || 0).toLocaleString()} / {(item.reachCount || 0).toLocaleString()}
                  </td>
                  <td className="rounded-r-2xl px-3 py-4">
                    <Link
                      to={`/queue/${item._id}`}
                      className="inline-flex rounded-full bg-[#10332b] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Queue tips"
        description="This table is built around your planned workflow."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Tip
            title="Carousel logic"
            body="Give the same Group ID to multiple image rows. That tells the workflow they belong to one carousel."
          />
          <Tip
            title="Scheduling"
            body="Set media-level schedule details here, then open Posts when you want to manage draft timing and publish actions together."
          />
          <Tip
            title="Analytics"
            body="Likes and reach sit on each row so the team can understand performance without leaving the queue."
          />
        </div>
      </Panel>
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-[#f6f7f2] p-5">
      <h4 className="text-base font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function toInputDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
