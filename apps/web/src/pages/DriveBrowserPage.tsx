import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { api } from "../lib/api";
import { extractApiError } from "../lib/errors";
import { resolveApiAssetUrl } from "../lib/media";
import type { DriveFile, DriveFolder, MediaAsset } from "../lib/types";
import { useAuthStore } from "../store/auth-store";
import { PageHeader, Icons, Pill } from "../lib/ds";

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
    if (oauthStatus === "1") return { tone: "success" as const, text: "Google Drive connected." };
    if (oauthStatus === "0") {
      const errorMessages: Record<string, string> = {
        missing_code_or_state: "Google callback was incomplete. Start the connection again.",
        invalid_state: "Google callback state expired. Start the connection again.",
        access_denied: "Google permission was denied.",
        missing_refresh_token: "Google did not return a refresh token. Remove this app from Google permissions and reconnect.",
        oauth_callback_failed: "Google OAuth completed but the account sync failed."
      };
      return { tone: "error" as const, text: errorMessages[oauthError || ""] || "Google Drive connection did not complete. Try connecting again." };
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
    if (!activeBusinessId || !connectedDrive || isFetchingData || isFetchingMoreFiles || selectedFolderId === lastFetchedFolderId) return;
    fetchDriveData();
  }, [activeBusinessId, connectedDrive, selectedFolderId, lastFetchedFolderId, isFetchingData, isFetchingMoreFiles]);

  useEffect(() => {
    if (!hasFetchedData || !hasMoreFiles || isFetchingData || isFetchingMoreFiles) return;
    if (selectedFolderId !== lastFetchedFolderId) return;
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      void fetchDriveData({ append: true });
    }, { rootMargin: "320px 0px" });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasFetchedData, hasMoreFiles, isFetchingData, isFetchingMoreFiles, selectedFolderId, lastFetchedFolderId, filesNextPageToken]);

  async function connectGoogleDrive() {
    if (!activeBusinessId) return;
    try {
      setActionError("");
      const response = await api.get("/google-drive/oauth/start", {
        params: { businessId: activeBusinessId, frontendOrigin: window.location.origin }
      });
      window.location.href = response.data.data.authUrl;
    } catch (error) {
      setActionError(extractApiError(error, "Drive connection could not start."));
    }
  }

  async function fetchDriveData(options?: { append?: boolean }) {
    if (!activeBusinessId || !connectedDrive) return;
    const append = Boolean(options?.append);
    if (append && (!filesNextPageToken || isFetchingMoreFiles)) return;
    try {
      setFetchError("");
      if (append) { setIsFetchingMoreFiles(true); } else { setIsFetchingData(true); }
      const fileParams = {
        businessId: activeBusinessId,
        folderId: selectedFolderId === "root" ? undefined : selectedFolderId,
        pageToken: append ? filesNextPageToken || undefined : undefined
      };
      if (append) {
        const filesResponse = await api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams });
        const nextBatch = filesResponse.data.data || [];
        setFiles((previous) => {
          const deduped = new Map(previous.map((file) => [file.id, file]));
          for (const file of nextBatch) { if (!deduped.has(file.id)) { deduped.set(file.id, file); } }
          return Array.from(deduped.values());
        });
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
        return;
      }
      if (!hasFetchedData) {
        const [foldersResponse, filesResponse] = await Promise.all([
          api.get("/google-drive/folders", { params: { businessId: activeBusinessId } }),
          api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams })
        ]);
        const folderData = foldersResponse.data.data as { myDrive: DriveFolder[]; sharedWithMe: DriveFolder[] };
        setFolderTree((prev) => ({ ...prev, root: folderData.myDrive ?? [], shared: folderData.sharedWithMe ?? [] }));
        setFiles(filesResponse.data.data || []);
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
      } else {
        const filesResponse = await api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams });
        setFiles(filesResponse.data.data || []);
        setFilesNextPageToken(filesResponse.data.meta?.nextPageToken ?? null);
      }
      setHasFetchedData(true);
      setLastFetchedFolderId(selectedFolderId);
      setLastFetchedFolderName(selectedFolderName);
      setSelectedFileIds([]);
      setLastSelectedIndex(null);
    } catch (error) {
      setFetchError(extractApiError(error, "Drive data could not be fetched for this folder."));
    } finally {
      if (append) { setIsFetchingMoreFiles(false); } else { setIsFetchingData(false); }
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
          const response = await api.get("/google-drive/folders", { params: { businessId: activeBusinessId, parentId: folder.id } });
          setFolderTree((prev) => ({ ...prev, [folder.id]: response.data.data as DriveFolder[] }));
        } catch (error) {
          toast({ tone: "error", title: "Could not load subfolders", description: extractApiError(error, "Please try again.") });
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
      setImportingFileIds((prev) => { const next = new Set(prev); next.add(file.id); return next; });
      const response = await api.post("/media/import-from-drive", {
        businessId: activeBusinessId, driveFileId: file.id, driveFolderId: selectedFolderId,
        folderName: selectedFolderName, originalName: file.name, mimeType: file.mimeType,
        sizeInBytes: Number(file.size || 0), previewUrl: file.previewUrl || undefined,
        driveThumbnailLink: file.thumbnailLink || undefined, driveViewLink: file.webViewLink || undefined
      });
      const alreadyImported = Boolean(response.data?.meta?.alreadyImported);
      toast({
        tone: alreadyImported ? "info" : "success",
        title: alreadyImported ? "File already imported" : "File imported",
        description: alreadyImported ? `${file.name} is already in the content queue.` : `${file.name} was added to the content queue.`
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
        description: isDuplicate ? `${file.name} is already in the content queue.` : message
      });
    } finally {
      setImportingFileIds((prev) => { const next = new Set(prev); next.delete(file.id); return next; });
    }
  }

  async function importSelectedFiles() {
    if (!activeBusinessId || !selectedFileIds.length) return;
    const filesToImport = mediaFiles.filter((f) => selectedFileIds.includes(f.id));
    if (!filesToImport.length) return;
    setImportingFileIds((prev) => { const next = new Set(prev); filesToImport.forEach((f) => next.add(f.id)); return next; });
    let newCount = 0, alreadyCount = 0, failCount = 0;
    await Promise.allSettled(
      filesToImport.map(async (file) => {
        try {
          const response = await api.post("/media/import-from-drive", {
            businessId: activeBusinessId, driveFileId: file.id, driveFolderId: selectedFolderId,
            folderName: selectedFolderName, originalName: file.name, mimeType: file.mimeType,
            sizeInBytes: Number(file.size || 0), previewUrl: file.previewUrl || undefined,
            driveThumbnailLink: file.thumbnailLink || undefined, driveViewLink: file.webViewLink || undefined
          });
          if (response.data?.meta?.alreadyImported) { alreadyCount++; } else { newCount++; }
        } catch (error) {
          const message = extractApiError(error, "File could not be imported.");
          if (/already exists|already imported|duplicate/i.test(message)) { alreadyCount++; } else { failCount++; }
        } finally {
          setImportingFileIds((prev) => { const next = new Set(prev); next.delete(file.id); return next; });
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
        if (isMultiSelect) return Array.from(new Set([...current, ...rangeIds]));
        return rangeIds;
      }
      if (isMultiSelect) {
        if (current.includes(file.id)) return current.filter((id) => id !== file.id);
        return [...current, file.id];
      }
      return [file.id];
    });
    setLastSelectedIndex(index);
  }

  const connStateTone = connectionState === "connected" ? "ok" : connectionState === "disconnected" ? "warn" : "muted";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pipeline"
        title="Drive Browser"
        subtitle="Browse Google Drive and import media into the content queue."
        actions={<Pill tone={connStateTone}>{connectionState.replace("_", " ")}</Pill>}
      />

      {/* OAuth feedback */}
      {oauthFeedback && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-sm"
          style={{
            background: oauthFeedback.tone === "success" ? "var(--ok-soft)" : "var(--err-soft)",
            color: oauthFeedback.tone === "success" ? "var(--ok)" : "var(--err)",
            border: `1px solid ${oauthFeedback.tone === "success" ? "var(--ok)" : "var(--err)"}`,
          }}
        >
          {oauthFeedback.tone === "success" ? <Icons.CircleCheck size={16} /> : <Icons.AlertTriangle size={16} />}
          {oauthFeedback.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Source", value: connectedDrive ? "Google Drive" : "Not Connected", sub: connectedDrive?.accountEmail },
          { label: "Folders", value: connectedDrive && hasFetchedData ? Object.keys(folderTree).length : 0, sub: "Total folders" },
          { label: "Files Found", value: hasFetchedData ? mediaFiles.length : 0, sub: lastFetchedFolderName ? `From ${lastFetchedFolderName}` : "Select a folder" },
          { label: "Imported", value: importedAssets.length, sub: "In Queue" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="section-eyebrow mb-2">{s.label}</p>
            <p className="text-[22px] font-bold leading-none" style={{ color: "var(--ink)" }}>{s.value}</p>
            {s.sub && <p className="text-[11px] mt-1.5 truncate" style={{ color: "var(--muted)" }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* Sidebar */}
        <div className="space-y-4">
          {/* Connect panel */}
          <div className="card p-5">
            <p className="section-eyebrow mb-1">Media Source</p>
            <h3 className="text-[15px] font-bold mb-3" style={{ color: "var(--ink)" }}>Google Drive</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={connectGoogleDrive} className="btn-primary">
                <Icons.Drive size={13} />
                {connectionState === "connected" ? "Reconnect" : "Connect Drive"}
              </button>
              <button onClick={disconnectDrive} disabled={connectionState !== "connected"} className="btn-secondary disabled:opacity-40">
                Disconnect
              </button>
            </div>
            {actionError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--err-soft)" }}>
                <Icons.AlertTriangle size={13} style={{ color: "var(--err)" } as React.CSSProperties} className="mt-0.5 shrink-0" />
                <p className="text-xs" style={{ color: "var(--err)" }}>{actionError}</p>
              </div>
            )}
            {connectedDrive && (
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
                className="btn-secondary w-full justify-center mt-3 disabled:opacity-50"
              >
                {isFetchingData || isFetchingMoreFiles ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Fetching…</>
                ) : (
                  <><Icons.Refresh size={13} /> Refresh Drive</>
                )}
              </button>
            )}
          </div>

          {/* Folders panel */}
          <div className="card p-5">
            <p className="section-eyebrow mb-1">Folders</p>
            <h3 className="text-[15px] font-bold mb-3" style={{ color: "var(--ink)" }}>Explorer</h3>

            {!connectedDrive ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Connect Drive first to load folders.</p>
            ) : !hasFetchedData ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Click Refresh Drive to load the folder tree.</p>
            ) : (
              <div className="space-y-2">
                <input
                  value={folderSearch}
                  onChange={(event) => setFolderSearch(event.target.value)}
                  placeholder="Filter folders"
                  className="input mb-2"
                />
                <p className="section-eyebrow px-1">My Drive</p>
                <button
                  onClick={() => { setSelectedFolderId("root"); setSelectedFolderName("My Drive"); }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
                  style={{
                    background: (selectedFolderId === "root" || !selectedFolderId) ? "var(--accent-soft)" : "transparent",
                    color: (selectedFolderId === "root" || !selectedFolderId) ? "var(--accent)" : "var(--ink-2)",
                  }}
                >
                  <Icons.Folder size={14} />
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
                        onSelect={(f) => { setSelectedFolderId(f.id); setSelectedFolderName(f.name); }}
                      />
                    ))}
                  {(folderTree["root"] || []).length === 0 && (
                    <p className="px-3 py-2 text-xs italic" style={{ color: "var(--muted)" }}>No media folders found.</p>
                  )}
                </div>
                {((folderTree["shared"] || []).length > 0 || hasFetchedData) && (
                  <>
                    <p className="section-eyebrow px-1 mt-3">Shared with me</p>
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
                            onSelect={(f) => { setSelectedFolderId(f.id); setSelectedFolderName(f.name); }}
                          />
                        ))}
                      {(folderTree["shared"] || []).length === 0 && (
                        <p className="px-3 py-2 text-xs italic" style={{ color: "var(--muted)" }}>No shared folders found.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main media panel */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="section-eyebrow mb-1">
                {selectedFolderName ? `Media in ${selectedFolderName}` : "Select a folder"}
              </p>
              <h3 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {hasFetchedData ? `${mediaFiles.length} items` : "Fetch content to see files"}
              </h3>
            </div>
          </div>

          {!connectedDrive ? (
            <DriveEmptyState text="No Drive data — connect your workspace first." />
          ) : isFetchingData ? (
            <LoadingGrid />
          ) : !hasFetchedData ? (
            <DriveEmptyState text="Click Refresh Drive to load image and video files." />
          ) : !mediaFiles.length ? (
            <DriveEmptyState text="No image or video files were found in this folder." />
          ) : (
            <div className="space-y-4">
              {/* Filters toolbar */}
              <div className="flex flex-wrap gap-2">
                <input
                  value={fileSearch}
                  onChange={(event) => setFileSearch(event.target.value)}
                  placeholder="Search files..."
                  className="input flex-1 min-w-[160px]"
                />
                <select
                  value={mediaFilter}
                  onChange={(event) => setMediaFilter(event.target.value as "all" | "image" | "video")}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="all">All media</option>
                  <option value="image">Images only</option>
                  <option value="video">Videos only</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <select
                  value={viewMode}
                  onChange={(event) => setViewMode(event.target.value as MediaViewMode)}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="large">Large</option>
                  <option value="medium">Medium</option>
                  <option value="small">Small</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              {/* Selection bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <p style={{ color: "var(--ink-2)" }}>
                  {selectedFileIds.length} selected · Shift+Click for range, Ctrl/Cmd+Click for multi
                </p>
                <div className="flex items-center gap-3">
                  {selectedFileIds.length > 0 && (
                    <>
                      <button
                        onClick={() => { setSelectedFileIds([]); setLastSelectedIndex(null); }}
                        className="btn-secondary text-xs"
                      >
                        Clear
                      </button>
                      <button
                        onClick={importSelectedFiles}
                        disabled={importingFileIds.size > 0}
                        className="btn-primary text-xs disabled:opacity-60"
                      >
                        {importingFileIds.size > 0 ? "Importing..." : `Import ${selectedFileIds.length} files`}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {fetchError && (
                <div className="rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  {fetchError}
                </div>
              )}

              {/* File grid */}
              {viewMode === "detailed" ? (
                <div className="space-y-2">
                  {mediaFiles.map((file, index) => {
                    const selected = selectedFileIds.includes(file.id);
                    const imported = importedDriveFileIds.has(file.id);
                    return (
                      <article
                        key={file.id}
                        onClick={(event) => toggleFileSelection(file, index, event)}
                        className="grid cursor-pointer gap-3 rounded-[14px] p-3 transition md:grid-cols-[64px_1fr_auto]"
                        style={{
                          background: selected ? "var(--info-soft)" : "var(--bg)",
                          border: `1px solid ${selected ? "var(--info)" : "var(--line)"}`,
                        }}
                      >
                        <div className="h-16 w-16 overflow-hidden rounded-xl" style={{ background: "var(--bg-2)" }}>
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img src={resolveApiAssetUrl(file.previewUrl)} alt={file.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px]" style={{ color: "var(--muted)" }}>
                              {file.mimeType.startsWith("video/") ? "Video" : "No preview"}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium" style={{ color: "var(--ink)" }} title={file.name}>{file.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {file.mimeType.startsWith("video/") ? "Video" : "Image"} · {file.createdTime ? new Date(file.createdTime).toLocaleString() : "—"}
                          </p>
                          {imported && <p className="mt-1 text-xs font-medium" style={{ color: "var(--ok)" }}>Already imported</p>}
                        </div>
                        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                          {file.webViewLink && (
                            <a href={file.webViewLink} target="_blank" rel="noreferrer" className="btn-secondary text-xs">Open</a>
                          )}
                          <button onClick={() => importFile(file)} disabled={importingFileIds.has(file.id)} className="btn-primary text-xs disabled:opacity-60">
                            {importingFileIds.has(file.id) ? "Importing..." : imported ? "Re-import" : "Import"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={`grid ${viewMode === "large" ? "gap-4 sm:grid-cols-2 xl:grid-cols-3" : viewMode === "medium" ? "gap-3 sm:grid-cols-3 xl:grid-cols-4" : "gap-2 sm:grid-cols-4 xl:grid-cols-6"}`}>
                  {mediaFiles.map((file, index) => {
                    const selected = selectedFileIds.includes(file.id);
                    const imported = importedDriveFileIds.has(file.id);
                    return (
                      <article
                        key={file.id}
                        onClick={(event) => toggleFileSelection(file, index, event)}
                        className="cursor-pointer overflow-hidden rounded-[14px] transition"
                        style={{
                          background: "var(--surface)",
                          border: `1px solid ${selected ? "var(--info)" : "var(--line)"}`,
                          outline: selected ? "2px solid var(--info)" : "none",
                          outlineOffset: "2px",
                        }}
                      >
                        <div
                          className="relative"
                          style={{
                            height: viewMode === "large" ? 320 : viewMode === "medium" ? 208 : 128,
                            background: "var(--bg-2)",
                          }}
                        >
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img src={resolveApiAssetUrl(file.previewUrl)} alt={file.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-medium" style={{ color: "var(--muted)" }}>
                              {file.mimeType.startsWith("video/") ? "Video preview" : "No preview"}
                            </div>
                          )}
                          {imported && (
                            <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ok)" }}>
                              Imported
                            </span>
                          )}
                        </div>
                        <div className={`${viewMode === "small" ? "space-y-2 p-2.5" : "space-y-3 p-3.5"} min-w-0`}>
                          <div>
                            <p className={`${viewMode === "small" ? "line-clamp-1 text-sm" : "line-clamp-2"} font-medium break-words`} style={{ color: "var(--ink)" }} title={file.name}>
                              {file.name}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                              {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                            </p>
                            {viewMode !== "small" && (
                              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                                {file.createdTime ? new Date(file.createdTime).toLocaleString() : "—"}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                            {file.webViewLink && (
                              <a href={file.webViewLink} target="_blank" rel="noreferrer" className="btn-secondary flex-1 justify-center text-xs">Open</a>
                            )}
                            <button onClick={() => importFile(file)} disabled={importingFileIds.has(file.id)} className="btn-primary flex-1 justify-center text-xs disabled:opacity-60">
                              {importingFileIds.has(file.id) ? "Importing..." : imported ? "Re-import" : "Import"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {hasMoreFiles && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div ref={loadMoreTriggerRef} className="h-1 w-full" />
                  <button
                    onClick={() => fetchDriveData({ append: true })}
                    disabled={isFetchingData || isFetchingMoreFiles}
                    className="btn-secondary disabled:opacity-50"
                  >
                    {isFetchingMoreFiles ? "Loading more..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DriveEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] border-2 border-dashed p-10 text-center text-sm" style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}>
      {text}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-[18px]" style={{ background: "var(--bg-2)" }} />
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
        className="group flex cursor-pointer items-center gap-1 rounded-xl py-1.5 pr-2 text-sm font-medium transition"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          background: isSelected ? "var(--accent-soft)" : "transparent",
          color: isSelected ? "var(--accent)" : "var(--ink-2)",
        }}
        onClick={() => onSelect(folder)}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg)"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(folder); }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
        >
          {isExpanded ? <Icons.ChevronDown size={10} /> : <Icons.ChevronRight size={10} />}
        </button>
        <Icons.Folder size={13} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate">{folder.name}</p>
        </div>
        {folder.owner && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
            Shared
          </span>
        )}
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
        <div className="py-1 text-xs italic" style={{ paddingLeft: `${depth * 12 + 32}px`, color: "var(--muted)" }}>
          Loading…
        </div>
      )}
    </div>
  );
}
