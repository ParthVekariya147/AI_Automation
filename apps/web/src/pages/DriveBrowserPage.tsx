import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

function gridClass(mode: MediaViewMode): string {
  if (mode === "large")  return "grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  if (mode === "medium") return "grid gap-3 grid-cols-3 md:grid-cols-4 xl:grid-cols-5";
  return "grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6";
}

export function DriveBrowserPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const [viewMode, setViewMode] = useState<MediaViewMode>("small");
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const { data: importedAssets = [] } = useQuery<MediaAsset[]>({
    queryKey: ["media-overview", activeBusinessId],
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

  const connectedDrive = connections.find((c) => c.isActive && c.isOAuthReady);
  const connectionState: "not_connected" | "connected" | "disconnected" = connectedDrive
    ? "connected"
    : connections.length
      ? "disconnected"
      : "not_connected";

  const importedDriveFileIds = useMemo(
    () => new Set(importedAssets.map((a) => a.driveFileId).filter(Boolean)),
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
    const needle = fileSearch.trim().toLowerCase();
    return files
      .filter((f) => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"))
      .filter((f) => {
        if (mediaFilter === "image") return f.mimeType.startsWith("image/");
        if (mediaFilter === "video") return f.mimeType.startsWith("video/");
        return true;
      })
      .filter((f) => (!needle || f.name.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const at = new Date(a.createdTime || 0).getTime();
        const bt = new Date(b.createdTime || 0).getTime();
        return sortOrder === "newest" ? bt - at : at - bt;
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
    setViewMode("small");
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
      if (entries[0]?.isIntersecting) void fetchDriveData({ append: true });
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
        const res = await api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams });
        const next = res.data.data || [];
        setFiles((prev) => {
          const map = new Map(prev.map((f) => [f.id, f]));
          for (const f of next) { if (!map.has(f.id)) map.set(f.id, f); }
          return Array.from(map.values());
        });
        setFilesNextPageToken(res.data.meta?.nextPageToken ?? null);
        return;
      }
      if (!hasFetchedData) {
        const [foldersRes, filesRes] = await Promise.all([
          api.get("/google-drive/folders", { params: { businessId: activeBusinessId } }),
          api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams })
        ]);
        const fd = foldersRes.data.data as { myDrive: DriveFolder[]; sharedWithMe: DriveFolder[] };
        setFolderTree((prev) => ({ ...prev, root: fd.myDrive ?? [], shared: fd.sharedWithMe ?? [] }));
        setFiles(filesRes.data.data || []);
        setFilesNextPageToken(filesRes.data.meta?.nextPageToken ?? null);
      } else {
        const filesRes = await api.get<DriveFilesResponse>("/google-drive/files", { params: fileParams });
        setFiles(filesRes.data.data || []);
        setFilesNextPageToken(filesRes.data.meta?.nextPageToken ?? null);
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
    const next = new Set(expandedFolderIds);
    if (isExpanded) {
      next.delete(folder.id);
    } else {
      next.add(folder.id);
      if (!folderTree[folder.id]) {
        try {
          const res = await api.get("/google-drive/folders", { params: { businessId: activeBusinessId, parentId: folder.id } });
          setFolderTree((prev) => ({ ...prev, [folder.id]: res.data.data as DriveFolder[] }));
        } catch (error) {
          toast({ tone: "error", title: "Could not load subfolders", description: extractApiError(error, "Please try again.") });
        }
      }
    }
    setExpandedFolderIds(next);
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
      setImportingFileIds((prev) => { const s = new Set(prev); s.add(file.id); return s; });
      const response = await api.post("/media/import-from-drive", {
        businessId: activeBusinessId, driveFileId: file.id, driveFolderId: selectedFolderId,
        folderName: selectedFolderName, originalName: file.name, mimeType: file.mimeType,
        sizeInBytes: Number(file.size || 0), previewUrl: file.previewUrl || undefined,
        driveThumbnailLink: file.thumbnailLink || undefined, driveViewLink: file.webViewLink || undefined
      });
      const already = Boolean(response.data?.meta?.alreadyImported);
      toast({
        tone: already ? "info" : "success",
        title: already ? "Already imported" : "File imported",
        description: already ? `${file.name} is already imported.` : `${file.name} was added to the media library.`
      });
      queryClient.invalidateQueries({ queryKey: ["media-overview", activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
      if (!already) navigate("/studio");
    } catch (error) {
      const message = extractApiError(error, "File could not be imported.");
      const isDupe = /already exists|already imported|duplicate/i.test(message);
      toast({
        tone: isDupe ? "info" : "error",
        title: isDupe ? "Already imported" : "Import failed",
        description: isDupe ? `${file.name} is already imported.` : message
      });
    } finally {
      setImportingFileIds((prev) => { const s = new Set(prev); s.delete(file.id); return s; });
    }
  }

  async function importSelectedFiles() {
    if (!activeBusinessId || !selectedFileIds.length) return;
    const toImport = mediaFiles.filter((f) => selectedFileIds.includes(f.id));
    if (!toImport.length) return;
    setImportingFileIds((prev) => { const s = new Set(prev); toImport.forEach((f) => s.add(f.id)); return s; });
    let newCount = 0, alreadyCount = 0, failCount = 0;
    await Promise.allSettled(
      toImport.map(async (file) => {
        try {
          const res = await api.post("/media/import-from-drive", {
            businessId: activeBusinessId, driveFileId: file.id, driveFolderId: selectedFolderId,
            folderName: selectedFolderName, originalName: file.name, mimeType: file.mimeType,
            sizeInBytes: Number(file.size || 0), previewUrl: file.previewUrl || undefined,
            driveThumbnailLink: file.thumbnailLink || undefined, driveViewLink: file.webViewLink || undefined
          });
          if (res.data?.meta?.alreadyImported) { alreadyCount++; } else { newCount++; }
        } catch (error) {
          const msg = extractApiError(error, "File could not be imported.");
          if (/already exists|already imported|duplicate/i.test(msg)) { alreadyCount++; } else { failCount++; }
        } finally {
          setImportingFileIds((prev) => { const s = new Set(prev); s.delete(file.id); return s; });
        }
      })
    );
    toast({
      tone: failCount > 0 ? "error" : "success",
      title: "Bulk import finished",
      description: `Imported ${newCount}. ${alreadyCount > 0 ? `${alreadyCount} already imported. ` : ""}${failCount > 0 ? `Failed: ${failCount}.` : ""}`
    });
    queryClient.invalidateQueries({ queryKey: ["media-overview", activeBusinessId] });
    queryClient.invalidateQueries({ queryKey: ["media", activeBusinessId] });
    setSelectedFileIds([]);
    if (newCount > 0) navigate("/studio");
  }

  useEffect(() => {
    const visible = new Set(mediaFiles.map((f) => f.id));
    setSelectedFileIds((cur) => cur.filter((id) => visible.has(id)));
    setLastSelectedIndex(null);
  }, [mediaFiles]);

  function toggleFileSelection(file: DriveFile, index: number, event: MouseEvent) {
    const range = event.shiftKey && lastSelectedIndex !== null;
    const multi = event.metaKey || event.ctrlKey;
    setSelectedFileIds((cur) => {
      if (range) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const ids = mediaFiles.slice(start, end + 1).map((f) => f.id);
        if (multi) return Array.from(new Set([...cur, ...ids]));
        return ids;
      }
      if (multi) {
        return cur.includes(file.id) ? cur.filter((id) => id !== file.id) : [...cur, file.id];
      }
      return [file.id];
    });
    setLastSelectedIndex(index);
  }

  const connStateTone = connectionState === "connected" ? "ok" : connectionState === "disconnected" ? "warn" : "muted";

  const VIEW_MODES = [
    { mode: "small" as const,    icon: <Icons.Mosaic size={14} />, label: "Small" },
    { mode: "medium" as const,   icon: <Icons.Grid size={14} />,   label: "Medium" },
    { mode: "large" as const,    icon: <Icons.Image size={14} />,  label: "Large" },
    { mode: "detailed" as const, icon: <Icons.List size={14} />,   label: "List" },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <PageHeader
        eyebrow="Pipeline"
        title="Drive Browser"
        subtitle="Browse Google Drive and import media into the media library."
        actions={<Pill tone={connStateTone}>{connectionState.replace("_", " ")}</Pill>}
      />

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
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Source",       value: connectedDrive ? "Google Drive" : "Not Connected", sub: connectedDrive?.accountEmail },
          { label: "Folders",      value: connectedDrive && hasFetchedData ? Object.keys(folderTree).length : 0, sub: "Total folders" },
          { label: "Files Found",  value: hasFetchedData ? mediaFiles.length : 0, sub: lastFetchedFolderName ? `From ${lastFetchedFolderName}` : "Select a folder" },
          { label: "Imported",     value: importedAssets.length, sub: "To Posts" },
        ].map((s) => (
          <div key={s.label} className="card p-3">
            <p className="section-eyebrow mb-1">{s.label}</p>
            <p className="text-[20px] font-bold leading-none" style={{ color: "var(--ink)" }}>{s.value}</p>
            {s.sub && <p className="mt-1 truncate text-[11px]" style={{ color: "var(--muted)" }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Mobile: folder toggle bar */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="btn-secondary shrink-0"
        >
          <Icons.Folder size={13} />
          {sidebarOpen ? "Hide Folders" : "Folders"}
          {sidebarOpen
            ? <Icons.ChevronDown size={12} />
            : <Icons.ChevronRight size={12} />}
        </button>
        {selectedFolderName && (
          <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--ink-2)" }}>
            / {selectedFolderName}
          </span>
        )}
        {connectionState !== "connected" && (
          <button onClick={connectGoogleDrive} className="btn-primary ml-auto shrink-0">
            <Icons.Drive size={13} /> Connect
          </button>
        )}
      </div>

      {/* Layout grid */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">

        {/* ── Sidebar ── */}
        <aside className={`space-y-3 ${sidebarOpen ? "block" : "hidden"} lg:block`}>

          {/* Connect card */}
          <div className="card p-3">
            <p className="section-eyebrow mb-1">Media Source</p>
            <h3 className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink)" }}>Google Drive</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={connectGoogleDrive} className="btn-primary flex-1">
                <Icons.Drive size={13} />
                {connectionState === "connected" ? "Reconnect" : "Connect Drive"}
              </button>
              <button
                onClick={disconnectDrive}
                disabled={connectionState !== "connected"}
                className="btn-secondary disabled:opacity-40"
              >
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
                className="btn-secondary mt-3 w-full justify-center disabled:opacity-50"
              >
                {isFetchingData || isFetchingMoreFiles ? (
                  <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Fetching…</>
                ) : (
                  <><Icons.Refresh size={13} /> Refresh Drive</>
                )}
              </button>
            )}
          </div>

          {/* Folder explorer */}
          <div className="card p-3">
            <p className="section-eyebrow mb-1">Folders</p>
            <h3 className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink)" }}>Explorer</h3>

            {!connectedDrive ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Connect Drive first to load folders.</p>
            ) : !hasFetchedData ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Click Refresh Drive to load the folder tree.</p>
            ) : (
              <div className="space-y-2">
                {/* Folder search */}
                <div className="relative mb-2">
                  <Icons.Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
                  <input
                    value={folderSearch}
                    onChange={(e) => setFolderSearch(e.target.value)}
                    placeholder="Filter folders…"
                    className="input pl-7"
                  />
                </div>

                <p className="section-eyebrow px-1">My Drive</p>
                <button
                  onClick={() => { setSelectedFolderId("root"); setSelectedFolderName("My Drive"); }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
                  style={{
                    background: (selectedFolderId === "root" || !selectedFolderId) ? "var(--accent-soft)" : "transparent",
                    color:      (selectedFolderId === "root" || !selectedFolderId) ? "var(--accent)"      : "var(--ink-2)",
                  }}
                >
                  <Icons.Folder size={14} /> My Drive
                </button>

                <div className="space-y-0.5">
                  {(folderTree["root"] || [])
                    .filter((f) => !folderSearch || f.name.toLowerCase().includes(folderSearch.toLowerCase()))
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
                    <p className="section-eyebrow mt-3 px-1">Shared with me</p>
                    <div className="space-y-0.5">
                      {(folderTree["shared"] || [])
                        .filter((f) => !folderSearch || f.name.toLowerCase().includes(folderSearch.toLowerCase()))
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
        </aside>

        {/* ── Main panel ── */}
        <div className="card min-w-0 p-3 md:p-4">

          {/* Panel header */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="section-eyebrow mb-0.5 truncate">
                {selectedFolderName ? `Media in ${selectedFolderName}` : "Select a folder"}
              </p>
              <h3 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {hasFetchedData ? `${mediaFiles.length} items` : "Fetch content to see files"}
              </h3>
            </div>

            {/* View mode toggle */}
            {hasFetchedData && mediaFiles.length > 0 && (
              <div
                className="flex shrink-0 overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--line)" }}
              >
                {VIEW_MODES.map(({ mode, icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={label}
                    className="flex items-center justify-center px-2.5 py-2 transition"
                    style={{
                      background: viewMode === mode ? "var(--accent)" : "transparent",
                      color:      viewMode === mode ? "white"          : "var(--ink-2)",
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            )}
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
            <div className="space-y-3">

              {/* Filters toolbar */}
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[140px] flex-1">
                  <Icons.Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
                  <input
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    placeholder="Search files…"
                    className="input w-full pl-8"
                  />
                </div>
                <select
                  value={mediaFilter}
                  onChange={(e) => setMediaFilter(e.target.value as "all" | "image" | "video")}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="all">All media</option>
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="input"
                  style={{ width: "auto" }}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>

              {/* Selection bar */}
              <div
                className="flex flex-col gap-2 rounded-[12px] px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <p style={{ color: "var(--ink-2)" }}>
                  {selectedFileIds.length > 0 ? `${selectedFileIds.length} selected` : "0 selected"}
                  {" · "}Shift+Click range · Ctrl/Cmd+Click multi
                </p>
                {selectedFileIds.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
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
                      {importingFileIds.size > 0 ? "Importing…" : `Import ${selectedFileIds.length}`}
                    </button>
                  </div>
                )}
              </div>

              {fetchError && (
                <div className="rounded-[12px] px-4 py-3 text-sm" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  {fetchError}
                </div>
              )}

              {/* ── Detailed list view ── */}
              {viewMode === "detailed" ? (
                <div className="space-y-2">
                  {mediaFiles.map((file, index) => {
                    const selected  = selectedFileIds.includes(file.id);
                    const imported  = importedDriveFileIds.has(file.id);
                    return (
                      <article
                        key={file.id}
                        onClick={(e) => toggleFileSelection(file, index, e)}
                        className="grid cursor-pointer gap-3 rounded-[14px] p-3 transition"
                        style={{
                          gridTemplateColumns: "56px 1fr auto",
                          background: selected ? "var(--info-soft)" : "var(--bg)",
                          border: `1px solid ${selected ? "var(--info)" : "var(--line)"}`,
                        }}
                      >
                        <div className="h-14 w-14 overflow-hidden rounded-xl" style={{ background: "var(--bg-2)" }}>
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img src={resolveApiAssetUrl(file.previewUrl)} alt={file.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center" style={{ color: "var(--muted)" }}>
                              {file.mimeType.startsWith("video/") ? <Icons.Film size={20} /> : <Icons.Image size={20} />}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }} title={file.name}>{file.name}</p>
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {file.mimeType.startsWith("video/") ? "Video" : "Image"}
                            {file.createdTime ? ` · ${new Date(file.createdTime).toLocaleDateString()}` : ""}
                          </p>
                          {imported && <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--ok)" }}>Already imported</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {file.webViewLink && (
                            <a href={file.webViewLink} target="_blank" rel="noreferrer" className="btn-secondary text-xs">Open</a>
                          )}
                          <button
                            onClick={() => importFile(file)}
                            disabled={importingFileIds.has(file.id)}
                            className="btn-primary text-xs disabled:opacity-60"
                          >
                            {importingFileIds.has(file.id) ? "…" : imported ? "Re-import" : "Import"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                /* ── Grid views ── */
                <div className={gridClass(viewMode)}>
                  {mediaFiles.map((file, index) => {
                    const selected = selectedFileIds.includes(file.id);
                    const imported = importedDriveFileIds.has(file.id);
                    const isSmall  = viewMode === "small";

                    return (
                      <article
                        key={file.id}
                        onClick={(e) => toggleFileSelection(file, index, e)}
                        className="cursor-pointer overflow-hidden rounded-[12px] transition"
                        style={{
                          background: "var(--surface)",
                          border: `1.5px solid ${selected ? "var(--info)" : "var(--line)"}`,
                          outline: selected ? "2px solid var(--info)" : "none",
                          outlineOffset: "2px",
                        }}
                      >
                        {/* Thumbnail — always square */}
                        <div className="relative" style={{ aspectRatio: "1", background: "var(--bg-2)" }}>
                          {file.mimeType.startsWith("image/") && file.previewUrl ? (
                            <img
                              src={resolveApiAssetUrl(file.previewUrl)}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center" style={{ color: "var(--muted)" }}>
                              {file.mimeType.startsWith("video/") ? <Icons.Film size={isSmall ? 18 : 28} /> : <Icons.Image size={isSmall ? 18 : 28} />}
                            </div>
                          )}

                          {/* Imported badge */}
                          {imported && (
                            <span
                              className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                              style={{ background: "var(--ok)", color: "white" }}
                            >
                              ✓
                            </span>
                          )}

                          {/* Selected overlay */}
                          {selected && (
                            <div
                              className="absolute inset-0"
                              style={{ background: "rgba(99,102,241,0.18)" }}
                            >
                              <div
                                className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
                                style={{ background: "var(--info)" }}
                              >
                                <Icons.Check size={11} style={{ color: "white" }} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card footer */}
                        <div className={isSmall ? "p-1.5" : "p-2.5 space-y-2"}>
                          {!isSmall && (
                            <p
                              className="line-clamp-1 text-[12px] font-medium"
                              style={{ color: "var(--ink)" }}
                              title={file.name}
                            >
                              {file.name}
                            </p>
                          )}
                          <div
                            className={`flex gap-1.5 ${isSmall ? "" : ""}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!isSmall && file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary flex-1 justify-center py-1 text-[11px]"
                              >
                                Open
                              </a>
                            )}
                            <button
                              onClick={() => importFile(file)}
                              disabled={importingFileIds.has(file.id)}
                              className={`btn-primary ${isSmall ? "w-full" : "flex-1"} justify-center py-1 text-[11px] disabled:opacity-60`}
                            >
                              {importingFileIds.has(file.id)
                                ? "…"
                                : isSmall
                                  ? imported ? "✓" : "+"
                                  : imported ? "Re-import" : "Import"}
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
                    {isFetchingMoreFiles ? "Loading more…" : "Load more"}
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
    <div
      className="rounded-[14px] border-2 border-dashed p-10 text-center text-sm"
      style={{ borderColor: "var(--line-2)", color: "var(--muted)" }}
    >
      {text}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-[12px]"
          style={{ aspectRatio: "1", background: "var(--bg-2)" }}
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
  depth = 0,
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
  const children   = folderTree[folder.id] || [];

  return (
    <div>
      <div
        className="group flex cursor-pointer items-center gap-1 rounded-xl py-1.5 pr-2 text-sm font-medium transition"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          background: isSelected ? "var(--accent-soft)" : "transparent",
          color:      isSelected ? "var(--accent)"      : "var(--ink-2)",
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
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--info-soft)", color: "var(--info)" }}
          >
            Shared
          </span>
        )}
      </div>

      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
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
        <div
          className="py-1 text-xs italic"
          style={{ paddingLeft: `${depth * 12 + 32}px`, color: "var(--muted)" }}
        >
          Loading…
        </div>
      )}
    </div>
  );
}
