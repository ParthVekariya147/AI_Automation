import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import type { DriveFile, DriveFolder } from "../lib/types";
import { useAuthStore } from "../store/auth-store";

export function DriveBrowserPage() {
  const queryClient = useQueryClient();
  const activeBusinessId = useAuthStore((state) => state.activeBusinessId);
  const [searchParams] = useSearchParams();
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [selectedFolderName, setSelectedFolderName] = useState<string>("Root");

  const { data: connections } = useQuery({
    queryKey: ["drive-connections", activeBusinessId],
    queryFn: async () =>
      (await api.get("/google-drive/connections", { params: { businessId: activeBusinessId } }))
        .data.data,
    enabled: Boolean(activeBusinessId)
  });

  const oauthReadyConnection = connections?.find(
    (connection: { isOAuthReady?: boolean }) => connection.isOAuthReady
  );

  const { data: folders } = useQuery<DriveFolder[]>({
    queryKey: ["drive-folders", activeBusinessId, selectedFolderId],
    queryFn: async () =>
      (
        await api.get("/google-drive/folders", {
          params: { businessId: activeBusinessId, parentFolderId: selectedFolderId }
        })
      ).data.data,
    enabled: Boolean(activeBusinessId && oauthReadyConnection)
  });

  const {
    data: files,
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
    enabled: Boolean(activeBusinessId && oauthReadyConnection)
  });

  const hasConnection = Boolean(connections?.length);
  const hasOAuthReadyConnection = Boolean(oauthReadyConnection);
  const oauthStatus = searchParams.get("connected");
  const oauthError = searchParams.get("error");
  const oauthFeedback = useMemo(() => {
    if (oauthStatus === "1") {
      return {
        tone: "success" as const,
        text: "Google Drive connected successfully."
      };
    }

    if (oauthStatus === "0") {
      const errorMessages: Record<string, string> = {
        missing_code_or_state: "Google callback was incomplete. Start OAuth again from this page.",
        invalid_state: "Google callback state was invalid or expired. Start OAuth again.",
        access_denied: "Permission was denied on Google consent screen.",
        missing_refresh_token:
          "Google did not return a refresh token. Remove this app from your Google Account permissions, then reconnect.",
        oauth_callback_failed: "Google OAuth completed but account sync failed. Try reconnecting."
      };

      return {
        tone: "error" as const,
        text:
          errorMessages[oauthError || ""] ||
          "Google Drive connection did not complete. Click Connect Google Drive and try again."
      };
    }

    return undefined;
  }, [oauthError, oauthStatus]);

  const mediaFiles = useMemo(
    () =>
      (files || []).filter(
        (file) => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")
      ),
    [files]
  );

  async function connectGoogleDrive() {
    if (!activeBusinessId) return;
    const response = await api.get("/google-drive/oauth/start", {
      params: { businessId: activeBusinessId, frontendOrigin: window.location.origin }
    });
    window.location.href = response.data.data.authUrl;
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
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      {oauthFeedback ? (
        <div
          className={`xl:col-span-2 rounded-2xl px-4 py-3 text-sm ${oauthFeedback.tone === "success"
            ? "bg-emerald-50 text-emerald-900"
            : "bg-red-50 text-red-700"
            }`}
        >
          {oauthFeedback.text}
        </div>
      ) : null}

      <Panel
        title="Google Drive folders"
        description="Browse folders first, then preview and import the images or videos you want to plan from the queue."
      >
        <button
          onClick={connectGoogleDrive}
          className="w-full rounded-2xl bg-[#10332b] px-4 py-3 text-sm font-medium text-white"
        >
          {hasOAuthReadyConnection ? "Reconnect Google Drive" : "Connect Google Drive"}
        </button>

        <div className="mt-4 rounded-2xl bg-[#f6f7f2] px-4 py-3 text-sm text-slate-700">
          {hasOAuthReadyConnection
            ? `${connections.length} Drive connection${connections.length > 1 ? "s" : ""} found`
            : hasConnection
              ? "A Drive record exists, but OAuth is not complete yet. Reconnect from this page."
              : "No Drive connection is active for this business yet"}
        </div>

        <div className="mt-6 space-y-2">
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
          {folders?.map((folder) => (
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
              {folder.name}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title={selectedFolderName === "Root" ? "Drive files" : `Files in ${selectedFolderName}`}
        description="Preview the file before importing it into the scheduling queue."
      >
        {!hasOAuthReadyConnection ? (
          <EmptyDriveState />
        ) : filesError ? (
          <div className="rounded-3xl border border-dashed border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
            {(filesError as Error).message || "Drive files could not be loaded."}
          </div>
        ) : filesLoading ? (
          <LoadingGrid />
        ) : !mediaFiles.length ? (
          <div className="rounded-3xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] p-10 text-center text-sm text-slate-600">
            No image or video files were found in this folder.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mediaFiles.map((file) => (
              <article
                key={file.id}
                className="overflow-hidden rounded-[24px] border border-[#d7ddd4] bg-[#fcfcfa]"
              >
                <div className="aspect-[4/3] bg-[#eef1ea]">
                  {file.mimeType.startsWith("image/") && file.thumbnailLink ? (
                    <img
                      src={file.thumbnailLink}
                      alt={file.name}
                      className="h-full w-full object-cover"
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
                      Import to queue
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function EmptyDriveState() {
  return (
    <div className="rounded-3xl border border-dashed border-[#d7ddd4] bg-[#f7f8f4] p-10 text-center">
      <h4 className="text-lg font-semibold text-slate-900">Connect Drive first</h4>
      <p className="mt-2 text-sm text-slate-600">
        Once connected, this page will show folders and media files so you can preview and import them directly.
      </p>
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
