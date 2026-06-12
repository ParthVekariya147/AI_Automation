# Feature 04 — Google Drive Integration

## Purpose
- Connect a client's Google Drive account via OAuth
- Browse folders and files inside Drive from the Postlane UI
- Import Drive files into the media library for scheduling
- Download Drive files at publish time when needed

---

## API Endpoints

### GET `/api/google-drive/oauth/start`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Generate and return the Google OAuth authorization URL
- **Returns:** `{ url }`

### GET `/api/google-drive/oauth/callback`
- **Auth:** None (Google redirects here without JWT)
- **Query:** `?code=&state=`
- **Purpose:** Exchange OAuth code for tokens; store `refreshToken` in DB
- **Side effects:**
  - Fetches user's Google email via userinfo endpoint
  - Creates a `GoogleDriveConnection` document
- **Redirects to:** Frontend integrations page on success

### GET `/api/google-drive/connections`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** List active Drive connections for a business
- **Returns:** `{ connections[] }`

### POST `/api/google-drive/connect`
- **Auth:** JWT + active membership
- **Purpose:** Manually attach an existing Drive connection
- **Body:** `{ businessId, ... }`

### POST `/api/google-drive/disconnect`
- **Auth:** JWT + active membership
- **Purpose:** Remove a Drive connection (sets `isActive: false`)
- **Body:** `{ businessId, connectionId }`

### GET `/api/google-drive/folders`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** List top-level folders in the connected Drive
- **Returns:** `{ folders[] }`

### GET `/api/google-drive/folders/:id`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** List contents (sub-folders + files) of a specific folder
- **Returns:** `{ items[] }`

### GET `/api/google-drive/files`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&folderId=`
- **Purpose:** List image/video files in a specific folder with metadata and thumbnails
- **Returns:** `{ files[] }`

### GET `/api/google-drive/preview`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&fileId=`
- **Purpose:** Generate a short-lived signed URL to preview a Drive file in-browser
- **Returns:** `{ url }`

---

## Data Model

### GoogleDriveConnection (`googledriveconnections` collection)
- `businessId` → Business
- `email` — Google account email (display only)
- `accessToken` — current short-lived access token
- `refreshToken` — stored permanently; used to renew `accessToken`
- `isActive` — Boolean

---

## Service: `google-drive.service.ts`

| Function | Purpose |
|---|---|
| `getOAuthClient(connectionId)` | Loads connection, refreshes token if expired, returns Google OAuth2 client |
| `listFolders(connectionId)` | Drive API: list folders in root |
| `listFolderContents(connectionId, folderId)` | Drive API: list folder children |
| `listFiles(connectionId, folderId)` | Drive API: list image/video files with metadata |
| `downloadDriveFileForPublish(connectionId, businessId, fileId, mimeType)` | Downloads file to `uploads/drive-cache/`, returns local path |
| `makeFilePublicForPublish(connectionId, fileId)` | Creates `anyone/reader` share permission; returns download URL + permissionId |
| `revokeFilePublicAccess(connectionId, fileId, permissionId)` | Removes the temporary permission after publish |
| `getFileThumbnail(connectionId, fileId)` | Returns cached thumbnail URL |

---

## External API Used

### Google Drive API v3
- **OAuth:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Token Exchange:** `https://oauth2.googleapis.com/token`
- **User Info:** `https://www.googleapis.com/oauth2/v2/userinfo`
- **List Files:** `GET https://www.googleapis.com/drive/v3/files`
  - Query params: `q` (filter), `fields`, `pageToken`
- **Download File:** `GET https://www.googleapis.com/drive/v3/files/:id?alt=media`
- **Create Permission:** `POST https://www.googleapis.com/drive/v3/files/:id/permissions`
- **Delete Permission:** `DELETE https://www.googleapis.com/drive/v3/files/:id/permissions/:permissionId`

### Required Scopes
```
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/userinfo.email
```

---

## Frontend
- **Page:** `IntegrationsPage.tsx` → route `/integrations`
  - Shows connected Drive accounts
  - "Connect Google Drive" triggers OAuth start
  - "Disconnect" per connection

- **Page:** `DriveBrowserPage.tsx` → route `/drive`
  - Folder tree navigation
  - File grid with thumbnails
  - "Import to Queue" button per file or batch

---

## Environment Variables
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — default `http://localhost:4000/api/google-drive/oauth/callback`
- `GOOGLE_DRIVE_SCOPES` — space-separated scope string

---

## Key Rules
- The OAuth callback is **public** — no JWT
- `state` param encodes `businessId` so the callback knows which business to link
- `refreshToken` is stored permanently and used to renew `accessToken` on every service call
- Files are **not downloaded at import time** — only downloaded when publishing (lazy download)
- Drive images are always downloaded locally before publish (for aspect-ratio fitting)
- Drive videos: try to create a public share link first; fall back to local download if permission denied
- Temporary public share permissions are always **revoked** after publish (in `finally` block)
- Deduplication: `(businessId, driveFileId)` compound unique index on `MediaAsset` prevents double-import

---

## Dependencies
- **Auth** (Feature 01) — protects all routes
- **Business** (Feature 02) — connection scoped to `businessId`
- **Media Library** (Feature 05) — import creates `MediaAsset` records
- **Publishing Pipeline** (Feature 10) — `downloadDriveFileForPublish` called at publish time
- **Folder Automations** (Feature 07) — automation reads Drive folders using this service
