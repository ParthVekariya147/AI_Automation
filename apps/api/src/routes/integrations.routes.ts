import { Router } from "express";
import {
  browseDriveFiles,
  browseDriveFolders,
  connectDrive,
  connectInstagramAccount,
  driveOAuthCallback,
  listDriveConnections,
  listInstagramAccounts,
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
  requireBusinessRole("admin", "user", "super_admin"),
  listInstagramAccounts
);
instagramRouter.post(
  "/connect",
  requireBusinessRole("admin", "super_admin"),
  connectInstagramAccount
);

driveRouter.get(
  "/connections",
  requireBusinessRole("admin", "user", "super_admin"),
  listDriveConnections
);
driveRouter.post(
  "/connect",
  requireBusinessRole("admin", "super_admin"),
  connectDrive
);
driveRouter.get(
  "/oauth/start",
  requireBusinessRole("admin", "super_admin"),
  startDriveOAuth
);
driveRouter.get(
  "/folders",
  requireBusinessRole("admin", "user", "super_admin"),
  browseDriveFolders
);
driveRouter.get(
  "/files",
  requireBusinessRole("admin", "user", "super_admin"),
  browseDriveFiles
);
