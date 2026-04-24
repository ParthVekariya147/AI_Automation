import type { Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { InstagramAccountModel } from "../models/InstagramAccount.js";
import { createAuditLog } from "../services/audit.service.js";
import {
  createGoogleOAuthClient,
  fetchDriveFilePreview,
  fetchGoogleProfile,
  listDriveFiles,
  listDriveFolders,
  signGoogleDriveState,
  verifyGoogleDriveState
} from "../services/google-drive.service.js";
import type { AuthedRequest } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";

function resolveSafeFrontendOrigin(origin?: string) {
  if (!origin) return env.CLIENT_URL;

  const isConfigured = env.corsOrigins.includes(origin);
  const isLocalDevOrigin =
    env.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const isLanDevOrigin =
    env.NODE_ENV !== "production" &&
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
      origin
    );

  return isConfigured || isLocalDevOrigin || isLanDevOrigin ? origin : env.CLIENT_URL;
}

function buildDriveBrowserRedirect(
  frontendOrigin: string | undefined,
  params: Record<string, string>
) {
  const target = new URL("/drive-browser", resolveSafeFrontendOrigin(frontendOrigin));
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

const instagramSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(2),
  handle: z.string().min(2),
  igUserId: z.string().optional(),
  pageId: z.string().optional(),
  accessToken: z.string().optional()
});

const driveSchema = z.object({
  businessId: z.string().min(1),
  accountEmail: z.email(),
  folderId: z.string().optional(),
  refreshToken: z.string().optional()
});

export const listInstagramAccounts = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const businessId = req.query.businessId?.toString();

    if (!businessId) {
      throw new ApiError(400, "businessId is required");
    }

    const accounts = await InstagramAccountModel.find({ businessId, isActive: true }).lean();
    res.json({ success: true, data: accounts });
  }
);

export const connectInstagramAccount = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }

    const payload = instagramSchema.parse(req.body);
    const account = await InstagramAccountModel.create(payload);

    await createAuditLog({
      actorUserId: req.user.id,
      businessId: payload.businessId,
      action: "instagram.connected",
      entityType: "InstagramAccount",
      entityId: account.id
    });

    res.status(201).json({ success: true, data: account });
  }
);

export const listDriveConnections = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const connections = await GoogleDriveConnectionModel.find({ businessId })
    .sort({ updatedAt: -1 })
    .lean();

  res.json({
    success: true,
    data: connections.map((connection) => ({
      _id: connection._id,
      businessId: connection.businessId,
      accountEmail: connection.accountEmail,
      folderId: connection.folderId,
      isActive: connection.isActive,
      isOAuthReady: Boolean(connection.refreshToken)
    }))
  });
});

export const disconnectDrive = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.body.businessId || req.query.businessId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  await GoogleDriveConnectionModel.updateMany(
    { businessId },
    {
      isActive: false,
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiryDate: undefined
    }
  );

  await createAuditLog({
    actorUserId: req.user.id,
    businessId,
    action: "drive.disconnected",
    entityType: "GoogleDriveConnection"
  });

  res.json({
    success: true,
    data: {
      businessId,
      status: "disconnected"
    }
  });
});

export const connectDrive = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = driveSchema.parse(req.body);
  const connection = await GoogleDriveConnectionModel.create({
    ...payload,
    isActive: Boolean(payload.refreshToken)
  });

  await createAuditLog({
    actorUserId: req.user.id,
    businessId: payload.businessId,
    action: "drive.connected",
    entityType: "GoogleDriveConnection",
    entityId: connection.id
  });

  res.status(201).json({
    success: true,
    data: {
      _id: connection._id,
      businessId: connection.businessId,
      accountEmail: connection.accountEmail,
      folderId: connection.folderId,
      isActive: connection.isActive,
      isOAuthReady: Boolean(connection.refreshToken)
    }
  });
});

export const startDriveOAuth = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  const businessId = req.query.businessId?.toString();
  const frontendOrigin = req.query.frontendOrigin?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const oauth2Client = createGoogleOAuthClient();
  const state = signGoogleDriveState({
    businessId,
    userId: req.user.id,
    frontendOrigin
  });
  const scopes = Array.from(
    new Set([
      ...env.googleDriveScopes,
      "https://www.googleapis.com/auth/userinfo.email"
    ])
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: scopes,
    state
  });

  res.json({
    success: true,
    data: {
      authUrl
    }
  });
});

export const driveOAuthCallback = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const code = req.query.code?.toString();
  const state = req.query.state?.toString();
  const oauthError = req.query.error?.toString();

  let parsedState:
    | {
      businessId: string;
      userId: string;
      frontendOrigin?: string;
    }
    | undefined;

  if (state) {
    try {
      parsedState = verifyGoogleDriveState(state);
    } catch {
      return res.redirect(
        buildDriveBrowserRedirect(undefined, {
          connected: "0",
          error: "invalid_state"
        })
      );
    }
  }

  if (oauthError) {
    return res.redirect(
      buildDriveBrowserRedirect(parsedState?.frontendOrigin, {
        connected: "0",
        error: oauthError
      })
    );
  }

  if (!code || !parsedState) {
    return res.redirect(
      buildDriveBrowserRedirect(parsedState?.frontendOrigin, {
        connected: "0",
        error: "missing_code_or_state"
      })
    );
  }

  try {
    const { tokens, email } = await fetchGoogleProfile(code);
    const existingConnection = await GoogleDriveConnectionModel.findOne({
      businessId: parsedState.businessId,
      accountEmail: email
    });
    const refreshToken = tokens.refresh_token ?? existingConnection?.refreshToken;

    if (!refreshToken) {
      return res.redirect(
        buildDriveBrowserRedirect(parsedState.frontendOrigin, {
          connected: "0",
          error: "missing_refresh_token"
        })
      );
    }

    const connection = await GoogleDriveConnectionModel.findOneAndUpdate(
      {
        businessId: parsedState.businessId,
        accountEmail: email
      },
      {
        businessId: parsedState.businessId,
        accountEmail: email,
        accessToken: tokens.access_token,
        refreshToken,
        folderId: existingConnection?.folderId,
        tokenExpiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        isActive: true
      },
      {
        new: true,
        upsert: true
      }
    );

    await createAuditLog({
      actorUserId: parsedState.userId,
      businessId: parsedState.businessId,
      action: "drive.oauth_connected",
      entityType: "GoogleDriveConnection",
      entityId: connection.id,
      metadata: { accountEmail: email }
    });

    return res.redirect(
      buildDriveBrowserRedirect(parsedState.frontendOrigin, {
        connected: "1"
      })
    );
  } catch (error) {
    console.error("Google Drive OAuth callback failed", error);
    return res.redirect(
      buildDriveBrowserRedirect(parsedState.frontendOrigin, {
        connected: "0",
        error: "oauth_callback_failed"
      })
    );
  }
});

export const browseDriveFolders = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();
  const parentFolderId = req.query.parentFolderId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const connection = await GoogleDriveConnectionModel.findOne({
    businessId,
    isActive: true,
    refreshToken: { $exists: true, $ne: null }
  }).sort({ updatedAt: -1 });

  if (!connection) {
    throw new ApiError(
      400,
      "Google Drive is not fully connected for this business. Reconnect from Drive Browser using OAuth."
    );
  }

  const folders = await listDriveFolders(connection.id, parentFolderId);
  res.json({ success: true, data: folders });
});

export const browseDriveFiles = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();
  const folderId = req.query.folderId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  const connection = await GoogleDriveConnectionModel.findOne({
    businessId,
    isActive: true,
    refreshToken: { $exists: true, $ne: null }
  }).sort({ updatedAt: -1 });

  if (!connection) {
    throw new ApiError(
      400,
      "Google Drive is not fully connected for this business. Reconnect from Drive Browser using OAuth."
    );
  }

  const files = await listDriveFiles(connection.id, folderId);
  res.json({ success: true, data: files });
});

export const previewDriveFile = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const businessId = req.query.businessId?.toString();
  const fileId = req.query.fileId?.toString();

  if (!businessId) {
    throw new ApiError(400, "businessId is required");
  }

  if (!fileId) {
    throw new ApiError(400, "fileId is required");
  }

  const connection = await GoogleDriveConnectionModel.findOne({
    businessId,
    isActive: true,
    refreshToken: { $exists: true, $ne: null }
  }).sort({ updatedAt: -1 });

  if (!connection) {
    throw new ApiError(
      400,
      "Google Drive is not fully connected for this business. Reconnect from Drive Browser using OAuth."
    );
  }

  const preview = await fetchDriveFilePreview(connection.id, fileId);
  res.setHeader("Content-Type", preview.contentType);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(preview.buffer);
});
