import { Router } from "express";
import {
  browseDriveFiles,
  browseDriveFolders,
  connectDrive,
  connectInstagramAccount,
  disconnectDrive,
  driveOAuthCallback,
  listDriveConnections,
  listInstagramAccounts,
  previewDriveFile,
  startDriveOAuth,
  startInstagramOAuth,
  instagramOAuthCallback
} from "../controllers/integrations.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const instagramRouter = Router();
export const driveRouter = Router();

// Google redirects to this URL without our JWT header, so callback must stay public.
driveRouter.get("/oauth/callback", driveOAuthCallback);
// Facebook redirects here, also without JWT header
instagramRouter.get("/oauth/callback", instagramOAuthCallback);

instagramRouter.use(requireAuth);
driveRouter.use(requireAuth);

instagramRouter.get(
  "/accounts",
  requireBusinessRole("admin"),
  listInstagramAccounts
);
instagramRouter.post("/connect", requireBusinessRole("admin"), connectInstagramAccount);
instagramRouter.get("/oauth/start", requireBusinessRole("admin"), startInstagramOAuth);

driveRouter.get(
  "/connections",
  requireBusinessRole("admin"),
  listDriveConnections
);
driveRouter.post("/connect", requireBusinessRole("admin"), connectDrive);
driveRouter.post("/disconnect", requireBusinessRole("admin"), disconnectDrive);
driveRouter.get("/oauth/start", requireBusinessRole("admin"), startDriveOAuth);
driveRouter.get("/preview", requireBusinessRole("admin"), previewDriveFile);
driveRouter.get("/folders", requireBusinessRole("admin"), browseDriveFolders);
driveRouter.get("/files", requireBusinessRole("admin"), browseDriveFiles);
