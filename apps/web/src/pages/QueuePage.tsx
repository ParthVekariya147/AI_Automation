import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
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
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

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

  async function removeRow(id: string, originalName: string) {
    if (!activeBusinessId || deletingRowId === id) return;

    const shouldRemove = window.confirm(`Remove ${originalName} from Content Queue?`);
    if (!shouldRemove) return;

    try {
      setDeletingRowId(id);
      await api.delete(`/media/${id}`, { params: { businessId: activeBusinessId } });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      toast({
        tone: "success",
        title: "Removed from queue",
        description: `${originalName} was removed.`
      });
    } catch (error) {
      toast({
        tone: "error",
        title: "Remove failed",
        description: extractApiError(error, "Queue row could not be removed.")
      });
    } finally {
      setDeletingRowId(null);
    }
  }

  useEffect(() => {
    const visibleIds = new Set(filtered.map((i) => i._id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filtered]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((item) => item._id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const applyBulkGroupId = async () => {
    if (!activeBusinessId || !selectedIds.length) return;
    setIsApplyingBulk(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          await api.patch(`/media/${id}`, { businessId: activeBusinessId, groupId: bulkGroupId || null });
          successCount++;
        })
      );
      toast({ tone: "success", title: "Bulk update complete", description: `Updated ${successCount} items.` });
      setSelectedIds([]);
      setBulkGroupId("");
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    } catch (error) {
      toast({ tone: "error", title: "Bulk update failed", description: "Some items failed to update." });
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const applyBulkRemove = async () => {
    if (!activeBusinessId || !selectedIds.length) return;
    const confirm = window.confirm(`Remove ${selectedIds.length} items from Queue?`);
    if (!confirm) return;

    setIsApplyingBulk(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          await api.delete(`/media/${id}`, { params: { businessId: activeBusinessId } });
          successCount++;
        })
      );
      toast({ tone: "success", title: "Bulk remove complete", description: `Removed ${successCount} items.` });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    } catch (error) {
      toast({ tone: "error", title: "Bulk remove failed", description: "Some items failed to remove." });
    } finally {
      setIsApplyingBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Content Queue"
        description="Each row is one imported media file. The layout is compact so you can scan media previews and workflow status faster."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file name or group"
            className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2 lg:max-w-md"
          />
          <div className="rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-600">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} in queue
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 border border-emerald-100">
            <div className="text-sm font-medium text-emerald-900">
              {selectedIds.length} item{selectedIds.length !== 1 ? "s" : ""} selected
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input 
                 value={bulkGroupId}
                 onChange={(e) => setBulkGroupId(e.target.value)}
                 placeholder="Enter Group ID" 
                 className="w-36 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400" 
              />
              <button 
                 onClick={applyBulkGroupId}
                 disabled={isApplyingBulk}
                 className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                 Apply Group
              </button>
              <div className="hidden sm:block h-5 w-px bg-emerald-200 mx-1" />
              <button 
                 onClick={applyBulkRemove}
                 disabled={isApplyingBulk}
                 className="rounded-lg border border-red-200 text-red-700 bg-white px-4 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                 Remove Selected
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-2xl border border-[#d7ddd4] bg-white">
          <table className="w-full min-w-[920px] text-sm text-left">
            <thead className="bg-[#fcfcfa] border-b border-[#d7ddd4]">
              <tr className="text-xs uppercase tracking-wider text-slate-500 font-medium">
                <th className="px-4 py-3 w-12 text-center border-b border-[#d7ddd4]">
                  <input 
                     type="checkbox" 
                     checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                     onChange={toggleSelectAll}
                     className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                </th>
                <th className="px-4 py-3 border-b border-[#d7ddd4]">Media</th>
                <th className="px-4 py-3 border-b border-[#d7ddd4]">Status</th>
                <th className="px-4 py-3 border-b border-[#d7ddd4]">Group ID</th>
                <th className="px-4 py-3 border-b border-[#d7ddd4]">Post Type</th>
                <th className="px-4 py-3 border-b border-[#d7ddd4]">Scheduled Time</th>
                <th className="px-4 py-3 text-right border-b border-[#d7ddd4]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1ea]">
              {filtered.map((item) => (
                <tr key={item._id} className="hover:bg-[#fcfcfa] transition-colors">
                  <td className="px-4 py-2 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(item._id)}
                      onChange={() => toggleSelectRow(item._id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/queue/${item._id}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#d7ddd4] bg-[#eef1ea]"
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
                          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500">
                            N/A
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0 max-w-[180px]">
                        <p className="truncate font-medium text-slate-900 text-sm" title={item.originalName}>{item.originalName}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-slate-500">
                          {item.mediaType}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={item.workflowStatus}
                      onChange={(event) =>
                        patchRow(item._id, { workflowStatus: event.target.value })
                      }
                      className="w-28 rounded-lg border border-[#d7ddd4] bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={item.groupId || ""}
                        onBlur={(event) => patchRow(item._id, { groupId: event.target.value || null })}
                        className="w-24 rounded-lg border border-[#d7ddd4] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                      {item.groupId ? (
                        <Link
                          to={`/queue/group/${item.groupId}`}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                          title="View Group"
                        >
                          View
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={item.postType}
                      onChange={(event) => patchRow(item._id, { postType: event.target.value })}
                      className="w-28 rounded-lg border border-[#d7ddd4] bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {postTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
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
                      className="w-36 rounded-lg border border-[#d7ddd4] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end items-center gap-3">
                      <Link
                        to={`/queue/${item._id}`}
                        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        <ExternalLink size={14} />
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeRow(item._id, item.originalName)}
                        disabled={deletingRowId === item._id}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRowId === item._id ? (
                          "Removing"
                        ) : (
                          <>
                            <Trash2 size={14} />
                            Remove
                          </>
                        )}
                      </button>
                    </div>
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
