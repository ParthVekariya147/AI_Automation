import type { Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { GoogleDriveConnectionModel } from "../models/GoogleDriveConnection.js";
import { InstagramAccountModel } from "../models/InstagramAccount.js";
import { createAuditLog } from "../services/audit.service.js";
import {
  createGoogleOAuthClient,
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
  const isLanDevOrigin =
    env.NODE_ENV !== "production" &&
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
      origin
    );

  return isConfigured || isLanDevOrigin ? origin : env.CLIENT_URL;
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

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly"
    ],
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

  if (!code || !state) {
    throw new ApiError(400, "Google Drive callback is missing code or state");
  }

  const parsedState = verifyGoogleDriveState(state);
  const { tokens, email } = await fetchGoogleProfile(code);
  const existingConnection = await GoogleDriveConnectionModel.findOne({
    businessId: parsedState.businessId,
    accountEmail: email
  });

  const connection = await GoogleDriveConnectionModel.findOneAndUpdate(
    {
      businessId: parsedState.businessId,
      accountEmail: email
    },
    {
      businessId: parsedState.businessId,
      accountEmail: email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existingConnection?.refreshToken,
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

  res.redirect(`${resolveSafeFrontendOrigin(parsedState.frontendOrigin)}/drive-browser?connected=1`);
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
