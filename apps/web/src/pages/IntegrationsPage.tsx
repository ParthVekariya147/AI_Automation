import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [igForm, setIgForm] = useState({ name: "", handle: "" });
  const [driveForm, setDriveForm] = useState({ accountEmail: "", folderId: "" });

  const { data: accounts } = useQuery({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data
        .data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: drives } = useQuery({
    queryKey: ["drive-connections", activeBusinessId],
    queryFn: async () =>
      (await api.get("/google-drive/connections", { params: { businessId: activeBusinessId } }))
        .data.data,
    enabled: Boolean(activeBusinessId)
  });

  async function addInstagram(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBusinessId) return;
    await api.post("/instagram/connect", { businessId: activeBusinessId, ...igForm });
    setIgForm({ name: "", handle: "" });
    queryClient.invalidateQueries({ queryKey: ["ig-accounts", activeBusinessId] });
  }

  async function addDrive(event: React.FormEvent) {
    event.preventDefault();
    if (!activeBusinessId) return;
    await api.post("/google-drive/connect", {
      businessId: activeBusinessId,
      ...driveForm
    });
    setDriveForm({ accountEmail: "", folderId: "" });
    queryClient.invalidateQueries({ queryKey: ["drive-connections", activeBusinessId] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Instagram accounts" description="One business can manage multiple Instagram accounts.">
        <div className="space-y-3">
          {accounts?.map((account: any) => (
            <div key={account._id} className="rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-semibold text-slate-900">{account.name}</p>
              <p className="text-sm text-slate-600">{account.handle}</p>
            </div>
          ))}
        </div>
        <form className="mt-5 grid gap-3" onSubmit={addInstagram}>
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Account name"
            value={igForm.name}
            onChange={(event) => setIgForm({ ...igForm, name: event.target.value })}
          />
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="@handle"
            value={igForm.handle}
            onChange={(event) => setIgForm({ ...igForm, handle: event.target.value })}
          />
          <button className="rounded-2xl bg-brand-600 px-4 py-3 text-white">
            Connect Instagram account
          </button>
        </form>
      </Panel>

      <Panel title="Google Drive" description="Drive stays optional per admin workflow.">
        <div className="space-y-3">
          {drives?.map((drive: any) => (
            <div key={drive._id} className="rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-semibold text-slate-900">{drive.accountEmail}</p>
              <p className="text-sm text-slate-600">{drive.folderId || "No folder selected yet"}</p>
            </div>
          ))}
        </div>
        <form className="mt-5 grid gap-3" onSubmit={addDrive}>
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Google account email"
            type="email"
            value={driveForm.accountEmail}
            onChange={(event) => setDriveForm({ ...driveForm, accountEmail: event.target.value })}
          />
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Drive folder ID"
            value={driveForm.folderId}
            onChange={(event) => setDriveForm({ ...driveForm, folderId: event.target.value })}
          />
          <button className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
            Save Drive connection
          </button>
        </form>
      </Panel>
    </div>
  );
}
