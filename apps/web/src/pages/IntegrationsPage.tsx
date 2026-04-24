import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [igForm, setIgForm] = useState({ name: "", handle: "" });
  const [error, setError] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data
        .data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: drives = [] } = useQuery({
    queryKey: ["drive-connections", activeBusinessId],
    queryFn: async () =>
      (await api.get("/google-drive/connections", { params: { businessId: activeBusinessId } }))
        .data.data,
    enabled: Boolean(activeBusinessId)
  });

  const connectedDrive = drives.find((drive: any) => drive.isActive && drive.isOAuthReady);
  const driveStatus = connectedDrive ? "Connected" : drives.length ? "Disconnected" : "Not connected";

  async function addInstagram(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      if (!activeBusinessId) return;
      await api.post("/instagram/connect", { businessId: activeBusinessId, ...igForm });
      setIgForm({ name: "", handle: "" });
      queryClient.invalidateQueries({ queryKey: ["ig-accounts", activeBusinessId] });
    } catch (currentError) {
      setError(extractApiError(currentError, "Instagram account could not be added."));
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel
        title="Google Drive"
        description="Task 1 is now simple: connect Drive from the Drive Browser page, fetch data, and display files there."
      >
        <div className="rounded-3xl bg-[#f6f7f2] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Drive status</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{driveStatus}</p>
          <p className="mt-2 text-sm text-slate-600">
            {connectedDrive
              ? `Connected with ${connectedDrive.accountEmail}`
              : "Use Drive Browser to connect or reconnect the workspace Google Drive."}
          </p>
        </div>

        <Link
          to="/drive-browser"
          className="mt-5 inline-flex rounded-full bg-[#10332b] px-5 py-3 text-sm font-medium text-white"
        >
          Open Drive Browser
        </Link>
      </Panel>

      <Panel
        title="Instagram accounts"
        description="Instagram setup stays here, but Drive connection is now handled in a simpler dedicated flow."
      >
        <div className="space-y-3">
          {accounts.map((account: any) => (
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="rounded-2xl bg-[#10332b] px-4 py-3 text-white">
            Connect Instagram account
          </button>
        </form>
      </Panel>
    </div>
  );
}
