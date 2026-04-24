import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import type { DriveFile, DriveFolder } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

type DriveConnection = {
  _id: string;
  accountEmail: string;
  folderId?: string;
  isActive: boolean;
  isOAuthReady: boolean;
};

export function DriveBrowserPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [searchParams] = useSearchParams();
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [selectedFolderName, setSelectedFolderName] = useState<string>("Root");
  const [actionError, setActionError] = useState("");

  const { data: connections = [], isLoading: connectionsLoading } = useQuery<DriveConnection[]>({
    queryKey: ["drive-connections", activeBusinessId],
    queryFn: async () =>
      (await api.get("/google-drive/connections", { params: { businessId: activeBusinessId } }))
        .data.data,
    enabled: Boolean(activeBusinessId)
  });

  const connectedDrive = connections.find((connection) => connection.isActive && connection.isOAuthReady);
  const connectionState: "not_connected" | "connected" | "disconnected" = connectedDrive
    ? "connected"
    : connections.length
      ? "disconnected"
      : "not_connected";

  const { data: folders = [] } = useQuery<DriveFolder[]>({
    queryKey: ["drive-folders", activeBusinessId, selectedFolderId],
    queryFn: async () =>
      (
        await api.get("/google-drive/folders", {
          params: { businessId: activeBusinessId, parentFolderId: selectedFolderId }
        })
      ).data.data,
    enabled: Boolean(activeBusinessId && connectedDrive)
  });

  const {
    data: files = [],
    isLoading: filesLoading,
    error: filesError
  } = useQuery<DriveFile[]>({
    queryKey: ["drive-files", activeBusinessId, selectedFolderId],
    queryFn: async () =>
      (
        await api.get("/google-drive/files", {
          params: { businessId: activeBusinessId, folderId: selectedFolderId }
        })
      ).data.data,
    enabled: Boolean(activeBusinessId && connectedDrive)
  });

  const oauthStatus = searchParams.get("connected");
  const oauthError = searchParams.get("error");
  const oauthFeedback = useMemo(() => {
    if (oauthStatus === "1") {
      return {
        tone: "success" as const,
        text: "Google Drive connected. Task 1 is complete, and the app is ready to fetch and display files."
      };
    }

    if (oauthStatus === "0") {
      const errorMessages: Record<string, string> = {
        missing_code_or_state: "Google callback was incomplete. Start the connection again.",
        invalid_state: "Google callback state expired. Start the connection again.",
        access_denied: "Google permission was denied.",
        missing_refresh_token:
          "Google did not return a refresh token. Remove this app from Google permissions and reconnect.",
        oauth_callback_failed: "Google OAuth completed but the account sync failed."
      };

      return {
        tone: "error" as const,
        text:
          errorMessages[oauthError || ""] ||
          "Google Drive connection did not complete. Try connecting again."
      };
    }

    return undefined;
  }, [oauthError, oauthStatus]);

  const mediaFiles = useMemo(
    () =>
      files.filter(
        (file) => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")
      ),
    [files]
  );

  async function connectGoogleDrive() {
    if (!activeBusinessId) return;
    try {
      setActionError("");
      const response = await api.get("/google-drive/oauth/start", {
        params: { businessId: activeBusinessId, frontendOrigin: window.location.origin }
      });
      window.location.href = response.data.data.authUrl;
    } catch (error) {
      setActionError(
        extractApiError(
          error,
          "Drive connection could not start. Check Google env values and OAuth redirect settings."
        )
      );
    }
  }

  async function disconnectGoogleDrive() {
    if (!activeBusinessId) return;

    try {
      setActionError("");
      await api.post("/google-drive/disconnect", { businessId: activeBusinessId });
      setSelectedFolderId(undefined);
      setSelectedFolderName("Root");
      queryClient.invalidateQueries({ queryKey: ["drive-connections", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["drive-folders", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["drive-files", activeBusinessId] });
    } catch (error) {
      setActionError(extractApiError(error, "Drive could not be disconnected."));
    }
  }

  async function importFile(file: DriveFile) {
    if (!activeBusinessId) return;

    await api.post("/media/import-from-drive", {
      businessId: activeBusinessId,
      driveFileId: file.id,
      driveFolderId: selectedFolderId,
      folderName: selectedFolderName,
      originalName: file.name,
      mimeType: file.mimeType,
      sizeInBytes: Number(file.size || 0),
      driveThumbnailLink: file.thumbnailLink || undefined,
      driveViewLink: file.webViewLink || undefined,
      previewUrl: file.thumbnailLink || file.webViewLink || undefined
    });

    queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
  }

  return (
    <div className="space-y-6">
      {oauthFeedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            oauthFeedback.tone === "success"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-red-50 text-red-700"
          }`}
        >
          {oauthFeedback.text}
        </div>
      ) : null}

      <Panel
        title="Task 1: Connect Drive and fetch data"
        description="This page follows a single-workspace flow: connect Google Drive, check status, fetch folders/files, and display media for the signed-in admin."
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl bg-[#f6f7f2] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Connection status</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusPill state={connectionState} />
              <p className="text-sm text-slate-700">
                {connectionsLoading
                  ? "Checking Drive status..."
                  : connectionState === "connected"
                    ? `${connectedDrive?.accountEmail || "Drive account"} is connected`
                    : connectionState === "disconnected"
                      ? "Drive was connected earlier but is now disconnected"
                      : "Drive is not connected yet"}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={connectGoogleDrive}
                className="rounded-full bg-[#10332b] px-5 py-3 text-sm font-medium text-white"
              >
                {connectionState === "connected" ? "Reconnect Drive" : "Connect Drive"}
              </button>
              <button
                onClick={disconnectGoogleDrive}
                disabled={connectionState !== "connected"}
                className="rounded-full border border-[#d7ddd4] px-5 py-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>

            {actionError ? <p className="mt-3 text-sm text-red-600">{actionError}</p> : null}

            <div className="mt-6 space-y-2 text-sm text-slate-700">
              <p>1. Click `Connect Drive`</p>
              <p>2. Approve Google access</p>
              <p>3. Come back here and the app will fetch folders and files</p>
              <p>4. Preview and import the file you want</p>
            </div>
          </div>

          <div className="rounded-3xl border border-[#d7ddd4] bg-[#fbfbf8] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current result</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <MetricCard label="Folders" value={connectedDrive ? folders.length : 0} />
              <MetricCard label="Media Files" value={connectedDrive ? mediaFiles.length : 0} />
              <MetricCard label="Imported" value={0} note="Import count updates in queue" />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Panel
          title="Folders"
          description="Select a folder to fetch and display the media files inside it."
        >
          {!connectedDrive ? (
            <SimpleEmptyState text="Connect Drive first to load folders." />
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => {
                  setSelectedFolderId(undefined);
                  setSelectedFolderName("Root");
                }}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  !selectedFolderId
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-[#f6f7f2] text-slate-700 hover:bg-emerald-50/60"
                }`}
              >
                Root folder
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setSelectedFolderName(folder.name);
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    selectedFolderId === folder.id
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-[#f6f7f2] text-slate-700 hover:bg-emerald-50/60"
                  }`}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={selectedFolderName === "Root" ? "Fetched media" : `Fetched media from ${selectedFolderName}`}
          description="After the connection is active, the app fetches the image/video data and displays it here."
        >
          {!connectedDrive ? (
            <SimpleEmptyState text="No Drive data is being shown because your workspace is not connected." />
          ) : filesError ? (
            <div className="rounded-3xl border border-dashed border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
              {(filesError as Error).message || "Drive files could not be loaded."}
            </div>
          ) : filesLoading ? (
            <LoadingGrid />
          ) : !mediaFiles.length ? (
            <SimpleEmptyState text="No image or video files were found in this folder." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mediaFiles.map((file) => (
                <article
                  key={file.id}
                  className="overflow-hidden rounded-[24px] border border-[#d7ddd4] bg-[#fcfcfa]"
                >
                  <div className="aspect-[4/3] bg-[#eef1ea]">
                    {file.mimeType.startsWith("image/") ? (
                      <DriveImagePreview
                        businessId={activeBusinessId}
                        file={file}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
                        {file.mimeType.startsWith("video/") ? "Video preview" : "No preview"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="line-clamp-2 font-medium text-slate-900">{file.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                        {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {file.webViewLink ? (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-full border border-[#d7ddd4] px-3 py-2 text-center text-xs font-medium text-slate-700"
                        >
                          Open
                        </a>
                      ) : null}
                      <button
                        onClick={() => importFile(file)}
                        className="flex-1 rounded-full bg-[#10332b] px-3 py-2 text-xs font-medium text-white"
                      >
                        Import
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DriveImagePreview({
  businessId,
  file
}: {
  businessId?: string;
  file: DriveFile;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!businessId || !file.mimeType.startsWith("image/")) {
      setPreviewUrl(undefined);
      setIsLoading(false);
      setPreviewFailed(false);
      return;
    }

    let revokedUrl: string | undefined;
    let cancelled = false;
    setIsLoading(true);
    setPreviewFailed(false);

    api
      .get("/google-drive/preview", {
        params: { businessId, fileId: file.id },
        responseType: "blob"
      })
      .then((response) => {
        const nextUrl = URL.createObjectURL(response.data);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        revokedUrl = nextUrl;
        setPreviewUrl(nextUrl);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(undefined);
          setPreviewFailed(true);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [businessId, file.id, file.mimeType]);

  if (previewUrl) {
    return <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />;
  }

  if (file.thumbnailLink && !previewFailed) {
    return (
      <img
        src={file.thumbnailLink}
        alt={file.name}
        className="h-full w-full object-cover"
        onError={(event) => {
          setPreviewFailed(true);
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
        Loading preview...
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
      No preview
    </div>
  );
}

function StatusPill({ state }: { state: "not_connected" | "connected" | "disconnected" }) {
  const config = {
    connected: "bg-emerald-100 text-emerald-900",
    disconnected: "bg-amber-100 text-amber-900",
    not_connected: "bg-slate-200 text-slate-700"
  }[state];

  const label = {
    connected: "Connected",
    disconnected: "Disconnected",
    not_connected: "Not connected"
  }[state];

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${config}`}>
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function SimpleEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] p-10 text-center text-sm text-slate-600">
      {text}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-72 animate-pulse rounded-[24px] border border-[#d7ddd4] bg-[#f4f5f0]"
        />
      ))}
    </div>
  );
}
