import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { resolveApiAssetUrl } from "../lib/media";
import type { DriveFile, DriveFolder, MediaAsset } from "../lib/types";
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
  const toast = useToast();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [searchParams] = useSearchParams();
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [selectedFolderName, setSelectedFolderName] = useState<string>("Root");
  const [actionError, setActionError] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  const [lastFetchedFolderId, setLastFetchedFolderId] = useState<string | undefined>();
  const [lastFetchedFolderName, setLastFetchedFolderName] = useState<string>("Root");
  const [folderSearch, setFolderSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [importingFileId, setImportingFileId] = useState<string | null>(null);
  const [autoFetchAttempted, setAutoFetchAttempted] = useState(false);

  const { data: importedAssets = [] } = useQuery<MediaAsset[]>({
    queryKey: ["queue-overview", activeBusinessId],
    queryFn: async () =>
      (await api.get("/media", { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId)
  });

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

  const mediaFiles = useMemo(() => {
    const searchNeedle = fileSearch.trim().toLowerCase();

    return files
      .filter((file) => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/"))
      .filter((file) => {
        if (mediaFilter === "image") return file.mimeType.startsWith("image/");
        if (mediaFilter === "video") return file.mimeType.startsWith("video/");
        return true;
      })
      .filter((file) => {
        if (!searchNeedle) return true;
        return file.name.toLowerCase().includes(searchNeedle);
      })
      .sort((left, right) => {
        const leftTime = new Date(left.createdTime || 0).getTime();
        const rightTime = new Date(right.createdTime || 0).getTime();
        return sortOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
      });
  }, [fileSearch, files, mediaFilter, sortOrder]);
  const filteredFolders = useMemo(() => {
    const searchNeedle = folderSearch.trim().toLowerCase();

    return folders.filter((folder) => {
      if (!searchNeedle) return true;
      return folder.name.toLowerCase().includes(searchNeedle);
    });
  }, [folderSearch, folders]);
  const selectedFolderChanged =
    hasFetchedData &&
    (selectedFolderId !== lastFetchedFolderId || selectedFolderName !== lastFetchedFolderName);

  useEffect(() => {
    setSelectedFolderId(undefined);
    setSelectedFolderName("Root");
    setFolders([]);
    setFiles([]);
    setFetchError("");
    setHasFetchedData(false);
    setLastFetchedFolderId(undefined);
    setLastFetchedFolderName("Root");
    setFolderSearch("");
    setFileSearch("");
    setMediaFilter("all");
    setSortOrder("newest");
    setAutoFetchAttempted(false);
  }, [activeBusinessId]);

  useEffect(() => {
    if (connectionState === "connected") return;
    setFolders([]);
    setFiles([]);
    setFetchError("");
    setHasFetchedData(false);
    setLastFetchedFolderId(undefined);
    setLastFetchedFolderName("Root");
    setFolderSearch("");
    setFileSearch("");
    setAutoFetchAttempted(false);
  }, [connectionState]);

  useEffect(() => {
    if (
      !activeBusinessId ||
      !connectedDrive ||
      hasFetchedData ||
      isFetchingData ||
      autoFetchAttempted
    ) {
      return;
    }

    setAutoFetchAttempted(true);
    fetchDriveData();
  }, [activeBusinessId, autoFetchAttempted, connectedDrive, hasFetchedData, isFetchingData]);

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

  async function fetchDriveData() {
    if (!activeBusinessId || !connectedDrive) return;

    try {
      setActionError("");
      setFetchError("");
      setIsFetchingData(true);

      const [foldersResponse, filesResponse] = await Promise.all([
        api.get("/google-drive/folders", {
          params: { businessId: activeBusinessId, parentFolderId: selectedFolderId }
        }),
        api.get("/google-drive/files", {
          params: { businessId: activeBusinessId, folderId: selectedFolderId }
        })
      ]);

      setFolders(foldersResponse.data.data);
      setFiles(filesResponse.data.data);
      setHasFetchedData(true);
      setLastFetchedFolderId(selectedFolderId);
      setLastFetchedFolderName(selectedFolderName);
    } catch (error) {
      setFetchError(
        extractApiError(error, "Drive data could not be fetched for this folder.")
      );
    } finally {
      setIsFetchingData(false);
    }
  }

  async function disconnectGoogleDrive() {
    if (!activeBusinessId) return;

    try {
      setActionError("");
      await api.post("/google-drive/disconnect", { businessId: activeBusinessId });
      setSelectedFolderId(undefined);
      setSelectedFolderName("Root");
      setFolders([]);
      setFiles([]);
      setFetchError("");
      setHasFetchedData(false);
      setLastFetchedFolderId(undefined);
      setLastFetchedFolderName("Root");
      queryClient.invalidateQueries({ queryKey: ["drive-connections", activeBusinessId] });
    } catch (error) {
      setActionError(extractApiError(error, "Drive could not be disconnected."));
    }
  }

  async function importFile(file: DriveFile) {
    if (!activeBusinessId) return;

    try {
      setImportingFileId(file.id);
      const response = await api.post("/media/import-from-drive", {
        businessId: activeBusinessId,
        driveFileId: file.id,
        driveFolderId: selectedFolderId,
        folderName: selectedFolderName,
        originalName: file.name,
        mimeType: file.mimeType,
        sizeInBytes: Number(file.size || 0),
        previewUrl: file.previewUrl || undefined,
        driveThumbnailLink: file.thumbnailLink || undefined,
        driveViewLink: file.webViewLink || undefined
      });

      const alreadyImported = Boolean(response.data?.meta?.alreadyImported);

      toast({
        tone: alreadyImported ? "info" : "success",
        title: alreadyImported ? "File already imported" : "File imported",
        description: alreadyImported
          ? `${file.name} is already in the content queue.`
          : `${file.name} was added to the content queue.`
      });

      queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
    } catch (error) {
      const message = extractApiError(error, "File could not be imported.");
      const isDuplicate = /already exists|already imported|duplicate/i.test(message);

      toast({
        tone: isDuplicate ? "info" : "error",
        title: isDuplicate ? "File already imported" : "Import failed",
        description: isDuplicate
          ? `${file.name} is already in the content queue.`
          : message
      });
    } finally {
      setImportingFileId(null);
    }
  }

  return (
    <div className="space-y-6">
      {oauthFeedback ? (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${oauthFeedback.tone === "success"
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
                onClick={fetchDriveData}
                disabled={connectionState !== "connected" || isFetchingData}
                className="rounded-full border border-[#10332b] px-5 py-3 text-sm font-medium text-[#10332b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetchingData ? "Fetching..." : hasFetchedData ? "Fetch Data Again" : "Fetch Data"}
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
            {fetchError ? <p className="mt-3 text-sm text-red-600">{fetchError}</p> : null}

            <div className="mt-6 space-y-2 text-sm text-slate-700">
              <p>1. Click `Connect Drive`</p>
              <p>2. Approve Google access</p>
              <p>3. Data auto-loads after connection, or click `Fetch Data` any time to refresh</p>
              <p>4. Preview and import the file you want</p>
            </div>
          </div>

          <div className="rounded-3xl border border-[#d7ddd4] bg-[#fbfbf8] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current result</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <MetricCard label="Folders" value={connectedDrive && hasFetchedData ? folders.length : 0} />
              <MetricCard label="Media Files" value={connectedDrive && hasFetchedData ? mediaFiles.length : 0} />
              <MetricCard label="Imported" value={importedAssets.length} note="Count from DB queue" />
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {hasFetchedData
                ? `Loaded from ${lastFetchedFolderName}.`
                : "No Drive data loaded yet. Use Fetch Data when you are ready."}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Panel
          title="Folders"
          description="Only folders that contain images or videos within two levels are shown here."
        >
          {!connectedDrive ? (
            <SimpleEmptyState text="Connect Drive first to load folders." />
          ) : !hasFetchedData ? (
            <SimpleEmptyState text="Click Fetch Data to load the root folder." />
          ) : (
            <div className="space-y-2">
              <input
                value={folderSearch}
                onChange={(event) => setFolderSearch(event.target.value)}
                placeholder="Search folders"
                className="w-full rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
              />
              <button
                onClick={() => {
                  setSelectedFolderId(undefined);
                  setSelectedFolderName("Root");
                }}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${!selectedFolderId
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-[#f6f7f2] text-slate-700 hover:bg-emerald-50/60"
                  }`}
              >
                Root folder
              </button>
              {filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setSelectedFolderName(folder.name);
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${selectedFolderId === folder.id
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-[#f6f7f2] text-slate-700 hover:bg-emerald-50/60"
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span>{folder.name}</span>
                    <FolderTypeBadge folder={folder} />
                  </div>
                </button>
              ))}
              {!filteredFolders.length ? (
                <SimpleEmptyState text="No matching media folders were found." />
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          title={selectedFolderName === "Root" ? "Fetched media" : `Fetched media from ${selectedFolderName}`}
          description="The selected folder shows only its real folder data. Use filters to switch between images and videos."
        >
          {!connectedDrive ? (
            <SimpleEmptyState text="No Drive data is being shown because your workspace is not connected." />
          ) : isFetchingData ? (
            <LoadingGrid />
          ) : !hasFetchedData ? (
            <SimpleEmptyState text="Click Fetch Data to load image and video files." />
          ) : selectedFolderChanged ? (
            <SimpleEmptyState
              text={`Folder changed to ${selectedFolderName}. Click Fetch Data to load this folder.`}
            />
          ) : !mediaFiles.length ? (
            <SimpleEmptyState text="No image or video files were found in this folder." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={fileSearch}
                  onChange={(event) => setFileSearch(event.target.value)}
                  placeholder="Search image or video files"
                  className="rounded-2xl border border-[#d7ddd4] px-4 py-3 text-sm outline-none ring-emerald-200 focus:ring-2"
                />
                <select
                  value={mediaFilter}
                  onChange={(event) =>
                    setMediaFilter(event.target.value as "all" | "image" | "video")
                  }
                  className="rounded-2xl border border-[#d7ddd4] bg-white px-4 py-3 text-sm text-slate-800"
                >
                  <option value="all">All media</option>
                  <option value="image">Images only</option>
                  <option value="video">Videos only</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(event.target.value as "newest" | "oldest")
                  }
                  className="rounded-2xl border border-[#d7ddd4] bg-white px-4 py-3 text-sm text-slate-800"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {mediaFiles.map((file) => (
                  <article
                    key={file.id}
                    className="overflow-hidden rounded-[24px] border border-[#d7ddd4] bg-[#fcfcfa]"
                  >
                    <div className="aspect-[4/3] bg-[#eef1ea]">
                      {file.mimeType.startsWith("image/") && file.previewUrl ? (
                        <img
                          src={resolveApiAssetUrl(file.previewUrl)}
                          alt={file.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
                          {file.mimeType.startsWith("video/") ? "Video preview" : "No preview available"}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-4">
                      <div>
                        <p className="line-clamp-2 font-medium text-slate-900">{file.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                          {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {file.createdTime
                            ? new Date(file.createdTime).toLocaleString()
                            : "Created time unavailable"}
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
                          disabled={importingFileId === file.id}
                          className="flex-1 rounded-full bg-[#10332b] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {importingFileId === file.id ? "Importing..." : "Import"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FolderTypeBadge({ folder }: { folder: DriveFolder }) {
  const label = folder.containsImages && folder.containsVideos
    ? "Photos + Videos"
    : folder.containsImages
      ? "Photos"
      : "Videos";

  return (
    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
      {label}
    </span>
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
