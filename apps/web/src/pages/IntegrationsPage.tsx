import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";

function AccountAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] text-sm font-bold text-white shadow-sm">
      {initials}
    </div>
  );
}

function ConnectedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Connected
    </span>
  );
}

export function IntegrationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [connectError, setConnectError] = useState("");
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const igConnected = searchParams.get("ig_connected");
  const igError = searchParams.get("error");
  const showIgLinkHelp =
    igError?.toLowerCase().includes("no linked instagram professional account") ?? false;

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
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

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.post("/instagram/disconnect", {
        accountId,
        businessId: activeBusinessId
      });
    },
    onMutate: (accountId) => setDisconnectingId(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ig-accounts", activeBusinessId] });
    },
    onSettled: () => setDisconnectingId(null)
  });

  useEffect(() => {
    if (igConnected === "1" && activeBusinessId) {
      void queryClient.invalidateQueries({ queryKey: ["ig-accounts", activeBusinessId] });
      successTimerRef.current = setTimeout(() => {
        navigate("/integrations", { replace: true });
      }, 5000);
    }
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [activeBusinessId, igConnected, navigate, queryClient]);

  const connectedDrive = drives.find((drive: any) => drive.isActive && drive.isOAuthReady);
  const driveStatus = connectedDrive ? "Connected" : drives.length ? "Disconnected" : "Not connected";

  async function connectInstagram() {
    setConnectError("");
    try {
      if (!activeBusinessId) return;
      const response = await api.get("/instagram/oauth/start", {
        params: {
          businessId: activeBusinessId,
          frontendOrigin: window.location.origin
        }
      });
      window.location.href = response.data.data.authUrl;
    } catch (err) {
      setConnectError(extractApiError(err, "Could not start Facebook OAuth."));
    }
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-0.5 text-sm text-slate-500">Connect Instagram and Google Drive to power your content workflow</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
      {/* Instagram Panel */}
      <Panel
        title="Instagram"
        description="Connect Instagram Professional accounts via Facebook to publish and schedule content."
      >
        {/* Success banner */}
        {igConnected === "1" && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-5 shrink-0 text-emerald-600">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Instagram connected successfully!</p>
              <p className="mt-0.5 text-xs text-emerald-700">Your account is now ready for publishing.</p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {igError && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Connection failed</p>
            <p className="mt-0.5 text-xs">{igError}</p>
          </div>
        )}

        {/* Accounts list */}
        {accountsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account: any) => (
              <div
                key={account._id}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <AccountAvatar name={account.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-slate-900">{account.name}</p>
                  <p className="truncate text-sm text-slate-500">
                    {account.handle?.startsWith("@") ? account.handle : `@${account.handle}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ConnectedBadge />
                  <button
                    onClick={() => disconnectMutation.mutate(account._id)}
                    disabled={disconnectingId === account._id}
                    title="Disconnect account"
                    className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    {disconnectingId === account._id ? (
                      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] shadow-sm">
              <svg viewBox="0 0 24 24" fill="white" className="size-7">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </div>
            <p className="mt-4 text-[15px] font-semibold text-slate-800">No accounts connected</p>
            <p className="mt-1 max-w-[240px] text-sm text-slate-500">
              Connect a Facebook Page linked to your Instagram Professional account to start publishing.
            </p>
          </div>
        )}

        {/* Help tip for link error */}
        {showIgLinkHelp && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">How to fix this</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li>Switch Instagram to a Professional account (Creator or Business).</li>
              <li>In Accounts Center, link it to a Facebook Page you manage.</li>
              <li>Click Connect again and select that Page.</li>
            </ol>
          </div>
        )}

        {/* Connect button */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <button
            onClick={connectInstagram}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1462d4] active:bg-[#1155c1]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            {accounts.length > 0 ? "Connect another account" : "Connect via Facebook"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Use the Facebook profile that manages the Page linked to your Instagram.
          </p>
          {connectError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{connectError}</p>}
        </div>
      </Panel>

      {/* Google Drive Panel */}
      <Panel
        title="Google Drive"
        description="Connect your workspace Google Drive to import images and videos into your content queue."
      >
        <div className="rounded-2xl bg-[#f6f7f2] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-white shadow-sm">
              <svg viewBox="0 0 87.3 78" className="size-5">
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                <path d="M43.65 25L29.9 1.2C28.55.4 27 0 25.45 0c-1.55 0-3.1.4-4.5 1.2L6.6 25h37.05z" fill="#00ac47" />
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L87.3 57.5c0-1.55-.4-3.1-1.2-4.5L62.2 11.5 48.45 35l11.75 20.35L73.55 76.8z" fill="#ea4335" />
                <path d="M43.65 25H6.6L20.95 50h45.4z" fill="#00832d" />
                <path d="M74.4 1.2C73 .4 71.45 0 69.9 0H57.8c1.55 0 3.1.4 4.5 1.2L75.95 25H87.3L74.4 1.2z" fill="#2684fc" />
                <path d="M59.2 50H27.5L13.8 76.8c1.4.8 2.95 1.2 4.5 1.2h45.4c1.55 0 3.1-.4 4.5-1.2z" fill="#ffba00" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Drive status</p>
              <p className="text-lg font-bold text-slate-900">{driveStatus}</p>
            </div>
            {connectedDrive && <ConnectedBadge />}
          </div>
          {connectedDrive && (
            <p className="mt-3 truncate text-sm text-slate-600">
              Signed in as <span className="font-medium">{connectedDrive.accountEmail}</span>
            </p>
          )}
        </div>

        <Link
          to="/drive-browser"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#10332b] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0e2c25]"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          Open Drive Browser
        </Link>
      </Panel>
      </div>
    </div>
  );
}
