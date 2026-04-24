import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { ApiError } from "../utils/api-error.js";

const DRIVE_THUMBNAIL_DIR = "drive-thumbnails";
const THUMBNAIL_STALE_MS = 1000 * 60 * 60 * 24;

type CacheableDriveFile = {
  id: string;
  mimeType?: string | null;
  name?: string | null;
  thumbnailLink?: string | null;
};

export type DriveFolderSummary = {
  id: string;
  name: string;
  webViewLink?: string | null;
  containsImages: boolean;
  containsVideos: boolean;
};

export function ensureGoogleDriveConfigured() {
  if (!env.googleConfigured) {
    throw new ApiError(
      400,
      "Google Drive OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env."
    );
  }
}

export function createGoogleOAuthClient() {
  ensureGoogleDriveConfigured();

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

export function signGoogleDriveState(payload: {
  businessId: string;
  userId: string;
  frontendOrigin?: string;
}) {
  return googleStateSign(payload);
}

export function verifyGoogleDriveState(state: string) {
  return googleStateVerify(state) as {
    businessId: string;
    userId: string;
    frontendOrigin?: string;
  };
}

function googleStateSign(payload: {
  businessId: string;
  userId: string;
  frontendOrigin?: string;
}) {
  return jwt.sign(
    { ...payload, purpose: "google_drive_oauth" },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function googleStateVerify(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;

  if ((payload as { purpose?: string }).purpose !== "google_drive_oauth") {
    throw new ApiError(400, "Invalid Google Drive OAuth state");
  }

  return payload;
}

export async function hydrateGoogleDriveToken(connectionId: string) {
  const connection = await GoogleDriveConnectionModel.findById(connectionId);

  if (!connection?.refreshToken) {
    throw new ApiError(400, "No Google Drive refresh token is stored for this business");
  }

  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiryDate?.getTime()
  });

  if (!connection.accessToken || !connection.tokenExpiryDate || connection.tokenExpiryDate <= new Date()) {
    const refreshed = await oauth2Client.refreshAccessToken();
    const credentials = refreshed.credentials;

    connection.accessToken = credentials.access_token ?? connection.accessToken;
    connection.tokenExpiryDate = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : connection.tokenExpiryDate;
    await connection.save();
    oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expiry_date: connection.tokenExpiryDate?.getTime()
    });
  }

  return { oauth2Client, connection };
}

export async function listDriveFolders(connectionId: string, parentFolderId?: string) {
  const { oauth2Client } = await hydrateGoogleDriveToken(connectionId);
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const queryParts = ["mimeType = 'application/vnd.google-apps.folder'", "trashed = false"];
  if (parentFolderId) {
    queryParts.push(`'${parentFolderId}' in parents`);
  } else {
    queryParts.push("'root' in parents");
  }

  const response = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id,name,parents,webViewLink)"
  });

  return response.data.files ?? [];
}

async function listImmediateFolders(
  drive: ReturnType<typeof google.drive>,
  parentFolderId?: string
) {
  const queryParts = ["mimeType = 'application/vnd.google-apps.folder'", "trashed = false"];
  if (parentFolderId) {
    queryParts.push(`'${parentFolderId}' in parents`);
  } else {
    queryParts.push("'root' in parents");
  }

  const response = await drive.files.list({
    q: queryParts.join(" and "),
    orderBy: "name_natural",
    fields: "files(id,name,webViewLink)"
  });

  return response.data.files ?? [];
}

async function listImmediateMedia(
  drive: ReturnType<typeof google.drive>,
  parentFolderId?: string
) {
  const queryParts = [
    "trashed = false",
    "(mimeType contains 'image/' or mimeType contains 'video/')"
  ];

  if (parentFolderId) {
    queryParts.push(`'${parentFolderId}' in parents`);
  } else {
    queryParts.push("'root' in parents");
  }

  const response = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id,mimeType)",
    pageSize: 200
  });

  return response.data.files ?? [];
}

async function getFolderMediaSummary(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  depthRemaining: number
): Promise<{ containsImages: boolean; containsVideos: boolean }> {
  const directMedia = await listImmediateMedia(drive, folderId);
  let containsImages = directMedia.some((file) => file.mimeType?.startsWith("image/"));
  let containsVideos = directMedia.some((file) => file.mimeType?.startsWith("video/"));

  if ((containsImages && containsVideos) || depthRemaining <= 0) {
    return { containsImages, containsVideos };
  }

  const childFolders = await listImmediateFolders(drive, folderId);

  if (!childFolders.length) {
    return { containsImages, containsVideos };
  }

  const childSummaries = await Promise.all(
    childFolders
      .filter((folder): folder is { id: string } => Boolean(folder.id))
      .map((folder) => getFolderMediaSummary(drive, folder.id, depthRemaining - 1))
  );

  for (const summary of childSummaries) {
    containsImages = containsImages || summary.containsImages;
    containsVideos = containsVideos || summary.containsVideos;
  }

  return { containsImages, containsVideos };
}

export async function listRelevantDriveFolders(
  connectionId: string,
  parentFolderId?: string
): Promise<DriveFolderSummary[]> {
  const { oauth2Client } = await hydrateGoogleDriveToken(connectionId);
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const folders = await listImmediateFolders(drive, parentFolderId);

  const summaries = await Promise.all(
    folders
      .filter((folder): folder is { id: string; name?: string | null; webViewLink?: string | null } =>
        Boolean(folder.id)
      )
      .map(async (folder) => {
        const mediaSummary = await getFolderMediaSummary(drive, folder.id, 2);
        return {
          id: folder.id,
          name: folder.name || "Untitled folder",
          webViewLink: folder.webViewLink,
          ...mediaSummary
        };
      })
  );

  return summaries.filter((folder) => folder.containsImages || folder.containsVideos);
}

export async function listDriveFiles(connectionId: string, folderId?: string) {
  const { oauth2Client } = await hydrateGoogleDriveToken(connectionId);
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const queryParts = [
    "trashed = false",
    "(mimeType contains 'image/' or mimeType contains 'video/')"
  ];

  if (folderId) {
    queryParts.push(`'${folderId}' in parents`);
  }

  const response = await drive.files.list({
    q: queryParts.join(" and "),
    orderBy: "createdTime desc,name_natural",
    fields:
      "files(id,name,mimeType,size,parents,thumbnailLink,webViewLink,iconLink,createdTime)"
  });

  return response.data.files ?? [];
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getExtensionFromMimeType(mimeType?: string | null) {
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/quicktime": "mov"
  };

  if (!mimeType) return "jpg";
  return known[mimeType] || mimeType.split("/")[1] || "jpg";
}

function getDriveThumbnailPathParts(businessId: string, fileId: string, mimeType?: string | null) {
  const safeBusinessId = sanitizeSegment(businessId);
  const safeFileId = sanitizeSegment(fileId);
  const extension = getExtensionFromMimeType(mimeType);
  const relativePath = path.join(DRIVE_THUMBNAIL_DIR, safeBusinessId, `${safeFileId}.${extension}`);

  return {
    absolutePath: path.resolve(process.cwd(), env.UPLOAD_DIR, relativePath),
    publicUrl: `/uploads/${relativePath.split(path.sep).join("/")}`
  };
}

async function isCacheFresh(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return Date.now() - stats.mtimeMs < THUMBNAIL_STALE_MS;
  } catch {
    return false;
  }
}

async function fetchDrivePreviewBytes(
  accessToken: string,
  file: CacheableDriveFile
): Promise<Buffer> {
  if (file.thumbnailLink) {
    const thumbnailResponse = await fetch(file.thumbnailLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (thumbnailResponse.ok) {
      const thumbnailBytes = await thumbnailResponse.arrayBuffer();
      return Buffer.from(thumbnailBytes);
    }
  }

  const fileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!fileResponse.ok) {
    throw new ApiError(fileResponse.status, "Google Drive preview could not be loaded");
  }

  const fileBytes = await fileResponse.arrayBuffer();
  return Buffer.from(fileBytes);
}

export async function ensureDriveThumbnailCached(
  connectionId: string,
  businessId: string,
  file: CacheableDriveFile
) {
  if (!file.mimeType?.startsWith("image/")) {
    return undefined;
  }

  const { oauth2Client } = await hydrateGoogleDriveToken(connectionId);
  const accessToken = oauth2Client.credentials.access_token;

  if (!accessToken) {
    throw new ApiError(400, "Google Drive access token is unavailable");
  }

  const { absolutePath, publicUrl } = getDriveThumbnailPathParts(
    businessId,
    file.id,
    file.mimeType
  );

  if (await isCacheFresh(absolutePath)) {
    return publicUrl;
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const previewBuffer = await fetchDrivePreviewBytes(accessToken, file);
  await fs.writeFile(absolutePath, previewBuffer);

  return publicUrl;
}

export async function fetchGoogleProfile(authCode: string) {
  const oauth2Client = createGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(authCode);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const profile = await oauth2.userinfo.get();

  return {
    tokens,
    email: profile.data.email ?? ""
  };
}

export async function fetchDriveFilePreview(connectionId: string, fileId: string) {
  const { oauth2Client } = await hydrateGoogleDriveToken(connectionId);
  const accessToken = oauth2Client.credentials.access_token;

  if (!accessToken) {
    throw new ApiError(400, "Google Drive access token is unavailable");
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new ApiError(response.status, "Google Drive preview could not be loaded");
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    contentType: response.headers.get("content-type") || "application/octet-stream",
    buffer: Buffer.from(arrayBuffer)
  };
}
