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
    groupingMode: editing?.groupingMode || "batch_size",
    batchSize: editing?.batchSize || 1,
    carouselMaxSize: editing?.carouselMaxSize || 10,
    cadenceType: editing?.cadence?.type || "smart",
    fixedTime: editing?.cadence?.fixedTime || "11:00",
    slots: editing?.cadence?.slots?.join(", ") || "09:00, 14:00, 18:00",
    intervalHours: editing?.cadence?.intervalHours || 24,
    brandVoice: editing?.brandVoice || "",
    useEmojis: editing?.useEmojis ?? true,
    reprocessImported: editing?.reprocessImported ?? false,
    priority: editing?.priority || 100
  });

  const [preview, setPreview] = useState<AutomationPreview | null>(null);

  // APIs
  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["ig-accounts", businessId],
    queryFn: async () => (await api.get("/instagram/accounts", { params: { businessId } })).data.data,
    enabled: open && step === 2
  });

  const { data: rootFolders = { myDrive: [], sharedWithMe: [] } } = useQuery<{ myDrive: DriveFolder[]; sharedWithMe: DriveFolder[] }>({
    queryKey: ["drive-folders", businessId],
    queryFn: async () => (await api.get("/google-drive/folders", { params: { businessId } })).data.data,
    enabled: open && step === 1
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const payload = getPayload();
      const res = await api.post("/automations/preview", payload);
      return res.data.data as AutomationPreview;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep(3);
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Preview failed") });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = getPayload();
      if (editing) {
        return api.patch(`/automations/${editing._id}`, payload);
      }
      return api.post("/automations", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ tone: "success", title: editing ? "Automation updated" : "Automation created" });
      onClose();
    },
    onError: (err) => {
      toast({ tone: "error", title: extractApiError(err, "Save failed") });
    }
  });

  function getPayload() {
    const cadence: any = { type: rules.cadenceType };
    if (rules.cadenceType === "fixed_time") cadence.fixedTime = rules.fixedTime;
    if (rules.cadenceType === "interval") cadence.intervalHours = Number(rules.intervalHours);
    if (rules.cadenceType === "slots") cadence.slots = rules.slots.split(",").map(s => s.trim()).filter(Boolean);

    return {
      businessId,
      folderIds: selectedFolders.map(f => f.id),
      folderNames: selectedFolders.map(f => f.name),
      igAccountId: rules.igAccountId,
      collaborators: rules.collaborators.split(",").map(c => c.trim().replace(/^@/, "")).filter(Boolean),
      groupingMode: rules.groupingMode,
      batchSize: Number(rules.batchSize),
      carouselMaxSize: Number(rules.carouselMaxSize),
      cadence,
      brandVoice: rules.brandVoice,
      useEmojis: rules.useEmojis,
      reprocessImported: rules.reprocessImported,
      priority: Number(rules.priority)
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

  const isValidStep2 = !!rules.igAccountId && !!rules.groupingMode && !!rules.cadenceType;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-300">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Automation" : "New Automation"}</h2>
            <p className="text-xs text-slate-500">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Folder Selection</h3>
                  <p className="text-xs text-slate-500">Choose one or multiple folders from your Drive</p>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                  <button onClick={() => { setMultiFolderMode(false); setSelectedFolders([]); }} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${!multiFolderMode ? "bg-white shadow-sm" : "text-slate-500"}`}>Single</button>
                  <button onClick={() => setMultiFolderMode(true)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${multiFolderMode ? "bg-white shadow-sm" : "text-slate-500"}`}>Multiple</button>
                </div>
              </div>

              {selectedFolders.length > 0 && (
                <p className="text-sm font-semibold text-emerald-600">{selectedFolders.length} folder(s) selected</p>
              )}

              <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">My Drive</p>
                <div className="space-y-1">
                  {rootFolders.myDrive.map((folder: DriveFolder) => (
                    <div key={folder.id} onClick={() => toggleFolderSelect(folder)} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition ${selectedFolders.some(f => f.id === folder.id) ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"}`}>
                      {multiFolderMode ? (
                        <input type="checkbox" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                      ) : (
                        <input type="radio" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                      )}
                      <span className="text-sm font-medium text-slate-700">{folder.name}</span>
                    </div>
                  ))}
                  {!rootFolders.myDrive.length && <p className="text-sm text-slate-400">No folders found</p>}
                </div>

                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-4 border-t border-slate-100">Shared With Me</p>
                <div className="space-y-1">
                  {rootFolders.sharedWithMe.map((folder: DriveFolder) => (
                    <div key={folder.id} onClick={() => toggleFolderSelect(folder)} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition ${selectedFolders.some(f => f.id === folder.id) ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"}`}>
                      {multiFolderMode ? (
                        <input type="checkbox" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                      ) : (
                        <input type="radio" readOnly checked={selectedFolders.some(f => f.id === folder.id)} className="size-4" />
                      )}
                      <span className="text-sm font-medium text-slate-700">{folder.name}</span>
                    </div>
                  ))}
                  {!rootFolders.sharedWithMe.length && <p className="text-sm text-slate-400">No shared folders found</p>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8">
              <section>
                <h3 className="mb-4 text-sm font-bold text-slate-900">Destination</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">IG Account *</label>
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

              <section>
                <h3 className="mb-4 text-sm font-bold text-slate-900">Grouping Mode *</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { id: "batch_size", label: "Batch Size", desc: "Group every N files" },
                    { id: "subfolder", label: "Subfolder", desc: "Each subfolder becomes one post" },
                    { id: "filename_prefix", label: "Filename Prefix", desc: "IMG_001, IMG_002 grouped together" },
                    { id: "manual", label: "Manual", desc: "Each file is a single post" }
                  ].map(mode => (
                    <label key={mode.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${rules.groupingMode === mode.id ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input
                        type="radio"
                        name="groupingMode"
                        value={mode.id}
                        checked={rules.groupingMode === mode.id}
                        onChange={e => setRules({ ...rules, groupingMode: e.target.value as any })}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{mode.label}</div>
                        <div className="text-[10px] text-slate-500">{mode.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {rules.groupingMode === "batch_size" && (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Batch Size</label>
                    <input
                      type="number"
                      min="1" max="10"
                      value={rules.batchSize}
                      onChange={e => setRules({ ...rules, batchSize: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
                
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Carousel Max Size (Extra → new group)</label>
                  <input
                    type="number" min="1" max="10"
                    value={rules.carouselMaxSize}
                    onChange={e => setRules({ ...rules, carouselMaxSize: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none"
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-bold text-slate-900">Cadence *</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { id: "smart", label: "Smart timing" },
                    { id: "fixed_time", label: "Fixed time" },
                    { id: "slots", label: "Multiple slots" },
                    { id: "interval", label: "Interval" }
                  ].map(c => (
                    <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${rules.cadenceType === c.id ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input
                        type="radio" name="cadenceType" value={c.id}
                        checked={rules.cadenceType === c.id}
                        onChange={e => setRules({ ...rules, cadenceType: e.target.value as any })}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-900">{c.label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-4">
                  {rules.cadenceType === "fixed_time" && (
                    <>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
                      <input type="time" value={rules.fixedTime} onChange={e => setRules({ ...rules, fixedTime: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                    </>
                  )}
                  {rules.cadenceType === "slots" && (
                    <>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Slots (comma separated)</label>
                      <input value={rules.slots} onChange={e => setRules({ ...rules, slots: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="09:00, 13:00, 18:00" />
                    </>
                  )}
                  {rules.cadenceType === "interval" && (
                    <>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Hours</label>
                      <input type="number" min="1" value={rules.intervalHours} onChange={e => setRules({ ...rules, intervalHours: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                    </>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-bold text-slate-900">Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Brand Voice (optional)</label>
                    <textarea
                      value={rules.brandVoice}
                      onChange={e => setRules({ ...rules, brandVoice: e.target.value })}
                      placeholder="e.g. Friendly photography studio in Surat"
                      className="h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={rules.useEmojis} onChange={e => setRules({ ...rules, useEmojis: e.target.checked })} className="size-4" />
                    <span className="text-sm font-medium text-slate-700">Use emojis in AI captions</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={rules.reprocessImported} onChange={e => setRules({ ...rules, reprocessImported: e.target.checked })} className="size-4" />
                    <span className="text-sm font-medium text-slate-700">Reprocess already imported files (Warning: duplicate posts)</span>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Priority (Lower = runs first)</label>
                    <input type="number" value={rules.priority} onChange={e => setRules({ ...rules, priority: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {step === 3 && preview && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 text-center">
                <h3 className="text-lg font-bold text-emerald-900">Preview</h3>
                <p className="mt-1 text-sm text-emerald-700">
                  {preview.fileCount} files found across {selectedFolders.length} folder(s) → {preview.groupCount} groups
                </p>
                {preview.groupCount > 0 && (
                  <p className="mt-1 text-xs text-emerald-600">First post on {new Date(preview.groups[0].scheduledFor).toLocaleString()}</p>
                )}
              </div>

              {preview.fileCount === 0 ? (
                <p className="text-center text-sm font-medium text-amber-600">No new files found in selected folders.</p>
              ) : (
                <div className="space-y-3">
                  {preview.groups.map((g, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-4 shadow-sm">
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
                          <div key={j} className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200">
                            <span className="p-1 text-center text-[8px] font-medium leading-tight text-slate-400 break-all">{f.name}</span>
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

        <div className="border-t border-slate-100 p-6 flex justify-between">
          <button
            onClick={() => step > 1 ? setStep(step - 1 as any) : onClose()}
            className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
            {previewMutation.isPending ? "Generating Preview..." : saveMutation.isPending ? "Saving..." : step === 1 ? "Next" : step === 2 ? "Preview" : editing ? "Save Changes" : "Save & Activate"}
          </button>
        </div>
      </div>
    </>
  );
}
