import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, Icons, Pill } from "../lib/ds";

function AccountAvatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full ig-grad text-sm font-bold text-white shadow-sm">
      {initials}
    </div>
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
  const showIgLinkHelp = igError?.toLowerCase().includes("no linked instagram professional account") ?? false;

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["ig-accounts", activeBusinessId],
    queryFn: async () =>
      (await api.get("/instagram/accounts", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const { data: drives = [] } = useQuery({
    queryKey: ["drive-connections", activeBusinessId],
    queryFn: async () =>
      (await api.get("/google-drive/connections", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.post("/instagram/disconnect", { accountId, businessId: activeBusinessId });
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
    return () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); };
  }, [activeBusinessId, igConnected, navigate, queryClient]);

  const connectedDrive = drives.find((drive: any) => drive.isActive && drive.isOAuthReady);
  const driveStatus = connectedDrive ? "Connected" : drives.length ? "Disconnected" : "Not connected";

  async function connectInstagram() {
    setConnectError("");
    try {
      if (!activeBusinessId) return;
      const response = await api.get("/instagram/oauth/start", {
        params: { businessId: activeBusinessId, frontendOrigin: window.location.origin }
      });
      window.location.href = response.data.data.authUrl;
    } catch (err) {
      setConnectError(extractApiError(err, "Could not start Facebook OAuth."));
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        subtitle="Connect Instagram and Google Drive to power your content workflow."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Instagram Panel */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl ig-grad flex items-center justify-center shrink-0">
              <Icons.Instagram size={18} className="text-white" />
            </div>
            <div>
              <p className="section-eyebrow mb-0.5">Social</p>
              <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>Instagram</h2>
            </div>
          </div>
          <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
            Connect Instagram Professional accounts via Facebook to publish and schedule content.
          </p>

          {/* Success banner */}
          {igConnected === "1" && (
            <div className="mb-4 flex items-start gap-3 rounded-[12px] px-4 py-3" style={{ background: "var(--ok-soft)", border: "1px solid var(--ok)" }}>
              <Icons.CircleCheck size={16} style={{ color: "var(--ok)" } as React.CSSProperties} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>Instagram connected successfully!</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ok)" }}>Your account is now ready for publishing.</p>
              </div>
            </div>
          )}

          {/* Error banner */}
          {igError && (
            <div className="mb-4 rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)" }}>
              <p className="font-semibold">Connection failed</p>
              <p className="mt-0.5 text-xs">{igError}</p>
            </div>
          )}

          {/* Accounts list */}
          {accountsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-[12px]" style={{ background: "var(--bg-2)" }} />
              ))}
            </div>
          ) : accounts.length > 0 ? (
            <div className="space-y-3 divide-line">
              {accounts.map((account: any) => (
                <div key={account._id} className="flex items-center gap-3 py-3">
                  <AccountAvatar name={account.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{account.name}</p>
                    <p className="truncate text-sm" style={{ color: "var(--muted)" }}>
                      {account.handle?.startsWith("@") ? account.handle : `@${account.handle}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone="ok">Connected</Pill>
                    <button
                      onClick={() => disconnectMutation.mutate(account._id)}
                      disabled={disconnectingId === account._id}
                      title="Disconnect account"
                      className="btn-ghost p-1.5 disabled:opacity-40"
                      style={{ color: "var(--err)" }}
                    >
                      {disconnectingId === account._id ? (
                        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icons.Trash size={15} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-[14px] border-2 border-dashed px-4 py-8 text-center mb-5" style={{ borderColor: "var(--line-2)" }}>
              <div className="flex size-14 items-center justify-center rounded-full ig-grad shadow-sm mb-4">
                <Icons.Instagram size={24} className="text-white" />
              </div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>No accounts connected</p>
              <p className="mt-1 max-w-[240px] text-sm" style={{ color: "var(--muted)" }}>
                Connect a Facebook Page linked to your Instagram Professional account to start publishing.
              </p>
            </div>
          )}

          {/* Help tip for link error */}
          {showIgLinkHelp && (
            <div className="mt-4 rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)", color: "var(--warn)" }}>
              <p className="font-semibold">How to fix this</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                <li>Switch Instagram to a Professional account (Creator or Business).</li>
                <li>In Accounts Center, link it to a Facebook Page you manage.</li>
                <li>Click Connect again and select that Page.</li>
              </ol>
            </div>
          )}

          {/* Connect button */}
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--line)" }}>
            <button
              onClick={connectInstagram}
              className="flex w-full items-center justify-center gap-3 rounded-[12px] py-3 text-sm font-semibold text-white transition-colors"
              style={{ background: "#1877F2" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1462d4")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#1877F2")}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {accounts.length > 0 ? "Connect another account" : "Connect via Facebook"}
            </button>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--muted)" }}>
              Use the Facebook profile that manages the Page linked to your Instagram.
            </p>
            {connectError && (
              <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--err-soft)", color: "var(--err)" }}>{connectError}</p>
            )}
          </div>
        </div>

        {/* Google Drive Panel */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--bg)" }}>
              <Icons.Drive size={18} style={{ color: "var(--ink-2)" } as React.CSSProperties} />
            </div>
            <div>
              <p className="section-eyebrow mb-0.5">Media Source</p>
              <h2 className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>Google Drive</h2>
            </div>
          </div>
          <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
            Connect your workspace Google Drive to import images and videos into your content queue.
          </p>

          {/* Drive status card */}
          <div className="rounded-[14px] px-5 py-4 mb-5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full" style={{ background: "var(--surface)" }}>
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
                <p className="section-eyebrow mb-0.5">Drive status</p>
                <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>{driveStatus}</p>
              </div>
              {connectedDrive && <Pill tone="ok">Connected</Pill>}
            </div>
            {connectedDrive && (
              <p className="mt-3 truncate text-sm" style={{ color: "var(--ink-2)" }}>
                Signed in as <span className="font-medium">{connectedDrive.accountEmail}</span>
              </p>
            )}
          </div>

          {/* AI Providers placeholder */}
          <div className="rounded-[14px] px-5 py-4 mb-5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-soft)" }}
              >
                <Icons.Sparkles size={18} style={{ color: "var(--accent)" } as React.CSSProperties} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="section-eyebrow mb-0.5">AI Provider</p>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Google Gemini</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Used for caption generation</p>
              </div>
              <Pill tone="ok">Active</Pill>
            </div>
          </div>

          <Link
            to="/drive-browser"
            className="btn-primary w-full justify-center"
          >
            <Icons.Folder size={14} />
            Open Drive Browser
          </Link>
        </div>
      </div>
    </div>
  );
}
