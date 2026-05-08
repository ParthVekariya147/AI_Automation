import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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

type MediaViewMode = "large" | "medium" | "small" | "detailed";

type DriveFilesResponse = {
  success: boolean;
  data: DriveFile[];
  meta?: {
    pageSize?: number;
    nextPageToken?: string | null;
    hasMore?: boolean;
  };
};

export function DriveBrowserPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [searchParams] = useSearchParams();
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>("root");
  const [selectedFolderName, setSelectedFolderName] = useState<string>("");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [folderTree, setFolderTree] = useState<Record<string, DriveFolder[]>>({});
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set(["root"]));
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  const [lastFetchedFolderId, setLastFetchedFolderId] = useState<string | undefined>();
  const [lastFetchedFolderName, setLastFetchedFolderName] = useState<string>("");
  const [filesNextPageToken, setFilesNextPageToken] = useState<string | null>(null);
  const [isFetchingMoreFiles, setIsFetchingMoreFiles] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewMode, setViewMode] = useState<MediaViewMode>("large");
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState("");
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

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

  const importedDriveFileIds = useMemo(
    () => new Set(importedAssets.map((asset) => asset.driveFileId).filter(Boolean)),
    [importedAssets]
  );

  const folderDetail = useQuery({
    queryKey: ["drive-folder-detail", activeBusinessId, selectedFolderId],
    queryFn: async () =>
      (await api.get(`/google-drive/folders/${selectedFolderId || "root"}`, { params: { businessId: activeBusinessId } })).data.data,
    enabled: Boolean(activeBusinessId && selectedFolderId),
  });

  useEffect(() => {
    if (folderDetail.data?.name) {
      setSelectedFolderName(folderDetail.data.name);
    } else if (selectedFolderId === "root") {
      setSelectedFolderName("My Drive");
    }
  }, [folderDetail.data, selectedFolderId]);

  const oauthStatus = searchParams.get("connected");
  const oauthError = searchParams.get("error");
  const oauthFeedback = useMemo(() => {
    if (oauthStatus === "1") {
      return {
        tone: "success" as const,
        text: "Google Drive connected."
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

  const hasMoreFiles = Boolean(filesNextPageToken);

  useEffect(() => {
    setSelectedFolderId("root");
    setFolderTree({});
    setFiles([]);
    setFetchError("");
    setHasFetchedData(false);
    setLastFetchedFolderId(undefined);
    setLastFetchedFolderName("");
    setFilesNextPageToken(null);
    setIsFetchingMoreFiles(false);
    setFolderSearch("");
    setFileSearch("");
    setMediaFilter("all");
    setSortOrder("newest");
    setViewMode("large");
    setSelectedFileIds([]);
    setLastSelectedIndex(null);
  }, [activeBusinessId]);

  useEffect(() => {
    if (connectionState === "connected") return;
    setFolderTree({});
    setFiles([]);
    setFetchError("");
    setHasFetchedData(false);
    setLastFetchedFolderId(undefined);
    setLastFetchedFolderName("");
    setFilesNextPageToken(null);
    setIsFetchingMoreFiles(false);
    setFolderSearch("");
    setFileSearch("");
    setSelectedFileIds([]);
    setLastSelectedIndex(null);
  }, [connectionState]);

  useEffect(() => {
    if (
      !activeBusinessId ||
      !connectedDrive ||
      isFetchingData ||
      isFetchingMoreFiles ||
      selectedFolderId === lastFetchedFolderId
    ) {
      return;
    }

    fetchDriveData();
  }, [
    activeBusinessId,
    connectedDrive,
    selectedFolderId,
    lastFetchedFolderId,
    isFetchingData,
    isFetchingMoreFiles
  ]);

  useEffect(() => {
    if (!hasFetchedData || !hasMoreFiles || isFetchingData || isFetchingMoreFiles) {
      return;
    }

    if (selectedFolderId !== lastFetchedFolderId) {
      return;
    }

    const trigger = loadMoreTriggerRef.current;
    if (!trigger) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        void fetchDriveData({ append: true });
      },
      { rootMargin: "320px 0px" }
    );

    observer.observe(trigger);

    return () => observer.disconnect();
  }, [
    hasFetchedData,
    hasMoreFiles,
    isFetchingData,
    isFetchingMoreFiles,
    selectedFolderId,
    lastFetchedFolderId,
    filesNextPageToken
  ]);

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
          "Drive connection could not start."
        )
      );
    }
  }

  async function fetchDriveData(options?: { append?: boolean }) {
    if (!activeBusinessId || !connectedDrive) return;

    const append = Boolean(options?.append);
    if (append && (!filesNextPageToken || isFetchingMoreFiles)) {
      return;
    }

    try {
      setFetchError("");

      if (append) {
        setIsFetchingMoreFiles(true);
      } else {
        setIsFetchingData(true);
      }

      const fileParams = {
        businessId: activeBusinessId,
        folderId: selectedFolderId === "root" ? undefined : selectedFolderId,
        pageToken: append ? filesNextPageToken || undefined : undefined
      };

      if (append) {
        const filesResponse = await api.get<DriveFilesResponse>("/google-drive/files", {
          params: fileParams
        });

        const nextBatch = filesResponse.data.data || [];

        setFiles((previous) => {
          const deduped = new Map(previous.map((file) => [file.id, file]));
          for (const file of nextBatch) {
            if (!deduped.has(file.id)) {
              deduped.set(file.id, file);
            }
          }
          return Array.from(deduped.values());
        });
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
        return;
      }

      if (!hasFetchedData) {
        // First load: fetch root tree (My Drive + Shared) and files together
        const [foldersResponse, filesResponse] = await Promise.all([
          api.get("/google-drive/folders", { params: { businessId: activeBusinessId } }),
          api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams })
        ]);

        const folderData = foldersResponse.data.data as { myDrive: DriveFolder[]; sharedWithMe: DriveFolder[] };
        setFolderTree((prev) => ({
          ...prev,
          root: folderData.myDrive ?? [],
          shared: folderData.sharedWithMe ?? []
        }));
        setFiles(filesResponse.data.data || []);
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
      } else {
        // Subsequent folder changes: only reload files (tree already loaded)
        const filesResponse = await api.get<DriveFilesResponse>("/google-drive/files", {
          params: fileParams
        });
        setFiles(filesResponse.data.data || []);
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
      }

      setHasFetchedData(true);
      setLastFetchedFolderId(selectedFolderId);
      setLastFetchedFolderName(selectedFolderName);
      setSelectedFileIds([]);
      setLastSelectedIndex(null);
    } catch (error) {
      setFetchError(
        extractApiError(error, "Drive data could not be fetched for this folder.")
      );
    } finally {
      if (append) {
        setIsFetchingMoreFiles(false);
      } else {
        setIsFetchingData(false);
      }
    }
  }

  async function toggleFolder(folder: DriveFolder) {
    const isExpanded = expandedFolderIds.has(folder.id);
    const newExpanded = new Set(expandedFolderIds);

    if (isExpanded) {
      newExpanded.delete(folder.id);
    } else {
      newExpanded.add(folder.id);

      if (!folderTree[folder.id]) {
        try {
          const response = await api.get("/google-drive/folders", {
            params: { businessId: activeBusinessId, parentId: folder.id }
          });
          setFolderTree((prev) => ({
            ...prev,
            [folder.id]: response.data.data as DriveFolder[]
          }));
        } catch (error) {
          toast({
            tone: "error",
            title: "Could not load subfolders",
            description: extractApiError(error, "Please try again.")
          });
        }
      }
    }

    setExpandedFolderIds(newExpanded);
    setSelectedFolderId(folder.id);
  }

  async function disconnectDrive() {
    if (!activeBusinessId) return;
    try {
      await api.post("/google-drive/disconnect", { businessId: activeBusinessId });
      queryClient.invalidateQueries({ queryKey: ["drive-connections", activeBusinessId] });
      setSelectedFolderId("root");
      setSelectedFolderName("My Drive");
      setFolderTree({});
      setFiles([]);
      setHasFetchedData(false);
      setLastFetchedFolderId(undefined);
      setLastFetchedFolderName("");
      setFilesNextPageToken(null);
      setIsFetchingMoreFiles(false);
    } catch (error) {
      toast({ tone: "error", title: "Error", description: extractApiError(error, "Disconnect failed.") });
    }
  }

  async function importFile(file: DriveFile) {
    if (!activeBusinessId) return;

    try {
      setImportingFileIds((prev) => {
        const next = new Set(prev);
        next.add(file.id);
        return next;
      });
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
      setImportingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  }

  async function importSelectedFiles() {
    if (!activeBusinessId || !selectedFileIds.length) return;
    const filesToImport = mediaFiles.filter((f) => selectedFileIds.includes(f.id));
    if (!filesToImport.length) return;

    setImportingFileIds((prev) => {
      const next = new Set(prev);
      filesToImport.forEach((f) => next.add(f.id));
      return next;
    });

    let newCount = 0;
    let alreadyCount = 0;
    let failCount = 0;

    await Promise.allSettled(
      filesToImport.map(async (file) => {
        try {
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

          if (response.data?.meta?.alreadyImported) {
            alreadyCount++;
          } else {
            newCount++;
          }
        } catch (error) {
          const message = extractApiError(error, "File could not be imported.");
          if (/already exists|already imported|duplicate/i.test(message)) {
            alreadyCount++;
          } else {
            failCount++;
          }
        } finally {
          setImportingFileIds((prev) => {
            const next = new Set(prev);
            next.delete(file.id);
            return next;
          });
        }
      })
    );

    toast({
      tone: failCount > 0 ? "error" : "success",
      title: "Bulk import finished",
      description: `Successfully imported ${newCount} files. ${alreadyCount > 0 ? `${alreadyCount} were already in queue. ` : ""}${failCount > 0 ? `Failed to import ${failCount} files.` : ""}`
    });

    queryClient.invalidateQueries({ queryKey: ["queue-overview", activeBusinessId] });
    queryClient.invalidateQueries({ queryKey: ["queue", activeBusinessId] });
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
    setSelectedFileIds([]);
  }

  useEffect(() => {
    const visibleIds = new Set(mediaFiles.map((file) => file.id));
    setSelectedFileIds((current) => current.filter((id) => visibleIds.has(id)));
    setLastSelectedIndex(null);
  }, [mediaFiles]);

  function toggleFileSelection(file: DriveFile, index: number, event: MouseEvent) {
    const isRangeSelect = event.shiftKey && lastSelectedIndex !== null;
    const isMultiSelect = event.metaKey || event.ctrlKey;

    setSelectedFileIds((current) => {
      if (isRangeSelect) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = mediaFiles.slice(start, end + 1).map((item) => item.id);
        if (isMultiSelect) {
          return Array.from(new Set([...current, ...rangeIds]));
        }
        return rangeIds;
      }

      if (isMultiSelect) {
        if (current.includes(file.id)) {
          return current.filter((id) => id !== file.id);
        }
        return [...current, file.id];
      }

      return [file.id];
    });

    setLastSelectedIndex(index);
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Drive Browser</h1>
          <p className="mt-0.5 text-sm text-slate-500">Browse Google Drive and import media into the content queue</p>
        </div>
        <StatusPill state={connectionState} />
      </div>

      {/* OAuth feedback */}
      {oauthFeedback ? (
        <div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${oauthFeedback.tone === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
            }`}
        >
          {oauthFeedback.tone === "success" ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-emerald-500">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-red-500">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          )}
          {oauthFeedback.text}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Media Source"
          value={connectedDrive ? "Google Drive" : "Not Connected"}
          subValue={connectedDrive?.accountEmail}
        />
        <MetricCard
          label="Folders"
          value={connectedDrive && hasFetchedData ? (Object.keys(folderTree).length) : 0}
          subValue="Total folders found"
        />
        <MetricCard
          label="Files found"
          value={hasFetchedData ? mediaFiles.length : 0}
          subValue={lastFetchedFolderName ? `From ${lastFetchedFolderName}` : "Select a folder to fetch"}
        />
        <MetricCard
          label="Imported"
          value={importedAssets.length}
          subValue="Items in Content Queue"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Panel
            title="Media Source"
            description="Connect your workspace Google Drive and explore the folder structure to find content."
          >
            <div className="flex flex-wrap gap-2">
              <button
                onClick={connectGoogleDrive}
                className="flex items-center gap-2 rounded-xl bg-[#10332b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0e2c25]"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                {connectionState === "connected" ? "Reconnect Drive" : "Connect Drive"}
              </button>
              <button
                onClick={disconnectDrive}
                disabled={connectionState !== "connected"}
                className="rounded-xl border border-[#d7ddd4] px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Disconnect
              </button>
            </div>
            {actionError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5">
                <svg viewBox="0 0 16 16" fill="currentColor" className="mt-0.5 size-3.5 shrink-0 text-red-500">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7.25a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
                <p className="text-xs text-red-700">{actionError}</p>
              </div>
            )}
            {connectedDrive && (
              <div className="mt-4">
                <button
                  onClick={() => {
                    setHasFetchedData(false);
                    setFolderTree({});
                    setFiles([]);
                    setFilesNextPageToken(null);
                    setLastFetchedFolderId(undefined);
                    setSelectedFolderId("root");
                    setSelectedFolderName("My Drive");
                  }}
                  disabled={connectionState !== "connected" || isFetchingData || isFetchingMoreFiles}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFetchingData || isFetchingMoreFiles ? (
                    <>
                      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Fetching…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                      </svg>
                      Refresh Drive Data
                    </>
                  )}
                </button>
              </div>
            )}
          </Panel>

          <Panel
            title="Folders"
            description="Explore your Drive folders. We only show folders that contain images or videos."
          >
            {!connectedDrive ? (
              <SimpleEmptyState text="Connect Drive first to load folders." />
            ) : !hasFetchedData ? (
              <SimpleEmptyState text="Click Refresh to load the folder tree." />
            ) : (
              <div className="space-y-2">
                <input
                  value={folderSearch}
                  onChange={(event) => setFolderSearch(event.target.value)}
                  placeholder="Filter folders"
                  className="mb-2 w-full rounded-2xl border border-[#d7ddd4] px-4 py-2 text-sm outline-none ring-emerald-200 focus:ring-2"
                />

                {/* My Drive section */}
                <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  My Drive
                </p>
                <button
                  onClick={() => {
                    setSelectedFolderId("root");
                    setSelectedFolderName("My Drive");
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    selectedFolderId === "root" || !selectedFolderId
                      ? "bg-emerald-100 text-emerald-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-slate-400">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  My Drive
                </button>

                <div className="space-y-0.5">
                  {(folderTree["root"] || [])
                    .filter(f => !folderSearch || f.name.toLowerCase().includes(folderSearch.toLowerCase()))
                    .map((folder) => (
                      <FolderNode
                        key={folder.id}
                        folder={folder}
                        folderTree={folderTree}
                        expandedFolderIds={expandedFolderIds}
                        selectedFolderId={selectedFolderId}
                        onToggle={toggleFolder}
                        onSelect={(f) => {
                          setSelectedFolderId(f.id);
                          setSelectedFolderName(f.name);
                        }}
                      />
                    ))}
                  {(folderTree["root"] || []).length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-400 italic">No media folders found.</p>
                  )}
                </div>

                {/* Shared with me section */}
                {((folderTree["shared"] || []).length > 0 || hasFetchedData) && (
                  <>
                    <p className="mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Shared with me
                    </p>
                    <div className="space-y-0.5">
                      {(folderTree["shared"] || [])
                        .filter(f => !folderSearch || f.name.toLowerCase().includes(folderSearch.toLowerCase()))
                        .map((folder) => (
                          <FolderNode
                            key={folder.id}
                            folder={folder}
                            folderTree={folderTree}
                            expandedFolderIds={expandedFolderIds}
                            selectedFolderId={selectedFolderId}
                            onToggle={toggleFolder}
                            onSelect={(f) => {
                              setSelectedFolderId(f.id);
                              setSelectedFolderName(f.name);
                            }}
                          />
                        ))}
                      {(folderTree["shared"] || []).length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-400 italic">No shared folders found.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title={selectedFolderName ? `Media in ${selectedFolderName}` : "Select a folder"}
          description={hasFetchedData ? `Loaded ${mediaFiles.length} items from Drive.` : "Fetch content to see image and video previews."}
        >
          {!connectedDrive ? (
            <SimpleEmptyState text="No Drive data is being shown because your workspace is not connected." />
          ) : isFetchingData ? (
            <LoadingGrid />
          ) : !hasFetchedData ? (
            <SimpleEmptyState text="Click Fetch Data to load image and video files." />
          ) : !mediaFiles.length ? (
            <SimpleEmptyState text="No image or video files were found in this folder." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={fileSearch}
                  onChange={(event) => setFileSearch(event.target.value)}
                  placeholder="Search files..."
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
                <select
                  value={viewMode}
                  onChange={(event) => setViewMode(event.target.value as MediaViewMode)}
                  className="rounded-2xl border border-[#d7ddd4] bg-white px-4 py-3 text-sm text-slate-800"
                >
                  <option value="large">Large</option>
                  <option value="medium">Medium</option>
                  <option value="small">Small</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-600">
                <p>
                  {selectedFileIds.length} selected · Tip: use Shift+Click to select a range, Ctrl/Cmd+Click for multi-select.
                </p>
                <div className="flex items-center gap-3">
                  {selectedFileIds.length ? (
                    <>
                      <button
                        onClick={() => {
                          setSelectedFileIds([]);
                          setLastSelectedIndex(null);
                        }}
                        className="rounded-full border border-[#d7ddd4] bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Clear selection
                      </button>
                      <button
                        onClick={importSelectedFiles}
                        disabled={importingFileIds.size > 0}
                        className="shrink-0 rounded-full bg-[#10332b] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {importingFileIds.size > 0 ? "Importing..." : `Import ${selectedFileIds.length} files`}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {viewMode === "detailed" ? (
                <div className="space-y-2">
                  {mediaFiles.map((file, index) => {
                    const selected = selectedFileIds.includes(file.id);
                    const imported = importedDriveFileIds.has(file.id);
                    return (
                      <article
                        key={file.id}
                        onClick={(event) => toggleFileSelection(file, index, event)}
                        className={`grid cursor-pointer gap-3 rounded-2xl border bg-[#fcfcfa] p-3 transition md:grid-cols-[64px_1fr_auto] ${selected
                            ? "border-emerald-400 ring-2 ring-emerald-200"
                            : "border-[#d7ddd4] hover:border-emerald-300"
                          }`}
                      >
                        <div className="h-16 w-16 overflow-hidden rounded-xl bg-[#eef1ea]">
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img
                              src={resolveApiAssetUrl(file.previewUrl)}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                              {file.mimeType.startsWith("video/") ? "Video" : "No preview"}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900" title={file.name}>{file.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {file.mimeType.startsWith("video/") ? "Video" : "Image"} ·{" "}
                            {file.createdTime ? new Date(file.createdTime).toLocaleString() : "Created time unavailable"}
                          </p>
                          {imported ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">Already imported</p>
                          ) : null}
                        </div>
                        <div
                          className="flex items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {file.webViewLink ? (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-[#d7ddd4] px-3 py-2 text-center text-xs font-medium text-slate-700"
                            >
                              Open
                            </a>
                          ) : null}
                          <button
                            onClick={() => importFile(file)}
                            disabled={importingFileIds.has(file.id)}
                            className="rounded-full bg-[#10332b] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {importingFileIds.has(file.id) ? "Importing..." : imported ? "Re-import" : "Import"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`grid ${viewMode === "large"
                      ? "gap-4 sm:grid-cols-2 xl:grid-cols-3"
                      : viewMode === "medium"
                        ? "gap-3 sm:grid-cols-3 xl:grid-cols-4"
                        : "gap-2 sm:grid-cols-4 xl:grid-cols-6"
                    }`}
                >
                  {mediaFiles.map((file, index) => {
                    const selected = selectedFileIds.includes(file.id);
                    const imported = importedDriveFileIds.has(file.id);
                    return (
                      <article
                        key={file.id}
                        onClick={(event) => toggleFileSelection(file, index, event)}
                        className={`cursor-pointer overflow-hidden rounded-2xl border bg-[#fcfcfa] transition ${selected
                            ? "border-emerald-400 ring-2 ring-emerald-200"
                            : "border-[#d7ddd4] hover:border-emerald-300"
                          }`}
                      >
                        <div
                          className={`relative bg-[#eef1ea] ${viewMode === "large" ? "h-80" : viewMode === "medium" ? "h-52" : "h-32"
                            }`}
                        >
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img
                              src={resolveApiAssetUrl(file.previewUrl)}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-medium text-slate-500">
                              {file.mimeType.startsWith("video/") ? "Video preview" : "No preview"}
                            </div>
                          )}
                          {imported ? (
                            <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                              Imported
                            </span>
                          ) : null}
                        </div>

                        <div className={`${viewMode === "small" ? "space-y-2 p-2.5" : "space-y-3 p-3.5"} min-w-0`}>
                          <div className="min-w-0">
                            <p className={`${viewMode === "small" ? "line-clamp-1 text-sm" : "line-clamp-2"} font-medium text-slate-900 break-words`} title={file.name}>
                              {file.name}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                              {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                            </p>
                            {viewMode !== "small" ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {file.createdTime
                                  ? new Date(file.createdTime).toLocaleString()
                                  : "Created time unavailable"}
                              </p>
                            ) : null}
                          </div>

                          <div
                            className="flex gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
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
                              disabled={importingFileIds.has(file.id)}
                              className="flex-1 rounded-full bg-[#10332b] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {importingFileIds.has(file.id) ? "Importing..." : imported ? "Re-import" : "Import"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMoreFiles ? (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div ref={loadMoreTriggerRef} className="h-1 w-full" />
                  <button
                    onClick={() => fetchDriveData({ append: true })}
                    disabled={isFetchingData || isFetchingMoreFiles}
                    className="rounded-full border border-[#10332b] px-5 py-2 text-sm font-medium text-[#10332b] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isFetchingMoreFiles ? "Loading more..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FolderTypeBadge({ folder }: { folder: DriveFolder }) {
  if (!folder.containsImages && !folder.containsVideos) return null;

  const label = folder.containsImages && folder.containsVideos
    ? "Photos + Videos"
    : folder.containsImages
      ? "Photos"
      : "Videos";

  return (
    <span className="shrink-0 rounded-full bg-[#eef1ea] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
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
  subValue
}: {
  label: string;
  value: number | string;
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      {subValue ? <p className="mt-1 text-xs text-slate-500">{subValue}</p> : null}
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

function FolderNode({
  folder,
  folderTree,
  expandedFolderIds,
  selectedFolderId,
  onToggle,
  onSelect,
  depth = 0
}: {
  folder: DriveFolder;
  folderTree: Record<string, DriveFolder[]>;
  expandedFolderIds: Set<string>;
  selectedFolderId?: string;
  onToggle: (f: DriveFolder) => void;
  onSelect: (f: DriveFolder) => void;
  depth?: number;
}) {
  const isExpanded = expandedFolderIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const children = folderTree[folder.id] || [];

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded-xl py-1.5 pr-2 text-sm font-medium transition ${isSelected ? "bg-emerald-50 text-emerald-900" : "text-slate-700 hover:bg-slate-100"}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(folder)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(folder);
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-black/5"
        >
          {isExpanded ? (
            <span className="text-[10px] opacity-60">▼</span>
          ) : (
            <span className="text-[10px] opacity-60">▶</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate">{folder.name}</p>
          {folder.owner ? (
            <p className="truncate text-[10px] font-normal text-slate-400">{folder.owner}</p>
          ) : null}
        </div>
        <FolderTypeBadge folder={folder} />
        {folder.owner ? (
          <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            Shared
          </span>
        ) : null}
      </div>

      {isExpanded && children.length > 0 && (
        <div>
          {children.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              folderTree={folderTree}
              expandedFolderIds={expandedFolderIds}
              selectedFolderId={selectedFolderId}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
      {isExpanded && !folderTree[folder.id] && (
        <div className="py-1 text-xs italic text-slate-400" style={{ paddingLeft: `${depth * 12 + 32}px` }}>
          Loading…
        </div>
      )}
    </div>
  );
}
