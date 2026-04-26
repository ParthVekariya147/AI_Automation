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
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const igConnected = searchParams.get("ig_connected");
  const igError = searchParams.get("error");

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

  async function connectInstagram() {
    setError("");
    try {
      if (!activeBusinessId) return;
      const response = await api.get("/instagram/oauth/start", {
        params: {
          businessId: activeBusinessId,
          frontendOrigin: window.location.origin
        }
      });
      window.location.href = response.data.data.authUrl;
    } catch (currentError) {
      setError(extractApiError(currentError, "Could not start Facebook OAuth."));
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
        {igConnected === "1" ? (
          <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            Successfully connected Instagram accounts!
          </div>
        ) : null}
        {igError ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Failed to connect Instagram: {igError}
          </div>
        ) : null}
        
        <div className="mt-5 border-t border-slate-200 pt-5">
          <button
            onClick={connectInstagram}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1877F2] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#1865f2]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Connect via Facebook
          </button>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
