import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export function MediaPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [file, setFile] = useState<File | null>(null);
  const [driveForm, setDriveForm] = useState({
    driveFileId: "",
    originalName: "",
    mimeType: "image/jpeg"
  });

  const { data: media } = useQuery({
    queryKey: ["media", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  async function uploadLocal(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !activeBusinessId) return;

    const formData = new FormData();
    formData.append("businessId", activeBusinessId);
    formData.append("file", file);
    await api.post("/media/upload", formData);
    setFile(null);
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
  }

  async function importDrive(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBusinessId) return;
    await api.post("/media/import-from-drive", {
      businessId: activeBusinessId,
      ...driveForm
    });
    setDriveForm({ driveFileId: "", originalName: "", mimeType: "image/jpeg" });
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Media library" description="Images and videos from local upload or Drive import.">
        <div className="space-y-3">
          {media?.map((asset: any) => (
            <div
              key={asset._id}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{asset.originalName}</p>
                  <p>
                    {asset.mediaType} · {asset.source}
                  </p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs uppercase tracking-[0.2em] text-brand-700">
                  {asset.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="Local upload">
          <form className="grid gap-3" onSubmit={uploadLocal}>
            <input
              className="rounded-2xl border border-slate-200 px-4 py-3"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <button className="rounded-2xl bg-brand-600 px-4 py-3 text-white">
              Upload asset
            </button>
          </form>
        </Panel>

        <Panel title="Import from Drive">
          <form className="grid gap-3" onSubmit={importDrive}>
            <input
              className="rounded-2xl border border-slate-200 px-4 py-3"
              placeholder="Drive file ID"
              value={driveForm.driveFileId}
              onChange={(event) => setDriveForm({ ...driveForm, driveFileId: event.target.value })}
            />
            <input
              className="rounded-2xl border border-slate-200 px-4 py-3"
              placeholder="Original file name"
              value={driveForm.originalName}
              onChange={(event) =>
                setDriveForm({ ...driveForm, originalName: event.target.value })
              }
            />
            <input
              className="rounded-2xl border border-slate-200 px-4 py-3"
              placeholder="Mime type"
              value={driveForm.mimeType}
              onChange={(event) => setDriveForm({ ...driveForm, mimeType: event.target.value })}
            />
            <button className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
              Import metadata
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
