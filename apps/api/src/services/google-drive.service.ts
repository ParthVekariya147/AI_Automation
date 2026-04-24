import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { ApiError } from "../utils/api-error.js";

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
    orderBy: "folder,name",
    fields:
      "files(id,name,mimeType,size,parents,thumbnailLink,webViewLink,iconLink,createdTime)"
  });

  return response.data.files ?? [];
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
