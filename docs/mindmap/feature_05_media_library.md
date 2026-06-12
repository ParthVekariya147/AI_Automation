# Feature 05 — Media Library

## Purpose
- Central store for all media files (images + videos) belonging to a business
- Accepts files from two sources: local upload and Google Drive import
- Each file is a `MediaAsset` that can be attached to one or more `PostDraft` records
- Tracks workflow state (new → scheduled → posting → live) and caption state (pending → done)

---

## API Endpoints

### GET `/api/media`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&page=&limit=&status=&source=`
- **Purpose:** Paginated list of media assets for a business
- **Returns:** `{ assets[], total, page }`

### POST `/api/media/upload`
- **Auth:** JWT + active membership
- **Purpose:** Upload a local file (image or video)
- **Content-Type:** `multipart/form-data`
- **Body fields:** `file` (binary), `businessId`
- **Side effects:**
  - Saves file to `uploads/` directory
  - Creates `MediaAsset` with `source: "local"`
  - Sets `publicUrl` to `/uploads/<filename>`
- **Returns:** `{ asset }`

### POST `/api/media/import-drive`
- **Auth:** JWT + active membership
- **Purpose:** Import a file from Google Drive into the media library
- **Body:** `{ businessId, driveFileId, folderId, name, mimeType, thumbnailLink, ... }`
- **Side effects:**
  - Creates `MediaAsset` with `source: "google_drive"`
  - Does **not** download the file — stores Drive metadata only
  - Enforces unique index `(businessId, driveFileId)` — duplicate import silently ignored
- **Returns:** `{ asset }`

### DELETE `/api/media/:id`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Delete a media asset record (and local file if applicable)

---

## Data Model

### MediaAsset (`mediaassets` collection)

#### Identity
- `businessId` → Business (indexed)
- `uploadedBy` → User
- `source` — `"local" | "google_drive" | "instagram_direct"`
- `mediaType` — `"image" | "video"`
- `originalName` — original filename
- `mimeType` — e.g. `"image/jpeg"`, `"video/mp4"`
- `sizeInBytes` — Number

#### Storage Paths
- `filePath` — local disk path (local uploads only)
- `publicUrl` — URL served via Express `/uploads` static
- `previewUrl` — thumbnail URL
- `driveFileId` — Google Drive file ID
- `driveFolderId` — Google Drive folder ID
- `driveViewLink` — Drive shareable link
- `driveThumbnailLink` — cached Drive thumbnail URL
- `folderName` — Drive folder display name

#### Processing State
- `status` — `"ready" | "processing" | "failed"` (asset ingestion)
- `workflowStatus` — `"new" | "scheduled" | "posting" | "live" | "error" | "manual_review"` (mirrors PostDraft)
- `captionStatus` — `"pending" | "processing" | "done" | "failed"` (AI caption generation)
- `failedAttempts` — Number
- `failedReason` — String

#### Image Fitting (Sharp)
- `fittedFilePath` — path to aspect-ratio-fitted image
- `fittedPublicUrl` — URL of fitted image
- `fitDimensions` — `{ width, height, wasFitted: Boolean }`

#### Content Planning
- `groupId` — carousel grouping key (shared by assets in same carousel)
- `postType` — `"single" | "carousel" | "video" | "reel"` (auto-inferred)
- `scheduledTime` — Date
- `aiCaption` — Gemini-generated caption
- `hashtags` — String[]

#### Post-Publish
- `automationId` → FolderAutomation
- `igMediaId` — IG post ID after publish
- `likeCount` — Number
- `reachCount` — Number

#### Auto-inference Hook
`pre("validate")` sets `postType` automatically:
- `mediaType = "video"` → `postType = "video"`
- `mediaType = "image"` + `groupId` set → `postType = "carousel"`
- `mediaType = "image"` + no `groupId` → `postType = "single"`
- `postType = "reel"` is never overwritten by the hook

#### Indexes
- `{ businessId: 1 }` — basic list queries
- `{ automationId: 1 }` — automation queries
- `{ businessId: 1, driveFileId: 1 }` — unique sparse index (deduplication)

---

## Frontend
- **Page:** `MediaPage.tsx` → route `/media`
  - Grid view of all assets
  - Upload local files (drag-and-drop via dnd-kit)
  - Filter by source (local / Drive) and status
  - "Add to Queue" action

- **Page:** `DriveBrowserPage.tsx` → route `/drive`
  - Inline import from Drive browser directly into media library

---

## Key Rules
- A `MediaAsset` is **not** downloaded from Drive at import — download happens only at publish time
- `workflowStatus` is kept in sync with its linked `PostDraft.status` by the publish service
- The unique index on `(businessId, driveFileId)` means importing the same Drive file twice silently fails (idempotent)
- `groupId` determines carousel membership — assets with the same `groupId` are published together
- Fitted images are cached: if `fittedFilePath` already exists on disk, Sharp is not re-run

---

## Dependencies
- **Auth** (Feature 01) — all routes protected
- **Business** (Feature 02) — all assets scoped to `businessId`
- **Google Drive** (Feature 04) — `import-drive` stores Drive metadata
- **AI Captions** (Feature 09) — fills `aiCaption` + `hashtags` fields
- **Image Fitting** (Feature 10 / `image-fit.service.ts`) — fills `fittedFilePath` + `fittedPublicUrl`
- **Content Queue** (Feature 06) — `PostDraft.mediaAssetIds` references these records
- **Folder Automations** (Feature 07) — automation creates assets automatically
