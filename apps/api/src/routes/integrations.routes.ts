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
  startDriveOAuth
} from "../controllers/integrations.controller.js";
import { requireAuth, requireBusinessRole } from "../middlewares/auth.js";

export const instagramRouter = Router();
export const driveRouter = Router();

// Google redirects to this URL without our JWT header, so callback must stay public.
driveRouter.get("/oauth/callback", driveOAuthCallback);

instagramRouter.use(requireAuth);
driveRouter.use(requireAuth);

instagramRouter.get(
  "/accounts",
  requireBusinessRole("admin"),
  listInstagramAccounts
);
instagramRouter.post("/connect", requireBusinessRole("admin"), connectInstagramAccount);

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
