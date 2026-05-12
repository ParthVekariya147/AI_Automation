import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { extractApiError } from "../../lib/errors";
import { useToast } from "../ToastProvider";
import type { FolderAutomation, AutomationPreview, DriveFolder } from "../../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: FolderAutomation | null;
  businessId: string;
}

export function AutomationDrawer({ open, onClose, editing, businessId }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(editing ? 2 : 1);
  const [multiFolderMode, setMultiFolderMode] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<{ id: string; name: string }[]>(
    editing ? [{ id: editing.folderId, name: editing.folderName }] : []
  );

  const [rules, setRules] = useState({
    igAccountId: (editing?.igAccountId && typeof editing.igAccountId === "object" ? editing.igAccountId._id : (editing?.igAccountId || "")) as string,
    collaborators: editing?.collaborators?.join(", ") || "",
    groupingMode: (editing?.groupingMode || "one_per_file") as "one_per_file" | "batch_size" | "subfolder",
    batchSize: editing?.batchSize || 3,
    carouselMaxSize: editing?.carouselMaxSize || 10,
    cadenceMode: (editing?.cadenceMode || "smart") as "interval" | "daily_slots" | "smart",
    intervalValue: editing?.intervalValue || 5,
    intervalUnit: (editing?.intervalUnit || "minutes") as "minutes" | "hours" | "days",
    dailySlots: editing?.dailySlots?.join(", ") || "09:00, 14:00, 18:00",
    brandVoice: editing?.brandVoice || "",
    useEmojis: editing?.useEmojis ?? true,
    reprocessImported: editing?.reprocessImported ?? false,
    priority: editing?.priority || 0,
  });

  const [preview, setPreview] = useState<AutomationPreview | null>(null);

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["ig-accounts", businessId],
    queryFn: async () => (await api.get("/instagram/accounts", { params: { businessId } })).data.data,
    enabled: open && step === 2,
  });

  const { data: rootFolders = { myDrive: [], sharedWithMe: [] } } = useQuery<{ myDrive: DriveFolder[]; sharedWithMe: DriveFolder[] }>({
    queryKey: ["drive-folders", businessId],
    queryFn: async () => (await api.get("/google-drive/folders", { params: { businessId } })).data.data,
    enabled: open && step === 1,
  });

  // Fetch suggested next priority on mount (only for new automations)
  useEffect(() => {
    if (editing || !open) return;
    api.get("/automations/next-priority", { params: { businessId } })
      .then(res => setRules(r => ({ ...r, priority: res.data.data.nextPriority })))
      .catch(() => {});
  }, [open, editing, businessId]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/automations/preview", getPayload());
      return res.data.data as AutomationPreview;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep(3);
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Preview failed") });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = getPayload();
      if (editing) return api.patch(`/automations/${editing._id}`, payload);
      return api.post("/automations", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ tone: "success", title: editing ? "Automation updated" : "Automation created" });
      onClose();
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Save failed") });
    },
  });

  function getPayload() {
    return {
      businessId,
      folderIds: selectedFolders.map(f => f.id),
      folderNames: selectedFolders.map(f => f.name),
      igAccountId: rules.igAccountId,
      collaborators: rules.collaborators.split(",").map(c => c.trim().replace(/^@/, "")).filter(Boolean),
      groupingMode: rules.groupingMode,
      batchSize: Number(rules.batchSize),
      carouselMaxSize: Number(rules.carouselMaxSize),
      cadenceMode: rules.cadenceMode,
      intervalValue: Number(rules.intervalValue),
      intervalUnit: rules.intervalUnit,
      dailySlots: rules.cadenceMode === "daily_slots"
        ? rules.dailySlots.split(",").map(s => s.trim()).filter(Boolean)
        : undefined,
      brandVoice: rules.brandVoice,
      useEmojis: rules.useEmojis,
      reprocessImported: rules.reprocessImported,
      priority: Number(rules.priority),
    };
  }

  if (!open) return null;

  function toggleFolderSelect(folder: DriveFolder) {
    if (!multiFolderMode) {
      setSelectedFolders([{ id: folder.id, name: folder.name }]);
      return;
    }
    const exists = selectedFolders.find(f => f.id === folder.id);
    if (exists) {
      setSelectedFolders(selectedFolders.filter(f => f.id !== folder.id));
    } else {
      setSelectedFolders([...selectedFolders, { id: folder.id, name: folder.name }]);
    }
  }

  const isValidStep2 = !!rules.igAccountId;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Automation" : "New Automation"}</h2>
            <p className="text-xs text-slate-500">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-slate-100 shrink-0">
          {[["1", "Select Folder"], ["2", "Configure"], ["3", "Preview"]].map(([n, label]) => (
            <div
              key={n}
              className={`flex-1 py-2.5 text-center text-xs font-semibold transition-colors ${
                String(step) === n
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : Number(n) < step
                    ? "text-emerald-500 cursor-pointer hover:bg-slate-50"
                    : "text-slate-400"
              }`}
              onClick={() => Number(n) < step ? setStep(Number(n) as 1 | 2 | 3) : undefined}
            >
              {n}. {label}
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── STEP 1: Folder Selection ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Folder Selection</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Choose one or multiple Drive folders</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-200 p-1">
                  <button onClick={() => { setMultiFolderMode(false); setSelectedFolders([]); }} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${!multiFolderMode ? "bg-white shadow-sm" : "text-slate-500"}`}>Single</button>
                  <button onClick={() => setMultiFolderMode(true)} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${multiFolderMode ? "bg-white shadow-sm" : "text-slate-500"}`}>Multiple</button>
                </div>
              </div>

              {selectedFolders.length > 0 && (
                <p className="text-sm font-semibold text-emerald-600">{selectedFolders.length} folder(s) selected</p>
              )}

              <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                {[
                  { label: "My Drive", folders: rootFolders.myDrive },
                  { label: "Shared With Me", folders: rootFolders.sharedWithMe },
                ].map(({ label, folders }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{label}</p>
                    <div className="space-y-1">
                      {folders.map((folder: DriveFolder) => (
                        <div
                          key={folder.id}
                          onClick={() => toggleFolderSelect(folder)}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition ${
                            selectedFolders.some(f => f.id === folder.id)
                              ? "bg-emerald-50 ring-1 ring-emerald-200"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          {multiFolderMode
                            ? <input type="checkbox" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                            : <input type="radio" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                          }
                          <span className="text-sm font-medium text-slate-700">{folder.name}</span>
                          <span className="ml-auto text-[10px] text-slate-400">
                            {folder.containsImages && "🖼"}
                            {folder.containsVideos && " 🎬"}
                          </span>
                        </div>
                      ))}
                      {!folders.length && <p className="text-sm text-slate-400">No folders found</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Configure ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-8">

              {/* Section 1: Destination */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Destination</h3>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Instagram Account *</label>
                    <select
                      value={rules.igAccountId}
                      onChange={e => setRules({ ...rules, igAccountId: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">Select account...</option>
                      {accounts.map(acc => (
                        <option key={acc._id} value={acc._id}>@{acc.handle}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Collaborators (optional)</label>
                    <input
                      value={rules.collaborators}
                      onChange={e => setRules({ ...rules, collaborators: e.target.value })}
                      placeholder="e.g. sakar.studio, user2"
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </section>

              {/* Section 2: Grouping */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Grouping</h3>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <p className="text-xs text-slate-500 mb-3">How should files be grouped into posts?</p>
                <div className="space-y-2">
                  {[
                    { id: "one_per_file", label: "One post per file", desc: "Each image or video becomes its own post." },
                    { id: "batch_size", label: "Carousel: N files per post", desc: "Group every N files into one carousel post." },
                    { id: "subfolder", label: "Carousel: each subfolder = one post", desc: "Files in the same Drive subfolder become one carousel." },
                  ].map(mode => (
                    <label
                      key={mode.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                        rules.groupingMode === mode.id
                          ? "border-emerald-500 bg-emerald-50/30"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="groupingMode"
                        value={mode.id}
                        checked={rules.groupingMode === mode.id}
                        onChange={e => setRules({ ...rules, groupingMode: e.target.value as any })}
                        className="mt-0.5 text-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{mode.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{mode.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Conditional sub-inputs for grouping */}
                {(rules.groupingMode === "batch_size" || rules.groupingMode === "subfolder") && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {rules.groupingMode === "batch_size" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Files per carousel</label>
                        <input
                          type="number" min="2" max="10"
                          value={rules.batchSize}
                          onChange={e => setRules({ ...rules, batchSize: Number(e.target.value) })}
                          className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Carousel max (extra → new group)</label>
                      <input
                        type="number" min="2" max="10"
                        value={rules.carouselMaxSize}
                        onChange={e => setRules({ ...rules, carouselMaxSize: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Section 3: Cadence */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Posting Cadence</h3>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <p className="text-xs text-slate-500 mb-3">When should posts go out?</p>
                <div className="space-y-2">
                  {[
                    { id: "interval", label: "Every N interval", desc: "Post the next group after a fixed gap from the previous." },
                    { id: "daily_slots", label: "Daily at fixed times", desc: "Posts cycle through comma-separated 24h times each day." },
                    { id: "smart", label: "Smart timing (auto)", desc: "Uses engagement data to pick optimal posting times." },
                  ].map(c => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                        rules.cadenceMode === c.id
                          ? "border-emerald-500 bg-emerald-50/30"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio" name="cadenceMode" value={c.id}
                        checked={rules.cadenceMode === c.id}
                        onChange={e => setRules({ ...rules, cadenceMode: e.target.value as any })}
                        className="mt-0.5 text-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{c.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Conditional sub-inputs for cadence */}
                {rules.cadenceMode === "interval" && (
                  <div className="mt-4 flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Every</label>
                      <input
                        type="number" min="1"
                        value={rules.intervalValue}
                        onChange={e => setRules({ ...rules, intervalValue: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Unit</label>
                      <select
                        value={rules.intervalUnit}
                        onChange={e => setRules({ ...rules, intervalUnit: e.target.value as any })}
                        className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                )}
                {rules.cadenceMode === "daily_slots" && (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Daily times (24h, comma-separated)</label>
                    <input
                      value={rules.dailySlots}
                      onChange={e => setRules({ ...rules, dailySlots: e.target.value })}
                      placeholder="09:00, 14:00, 18:00"
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </section>

              {/* Section 4: Settings */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Settings</h3>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Brand Voice (optional)</label>
                    <textarea
                      value={rules.brandVoice}
                      onChange={e => setRules({ ...rules, brandVoice: e.target.value })}
                      placeholder="e.g. Friendly photography studio in Surat"
                      className="h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={rules.useEmojis} onChange={e => setRules({ ...rules, useEmojis: e.target.checked })} className="size-4" />
                    <span className="text-sm font-medium text-slate-700">Use emojis in AI captions</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={rules.reprocessImported} onChange={e => setRules({ ...rules, reprocessImported: e.target.checked })} className="size-4" />
                    <span className="text-sm font-medium text-slate-700">
                      Reprocess already imported files
                      <span className="ml-1 text-amber-600 font-normal">(Warning: may create duplicate posts)</span>
                    </span>
                  </label>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Priority
                      <span className="ml-1 font-normal text-slate-400">— lower runs first</span>
                    </label>
                    <input
                      type="number" min="1"
                      value={rules.priority}
                      onChange={e => setRules({ ...rules, priority: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Auto-assigned. Lower = runs first. You can edit if needed.</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ── STEP 3: Preview ─────────────────────────────────────────── */}
          {step === 3 && preview && (
            <div className="space-y-5">
              {/* Banner */}
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
                <h3 className="text-base font-bold text-emerald-900 mb-2">Preview</h3>
                <div className="space-y-1 text-sm text-emerald-800">
                  <p>{preview.totalFound} files matched in {selectedFolders.length} folder(s)</p>
                  {preview.alreadyImported > 0 && !rules.reprocessImported && (
                    <p className="text-slate-500">{preview.alreadyImported} already imported (skipped)</p>
                  )}
                  <p className="font-semibold">{preview.newFiles} new → {preview.groupCount} groups</p>
                  {preview.groupCount > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">
                      First post on {new Date(preview.groups[0].scheduledFor).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {preview.newFiles === 0 ? (
                <p className="text-center text-sm font-medium text-amber-600 py-8">
                  No new files found in selected folder(s).
                  {!rules.reprocessImported && " Enable 'Reprocess already imported' to re-queue existing."}
                </p>
              ) : (
                <div className="space-y-3">
                  {preview.groups.map((g, i) => (
                    <div key={g.groupId} className="rounded-xl border border-slate-200 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Group {i + 1}</span>
                        <div className="flex gap-2">
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{g.postType}</span>
                          <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                            {new Date(g.scheduledFor).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {g.files.map((f, j) => (
                          <div key={j} className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200">
                            {f.previewUrl ? (
                              <img
                                src={f.previewUrl}
                                alt={f.name}
                                className="h-full w-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center p-1 text-center text-[8px] font-medium leading-tight text-slate-400 break-all">
                                {f.name}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-slate-100 p-5 flex justify-between items-center">
          <button
            onClick={() => step > 1 ? setStep(step - 1 as any) : onClose()}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <button
            onClick={() => {
              if (step === 1) setStep(2);
              else if (step === 2) previewMutation.mutate();
              else saveMutation.mutate();
            }}
            disabled={
              (step === 1 && selectedFolders.length === 0) ||
              (step === 2 && !isValidStep2) ||
              previewMutation.isPending || saveMutation.isPending
            }
            className="rounded-xl bg-[#10332b] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e2c25] disabled:opacity-50"
          >
            {previewMutation.isPending ? "Generating Preview…"
              : saveMutation.isPending ? "Saving…"
              : step === 1 ? "Next"
              : step === 2 ? "Preview"
              : editing ? "Save Changes" : "Save & Activate"}
          </button>
        </div>
      </div>
    </>
  );
}
