import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "../components/ToastProvider";
import { ConfirmDialog } from "../components/queue/ConfirmDialog";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";
import type { FolderAutomation } from "../lib/types";
import { AutomationDrawer } from "../components/automations/AutomationDrawer";
import { PageHeader, StatusPill, Icons } from "../lib/ds";

export function AutomationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);

  const [showWizard, setShowWizard] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<FolderAutomation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FolderAutomation | null>(null);

  const { data: automations = [], isLoading } = useQuery<FolderAutomation[]>({
    queryKey: ["automations", activeBusinessId],
    queryFn: async () =>
      (await api.get("/automations", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId),
    refetchInterval: (query) => {
      const isRunning = (query.state.data as FolderAutomation[])?.some((a) => a.status === "running");
      return isRunning ? 10000 : false;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", activeBusinessId] });
      toast({ tone: "success", title: "Automation deleted" });
      setConfirmDelete(null);
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Delete failed") });
    }
  });

  const fetchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/automations/${id}/fetch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast({ tone: "success", title: "Fetch triggered successfully" });
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Fetch failed") });
    }
  });

  const pauseResumeMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) =>
      api.post(`/automations/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", activeBusinessId] });
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Failed to update status") });
    }
  });

  function getIgHandle(ig: { _id: string; handle: string } | string) {
    if (typeof ig === "string") return ig;
    return ig?.handle || "Unknown IG";
  }

  function getCadenceLabel(a: FolderAutomation) {
    if (a.cadenceMode === "smart") return "Smart timing";
    if (a.cadenceMode === "interval") return `Every ${a.intervalValue} ${a.intervalUnit ?? "h"}`;
    if (a.cadenceMode === "daily_slots") return `Daily: ${a.dailySlots?.join(", ") ?? "—"}`;
    return a.cadenceMode ?? "—";
  }

  // Stats
  const running = automations.filter((a) => a.status === "running").length;
  const idle = automations.filter((a) => a.status === "idle" || a.status === "finished").length;
  const paused = automations.filter((a) => a.status === "paused").length;
  const needsReview = automations.filter((a) => a.status === "manual_review").length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Automations"
        title="Folder Automations"
        subtitle="Auto-publish your Drive folders to Instagram on a schedule."
        actions={
          <button
            onClick={() => { setEditingAutomation(null); setShowWizard(true); }}
            className="btn-primary"
          >
            <Icons.Plus size={14} />
            New Automation
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: automations.length, tone: "default" as const, icon: <Icons.Bolt size={14} /> },
          { label: "Running", value: running, tone: "info" as const, icon: <Icons.Play size={14} /> },
          { label: "Paused", value: paused, tone: "warn" as const, icon: <Icons.Pause size={14} /> },
          { label: "Needs Review", value: needsReview, tone: "err" as const, icon: <Icons.AlertTriangle size={14} /> },
        ].map((s) => {
          const toneMap: Record<string, { bg: string; fg: string }> = {
            default: { bg: "var(--surface)", fg: "var(--ink)" },
            info:    { bg: "var(--info-soft)", fg: "var(--info)" },
            warn:    { bg: "var(--warn-soft)", fg: "var(--warn)" },
            err:     { bg: "var(--err-soft)", fg: "var(--err)" },
          };
          const t = toneMap[s.tone];
          return (
            <div key={s.label} className="rounded-[18px] p-5" style={{ background: t.bg, border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="section-eyebrow">{s.label}</p>
                <span style={{ color: t.fg }}>{s.icon}</span>
              </div>
              <p className="text-[28px] font-bold leading-none" style={{ color: t.fg }}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Automation cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-[18px]" style={{ background: "var(--bg-2)" }} />
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div
          className="rounded-[18px] border-2 border-dashed py-20 text-center"
          style={{ borderColor: "var(--line-2)" }}
        >
          <Icons.Bolt size={36} className="mx-auto mb-3" style={{ color: "var(--line-2)" } as React.CSSProperties} />
          <p className="text-sm font-semibold" style={{ color: "var(--ink-2)" }}>No automations yet</p>
          <p className="mt-1 text-xs mb-4" style={{ color: "var(--muted)" }}>Create one to start auto-posting from Drive folders</p>
          <button onClick={() => setShowWizard(true)} className="btn-primary">
            <Icons.Plus size={14} /> New Automation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {automations.map((automation) => (
            <div
              key={automation._id}
              className="relative flex flex-col justify-between card p-6"
            >
              {/* Priority badge */}
              <div
                className="absolute right-4 top-4 rounded-lg px-2 py-0.5 text-[10px] font-bold font-mono"
                style={{ background: "var(--bg)", color: "var(--muted)" }}
              >
                #{automation.priority}
              </div>

              <div>
                <div className="flex items-start gap-3 mb-3 pr-12">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "var(--bg)" }}
                  >
                    <Icons.Folder size={18} style={{ color: "var(--accent)" } as React.CSSProperties} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-tight truncate" style={{ color: "var(--ink)" }} title={automation.folderName}>
                      {automation.folderName}
                    </h3>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
                      @{getIgHandle(automation.igAccountId)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <StatusPill status={automation.status} />
                  <span className="chip">
                    <Icons.Clock size={10} />
                    {getCadenceLabel(automation)}
                  </span>
                  <span className="chip">
                    {automation.groupingMode.replace("_", " ")}
                  </span>
                </div>

                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Last fetch: {automation.lastFetchedAt
                    ? new Date(automation.lastFetchedAt).toLocaleString()
                    : "Never"}
                </p>

                {automation.lastRunError && (
                  <div
                    className="mt-3 rounded-[12px] px-3 py-2 text-[11px]"
                    style={{ background: "var(--err-soft)", border: "1px solid var(--err)" }}
                  >
                    <p className="font-semibold mb-0.5" style={{ color: "var(--err)" }}>Last error</p>
                    <p className="line-clamp-2" style={{ color: "var(--err)", opacity: 0.85 }}>
                      {automation.lastRunError}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
                <button
                  onClick={() => fetchMutation.mutate(automation._id)}
                  disabled={automation.status === "running" || fetchMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {fetchMutation.isPending && fetchMutation.variables === automation._id ? (
                    <><span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fetching…</>
                  ) : (
                    <><Icons.Refresh size={13} /> Fetch Files</>
                  )}
                </button>

                <button
                  onClick={() => pauseResumeMutation.mutate({
                    id: automation._id,
                    action: (automation.status === "paused" || automation.status === "manual_review") ? "resume" : "pause"
                  })}
                  className="btn-secondary"
                  style={automation.status === "manual_review" ? { borderColor: "var(--err)", color: "var(--err)" } : {}}
                >
                  {(automation.status === "paused" || automation.status === "manual_review") ? <Icons.Play size={13} /> : <Icons.Pause size={13} />}
                  {automation.status === "manual_review" ? "Resume & Retry" : automation.status === "paused" ? "Resume" : "Pause"}
                </button>

                <button
                  onClick={() => { setEditingAutomation(automation); setShowWizard(true); }}
                  className="btn-ghost"
                >
                  <Icons.Edit size={13} />
                </button>

                <button
                  onClick={() => setConfirmDelete(automation)}
                  className="btn-ghost"
                  style={{ color: "var(--err)" }}
                >
                  <Icons.Trash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showWizard && (
        <AutomationDrawer
          open={showWizard}
          onClose={() => setShowWizard(false)}
          editing={editingAutomation}
          businessId={activeBusinessId ?? ""}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          title="Delete Automation"
          description={`Are you sure you want to delete the automation for "${confirmDelete.folderName}"?`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteMutation.mutate(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
