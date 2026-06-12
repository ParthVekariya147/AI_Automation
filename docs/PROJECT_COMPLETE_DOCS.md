# Postlane — Complete Project Documentation

> Updated: 2026-06-12
> Codebase: `apps/api` (Node.js + Express + MongoDB) · `apps/web` (React + Vite + Tailwind)
> Monorepo root: `/AI_Automation`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Models](#4-data-models)
5. [API Routes Reference](#5-api-routes-reference)
6. [Core Services](#6-core-services)
7. [Frontend Pages](#7-frontend-pages)
8. [Auth & Middleware](#8-auth--middleware)
9. [Environment Variables](#9-environment-variables)
10. [Deployment](#10-deployment)
11. [Scheduler & Automation Engine](#11-scheduler--automation-engine)
12. [AI Caption System (Gemini)](#12-ai-caption-system-gemini)
13. [Instagram Publishing Pipeline](#13-instagram-publishing-pipeline)
14. [Google Drive Integration](#14-google-drive-integration)
15. [Image Fitting (Sharp)](#15-image-fitting-sharp)
16. [Error Handling & Retry Logic](#16-error-handling--retry-logic)
17. [How-To Guides](#17-how-to-guides)

---

## 1. Project Overview

**Postlane** is a self-hosted, multi-tenant Instagram content scheduling and automation platform for agency teams and solo operators.

**Core capabilities:**

- Browse and import media from **Google Drive** or local uploads into a content queue
- Use **Gemini AI** (gemini-2.5-flash) to generate Instagram captions and hashtags from media files
- Manage post drafts with scheduling, hashtags, grouping (carousel), and collaborators
- **Publish directly to Instagram** — single image, carousel, video, reel — via Meta Graph API
- Run **Folder Automations** that watch a Drive folder, auto-generate captions, group files, and schedule posts without manual work
- Background scheduler publishes due posts every 60 seconds
- Fit images to Instagram's allowed aspect ratios using blur-padded backgrounds (Sharp)
- Track basic analytics: like-count and reach snapshots

Every resource belongs to a **Business** workspace. A user may be a member of multiple businesses.

---

## 2. Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 7 (SWC), TypeScript 5.9, Tailwind CSS v3, TanStack Query v5, Zustand v5, React Router v7, dnd-kit, Lucide icons, Axios |
| Backend | Node.js (ESM), Express 4, TypeScript 5.9, Mongoose 8, Zod 4, JWT (jsonwebtoken), Multer, Morgan |
| Database | MongoDB (local Docker or Atlas) |
| AI | Google Gemini API (gemini-2.5-flash) — multi-key pool with automatic rotation |
| External APIs | Meta Graph API v25.0 (Instagram publish), Google Drive API v3 |
| Image Processing | Sharp 0.34 — blur-padded aspect-ratio fitting |
| Tunnelling | Cloudflare Quick Tunnel — exposes local API for Instagram's media fetch |
| Deployment | Docker + Docker Compose (local) · Fly.io · Render · Vercel (cron handler) |

---

## 3. Monorepo Structure

```
AI_Automation/
├── apps/
│   ├── api/                    # Express backend
│   │   └── src/
│   │       ├── app.ts          # Express app setup (CORS, middleware, routes)
│   │       ├── index.ts        # Entry: DB connect, scheduler start, port binding
│   │       ├── types.ts        # Shared TypeScript types (Role, PostStatus, etc.)
│   │       ├── config/
│   │       │   ├── database.ts # Mongoose connection
│   │       │   └── env.ts      # Zod-validated env config
│   │       ├── controllers/    # Route handlers
│   │       ├── middlewares/
│   │       │   ├── auth.ts     # requireAuth, requireBusinessRole
│   │       │   └── error-handler.ts
│   │       ├── models/         # Mongoose schemas
│   │       ├── routes/         # Express routers
│   │       ├── services/       # Business logic (publish, AI, Drive, scheduler…)
│   │       └── utils/          # api-error, async-handler, auth (JWT/bcrypt)
│   └── web/                    # React frontend
│       └── src/
│           ├── main.tsx        # React entry
│           ├── app/            # Root app component, router
│           ├── pages/          # One file per route
│           ├── components/     # Shared UI components
│           ├── store/          # Zustand stores + API client
│           ├── lib/            # Utility helpers
│           └── styles/         # Global CSS
├── packages/
│   ├── config/                 # Shared tsconfig stubs
│   ├── types/                  # Shared TypeScript types (cross-package)
│   └── utils/                  # Shared utility stubs
├── docs/                       # Project documentation
├── docker-compose.yml          # MongoDB for local dev
├── Dockerfile                  # API container
├── fly.toml                    # Fly.io deployment config
├── render.yaml                 # Render deployment config
├── start.sh                    # Dev launcher: tunnel + API + web
├── tunnel.sh                   # Cloudflare tunnel helper
└── package.json                # Monorepo root (npm workspaces)
```

---

## 4. Data Models

All models live in `apps/api/src/models/`. Every model uses Mongoose and includes `timestamps: true` (auto `createdAt`, `updatedAt`).

### 4.1 User

```
Collection: users
File: models/User.ts
```

| Field | Type | Notes |
|---|---|---|
| `name` | String | required, trimmed |
| `email` | String | required, unique, lowercase |
| `passwordHash` | String | bcrypt hash |
| `globalRole` | `"admin"` | only role currently in use |
| `isActive` | Boolean | default `true` |

All users currently share the `"admin"` global role. Role-based access is enforced at the **business membership** level.

### 4.2 Business

```
Collection: businesses
File: models/Business.ts
```

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `slug` | String | unique, lowercase — used as URL segment |
| `timezone` | String | default `"Asia/Kolkata"` |
| `isActive` | Boolean | default `true` |
| `settings.allowDirectInstagramPosting` | Boolean | default `true` |
| `settings.defaultMediaSource` | `"local" \| "google_drive"` | default `"local"` |

### 4.3 Membership

```
Collection: memberships
File: models/Membership.ts
```

Links a User to a Business. Enforces per-business access control.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId → User | |
| `businessId` | ObjectId → Business | |
| `role` | `"admin"` | |
| `status` | `"active" \| "invited" \| "disabled"` | |

### 4.4 InstagramAccount

```
Collection: instagramaccounts
File: models/InstagramAccount.ts
```

One Business can have multiple Instagram accounts.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | indexed |
| `name` | String | display name |
| `handle` | String | Instagram handle |
| `igUserId` | String | Meta IG User ID |
| `pageId` | String | Facebook Page ID |
| `accessToken` | String | long-lived user access token |
| `isActive` | Boolean | |

### 4.5 GoogleDriveConnection

```
Collection: googledriveconnections
File: models/GoogleDriveConnection.ts
```

Stores OAuth tokens for a Google Drive account linked to a Business.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | |
| `email` | String | Google account email |
| `accessToken` | String | current access token |
| `refreshToken` | String | used to renew access |
| `isActive` | Boolean | |

### 4.6 MediaAsset

```
Collection: mediaassets
File: models/MediaAsset.ts
```

Represents one media file — uploaded locally or imported from Drive.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | indexed |
| `uploadedBy` | ObjectId → User | |
| `source` | `"local" \| "google_drive" \| "instagram_direct"` | |
| `mediaType` | `"image" \| "video"` | |
| `originalName` | String | |
| `mimeType` | String | |
| `sizeInBytes` | Number | |
| `filePath` | String | local disk path |
| `publicUrl` | String | URL served by Express `/uploads` |
| `previewUrl` | String | thumbnail URL |
| `driveFileId` | String | Drive file ID |
| `driveFolderId` | String | Drive folder ID |
| `driveThumbnailLink` | String | cached Drive thumbnail |
| `status` | `"ready" \| "processing" \| "failed"` | asset processing state |
| `workflowStatus` | `"new" \| "scheduled" \| "posting" \| "live" \| "error" \| "manual_review"` | mirrors PostDraft status |
| `captionStatus` | `"pending" \| "processing" \| "done" \| "failed"` | AI caption state |
| `groupId` | String | carousel grouping key |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | auto-inferred from mediaType + groupId |
| `scheduledTime` | Date | |
| `aiCaption` | String | generated caption |
| `hashtags` | String[] | |
| `automationId` | ObjectId → FolderAutomation | set when created by automation |
| `fittedFilePath` | String | path to aspect-fitted image |
| `fittedPublicUrl` | String | URL of fitted image |
| `fitDimensions` | `{width, height, wasFitted}` | Sharp output metadata |
| `igMediaId` | String | IG post ID after publish |
| `likeCount` | Number | |
| `reachCount` | Number | |

**Auto-inference hook:** `postType` is set by a `pre("validate")` hook — `"video"` if mediaType is video, `"carousel"` if groupId is set, `"single"` otherwise. Reels must be set explicitly.

**Compound unique index:** `(businessId, driveFileId)` — prevents importing the same Drive file twice.

### 4.7 PostDraft

```
Collection: postdrafts
File: models/PostDraft.ts
```

The central publish unit. One PostDraft → one Instagram post.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | indexed |
| `instagramAccountId` | ObjectId → InstagramAccount | indexed |
| `createdBy` | ObjectId → User | |
| `mediaAssetIds` | ObjectId[] → MediaAsset | ordered list of assets |
| `title` | String | internal label |
| `caption` | String | final caption for publish |
| `hashtags` | String[] | appended to caption on publish |
| `aiCaption` | String | AI-generated draft caption |
| `scheduledFor` | Date | when scheduler should publish |
| `smartTimingSuggestedFor` | Date | AI-suggested time (not enforced) |
| `status` | `"new" \| "scheduled" \| "posting" \| "live" \| "error" \| "manual_review"` | |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | determines publish API call |
| `groupId` | String | links assets in a carousel |
| `collaborators` | String[] | IG handles (without @) |
| `collaboratorStatus` | `{username, status, checkedAt}[]` | fetched after publish |
| `igMediaId` | String | returned by Meta after publish |
| `permalink` | String | instagram.com/p/… |
| `likeCount` | Number | |
| `reachCount` | Number | |
| `automationId` | ObjectId → FolderAutomation | set when created by automation |
| `retryCount` | Number | default 0; max 2 before manual_review |
| `needsManualReview` | Boolean | indexed; set after max retries |
| `lastError` | String | last publish error message |
| `livePostThumbnailUrl` | String | fetched from IG after publish |
| `livePostFetchedAt` | Date | |
| `driveUploadRequested` | Boolean | legacy flag |

### 4.8 FolderAutomation

```
Collection: folderautomations
File: models/FolderAutomation.ts
```

Defines a rule that watches a Drive folder and generates+schedules posts automatically.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | indexed |
| `folderId` | String | Google Drive folder ID |
| `folderName` | String | display name |
| `igAccountId` | ObjectId → InstagramAccount | target account |
| `collaborators` | String[] | IG handles to tag |
| `groupingMode` | `"one_per_file" \| "batch_size" \| "subfolder"` | how to group files into posts |
| `batchSize` | Number | used with `batch_size` grouping |
| `carouselMaxSize` | Number | default 10, max carousel images |
| `cadenceMode` | `"interval" \| "daily_slots" \| "smart"` | scheduling algorithm |
| `intervalValue` | Number | e.g. 5 |
| `intervalUnit` | `"minutes" \| "hours" \| "days"` | |
| `dailySlots` | String[] | e.g. `["09:00","14:00","18:00"]` |
| `captionMode` | `"auto"` | always Gemini for now |
| `brandVoice` | String | prompt injection into Gemini |
| `useEmojis` | Boolean | default `true` |
| `reprocessImported` | Boolean | re-caption already-imported files |
| `status` | `"idle" \| "running" \| "finished" \| "paused" \| "manual_review"` | indexed |
| `priority` | Number | lower = runs first; indexed |
| `lastFetchedAt` | Date | last successful Drive fetch |
| `finishedAt` | Date | |
| `lastRunError` | String | |
| `createdBy` | ObjectId → User | |

**Compound index:** `(businessId, status, priority)` — optimises "find next idle automation."

### 4.9 AutomationRun

```
Collection: automationruns
File: models/AutomationRun.ts
```

Audit trail: one record per execution of a FolderAutomation.

| Field | Type | Notes |
|---|---|---|
| `automationId` | ObjectId → FolderAutomation | |
| `businessId` | ObjectId → Business | |
| `status` | `"success" \| "error" \| "partial"` | |
| `filesFound` | Number | |
| `filesProcessed` | Number | |
| `postsCreated` | Number | |
| `errorMessage` | String | |
| `startedAt` | Date | |
| `finishedAt` | Date | |

### 4.10 PublishJob

```
Collection: publishjobs
File: models/PublishJob.ts
```

Tracks each publish attempt for auditing.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | |
| `postDraftId` | ObjectId → PostDraft | |
| `actorUserId` | ObjectId → User | set for manual publish |
| `status` | `"completed" \| "failed"` | |
| `attempts` | Number | |
| `processedAt` | Date | |

### 4.11 AnalyticsLike

```
Collection: analyticslikes
File: models/AnalyticsLike.ts
```

Snapshot of like counts for published posts.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | |
| `postDraftId` | ObjectId → PostDraft | |
| `igMediaId` | String | |
| `likeCount` | Number | |
| `reachCount` | Number | |
| `snapshotAt` | Date | |

### 4.12 AuditLog

```
Collection: auditlogs
File: models/AuditLog.ts
```

Records significant user actions.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | |
| `userId` | ObjectId → User | |
| `action` | String | e.g. `"publish"`, `"schedule"` |
| `resourceType` | String | e.g. `"PostDraft"` |
| `resourceId` | ObjectId | |
| `metadata` | Mixed | additional context |

---

## 5. API Routes Reference

Base URL: `http://localhost:4000/api`

All routes except bootstrap, login, and OAuth callbacks require `Authorization: Bearer <token>`.

Routes requiring a `businessId` accept it via: URL param → request body → query string. The `requireBusinessRole` middleware validates active membership before passing to the controller.

### 5.1 Health & Scheduler

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Returns `{ success: true }` |
| POST | `/scheduler/run-now` | JWT | Triggers one scheduler tick immediately |
| POST | `/scheduler/cron` | `x-cron-secret` header | External cron endpoint (Vercel, etc.) |

### 5.2 Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/bootstrap` | None | Create the first admin user; disabled after first call |
| POST | `/login` | None | Returns JWT + user + memberships |
| GET | `/me` | JWT | Returns current user + active memberships |

**Bootstrap body:**
```json
{ "name": "string (min 2)", "email": "valid email", "password": "string (min 6)" }
```

**Login body:**
```json
{ "email": "string", "password": "string" }
```

**Login response:**
```json
{
  "success": true,
  "data": {
    "token": "<JWT>",
    "user": { "id", "name", "email", "globalRole" },
    "memberships": [{ "businessId": { "name", "slug", "timezone" }, "role": "admin" }]
  }
}
```

### 5.3 Businesses — `/api/businesses`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List all businesses the user is a member of |
| POST | `/` | JWT | Create a new business |
| GET | `/:businessId` | JWT + business member | Get one business |
| PATCH | `/:businessId` | JWT + business member | Update business settings |
| POST | `/:businessId/members` | JWT + business member | Invite a user to this business |
| GET | `/:businessId/members` | JWT + business member | List members |

### 5.4 Instagram Integration — `/api/instagram`

OAuth callback is public (Meta redirects without a JWT).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/oauth/callback` | None | OAuth callback from Meta — exchanges code for token |
| GET | `/oauth/start` | JWT + biz member | Returns Meta OAuth URL |
| GET | `/accounts` | JWT + biz member | List connected IG accounts for a business |
| POST | `/connect` | JWT + biz member | Manually connect an IG account |
| POST | `/disconnect` | JWT + biz member | Remove an IG account |

### 5.5 Google Drive — `/api/google-drive`

OAuth callback is public (Google redirects without a JWT).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/oauth/callback` | None | Google OAuth callback — stores refresh token |
| GET | `/oauth/start` | JWT + biz member | Returns Google OAuth URL |
| GET | `/connections` | JWT + biz member | List Drive connections for a business |
| POST | `/connect` | JWT + biz member | Manually connect Drive |
| POST | `/disconnect` | JWT + biz member | Remove Drive connection |
| GET | `/folders` | JWT + biz member | Browse top-level Drive folders |
| GET | `/folders/:id` | JWT + biz member | Browse a specific folder |
| GET | `/files` | JWT + biz member | List files in a folder (`?folderId=`) |
| GET | `/preview` | JWT + biz member | Get a signed preview URL for a Drive file |

### 5.6 Media — `/api/media`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT + biz member | List media assets (`?businessId=`) |
| POST | `/upload` | JWT + biz member | Upload local file (multipart/form-data) |
| POST | `/import-drive` | JWT + biz member | Import file from Drive into media library |
| DELETE | `/:id` | JWT + biz member | Delete a media asset |

### 5.7 Posts — `/api/posts`

All routes require `?businessId=` query param or body field.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT + biz member | List post drafts with pagination |
| POST | `/` | JWT + biz member | Create a post draft |
| PATCH | `/:id` | JWT + biz member | Update caption, schedule time, status, etc. |
| DELETE | `/:id` | JWT + biz member | Delete a post draft |
| POST | `/:id/schedule` | JWT + biz member | Set `scheduledFor` and status → `"scheduled"` |
| POST | `/:id/publish` | JWT + biz member | Publish immediately (bypasses scheduler) |
| POST | `/:id/approve-schedule` | JWT + biz member | Approve manual_review draft and reschedule |
| POST | `/:id/suggest-hashtags` | JWT + biz member | Ask Gemini for hashtag suggestions |
| GET | `/:id/collaborators` | JWT + biz member | Fetch collaborator accept/decline status from IG |

### 5.8 Folder Automations — `/api/automations`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List automations (`?businessId=`) |
| POST | `/` | JWT | Create an automation |
| POST | `/preview` | JWT | Preview what an automation config would import |
| GET | `/next-priority` | JWT | Get suggested priority value for new automation |
| PATCH | `/:id` | JWT | Update automation config |
| DELETE | `/:id` | JWT | Delete an automation |
| POST | `/:id/fetch` | JWT | Trigger automation run immediately |
| POST | `/:id/pause` | JWT | Pause a running/idle automation |
| POST | `/:id/resume` | JWT | Resume a paused automation |
| GET | `/:id/runs` | JWT | List run history for an automation |

### 5.9 Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT + biz member | List like-count snapshots |
| POST | `/snapshot` | JWT + biz member | Trigger a like-count fetch from IG |

### 5.10 Reports — `/api/reports`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT + biz member | Generate a content performance report |

---

## 6. Core Services

All services live in `apps/api/src/services/`.

### 6.1 `scheduler.service.ts`

The heartbeat of the system. Starts on API boot and runs every **60 seconds**.

Each tick calls `runNow()` which runs two tasks in parallel:

1. **`publishDuePosts()`** — queries `PostDraft` for documents where `status = "scheduled"` and `scheduledFor <= now`. Publishes in batches of 3 using `Promise.allSettled` (one failure doesn't block others).

2. **`runPendingAutomations()`** — queries `FolderAutomation` for `status = "idle"`, ordered by `priority ASC`. Runs at most one automation per tick to avoid overwhelming resources.

`runNow()` is also exposed as `POST /api/scheduler/run-now` (requires JWT) and `POST /api/scheduler/cron` (requires `x-cron-secret` header) for external triggers.

### 6.2 `publish.service.ts`

The publish pipeline. Called by the scheduler and by manual publish requests.

**Flow for `publishDraftById(draftId)`:**

1. Load `PostDraft` + `InstagramAccount` + `MediaAsset[]` from DB
2. Set draft `status = "posting"`
3. For each media asset, `resolvePublishUrl()`:
   - **Drive images**: download locally → apply image fitting → serve via tunnel URL
   - **Drive videos**: try to make public (share link) → fall back to tunnel download
   - **Local assets**: apply image fitting → serve via `PUBLIC_API_URL`
4. Call the appropriate IG API function based on `postType`:
   - `single` → `postSingleMedia()`
   - `carousel` → `postCarouselMedia()`
   - `video` → `postVideoMedia()`
   - `reel` → `postReelsMedia()`
5. On success: set status → `"live"`, store `igMediaId` + `permalink`, update linked `MediaAsset` records to `workflowStatus: "live"`, fire-and-forget thumbnail fetch
6. On failure:
   - `retryCount < 2`: reschedule +5 minutes, keep `status = "scheduled"`
   - `retryCount >= 2`: set `status = "error"`, `needsManualReview = true`; if automation-linked, pause the automation
7. Revoke any temporary Drive share permissions (in `finally`)
8. Write a `PublishJob` audit record

### 6.3 `folder-automation.service.ts`

Executes a FolderAutomation:

1. Fetch files from the Drive folder (skips already-imported unless `reprocessImported = true`)
2. Group files into posts based on `groupingMode`
3. Generate AI captions for each group via `ai.service.ts`
4. Create `MediaAsset` + `PostDraft` records
5. Assign `scheduledFor` based on `cadenceMode`
6. Update automation `status` and `lastFetchedAt`

### 6.4 `ai.service.ts`

Wraps the Gemini API with multi-key rotation:

- **`ApiKeyManager`** — holds all keys found in env vars matching `GEMINI_API_KEY*`. Rotates on rate-limit (429/503/RESOURCE_EXHAUSTED), cooling down the failed key for 60 seconds before trying the next.
- **`generateInstagramCaptionFromMedia()`** — single image/video → caption + hashtags. Uses `gemini-2.5-flash` with `temperature: 0.8`.
- **`generateCaptionForCarousel()`** — up to 8 images sent inline → cohesive carousel caption. Falls back to single-image on first slide if carousel parse fails.
- **`suggestHashtagsWithAI()`** — caption text in → 15–20 targeted hashtags out. Falls back to keyword extraction if AI unavailable.
- **`extractCaptionResult()`** — three-pass parser that handles markdown fences, leading prose, truncated JSON, and partial responses from Gemini.

Model: `gemini-2.5-flash` via `https://generativelanguage.googleapis.com/v1beta/models/…`

### 6.5 `instagram.service.ts`

Wraps Meta Graph API calls:

- `postSingleMedia(igUserId, accessToken, imageUrl, caption, collaborators?)` — create + publish container
- `postCarouselMedia(...)` — create child containers → carousel container → publish
- `postVideoMedia(...)` — async video upload → poll for ready → publish
- `postReelsMedia(...)` — same as video but uses Reels media type
- `fetchCollaboratorStatus(igMediaId, accessToken)` — get accept/decline for each tagged collaborator
- `sanitizeCollaborators(handles)` — strip `@` prefix, filter empty

### 6.6 `google-drive.service.ts`

Wraps Google Drive API v3:

- OAuth token refresh via stored `refreshToken`
- File listing with pagination
- Thumbnail URL caching
- `downloadDriveFileForPublish()` — downloads file to local `uploads/drive-cache/`
- `makeFilePublicForPublish()` — creates an `anyone/reader` share permission; returns download URL
- `revokeFilePublicAccess()` — removes the temporary permission after publish

### 6.7 `image-fit.service.ts`

Uses Sharp to fit images to Instagram's 4:5 portrait ratio (1080×1350):

- Resizes the image to fit within the target canvas
- Fills the remaining area with a blurred, stretched version of the original as background
- Outputs JPEG to `uploads/fitted-cache/<businessId>/<assetId>.jpg`
- Stores `fittedFilePath`, `fittedPublicUrl`, `fitDimensions` on the `MediaAsset`

### 6.8 `smart-timing.service.ts`

Suggests optimal publish times based on historical engagement patterns. Currently advisory (stored as `smartTimingSuggestedFor`); the user can accept or set their own time.

### 6.9 `audit.service.ts`

Writes `AuditLog` records for publish, schedule, and other significant actions.

---

## 7. Frontend Pages

All pages are in `apps/web/src/pages/`.

| Page file | Route | Purpose |
|---|---|---|
| `LoginPage.tsx` | `/login` | Email/password login |
| `SetupPage.tsx` | `/setup` | First-run: bootstrap admin creation |
| `DashboardPage.tsx` | `/` | Overview metrics and recent posts |
| `BusinessesPage.tsx` | `/businesses` | List/manage business workspaces |
| `IntegrationsPage.tsx` | `/integrations` | Connect Instagram + Google Drive |
| `DriveBrowserPage.tsx` | `/drive` | Browse Drive folders, import to queue |
| `MediaPage.tsx` | `/media` | Local upload + media asset library |
| `PostsPage.tsx` | `/posts` | Content queue: list, filter, schedule drafts |
| `StudioPage.tsx` | `/studio/:id` | Per-post editor: caption, hashtags, schedule, publish |
| `AutomationsPage.tsx` | `/automations` | Create/manage Folder Automations |
| `AnalyticsPage.tsx` | `/analytics` | Like-count and reach snapshots |

**State management:** Zustand store in `store/auth-store.ts` holds `user`, `token`, and active `businessId`. TanStack Query handles all API caching, background refetches, and mutation state.

**API client:** `store/api.ts` — Axios instance with JWT interceptor from store.

---

## 8. Auth & Middleware

### JWT Authentication

Tokens are signed with `JWT_SECRET`, expire per `JWT_EXPIRES_IN` (default `7d`). The payload contains `{ sub: userId, email, globalRole }`.

Tokens are sent as `Authorization: Bearer <token>` headers by the frontend.

### `requireAuth` middleware

Extracts Bearer token from `Authorization` header → verifies with `verifyToken()` → attaches `req.user`. Returns `401` if missing or invalid.

### `requireBusinessRole(...roles)` middleware

1. Extracts `businessId` from `req.params.businessId || req.body.businessId || req.query.businessId`
2. Queries `Membership` for `(businessId, userId, status: "active")`
3. Returns `403` if no active membership
4. Attaches `req.businessId` and `req.membershipRole` for downstream use

All roles currently normalize to `"admin"` — the system was designed for future role expansion.

### Error handling

`utils/api-error.ts` — `ApiError(statusCode, message)` class. The `errorHandler` middleware in `middlewares/error-handler.ts` catches these and returns `{ success: false, message }` JSON.

`utils/async-handler.ts` — wraps async route handlers to automatically pass errors to `next()`.

---

## 9. Environment Variables

Validated via Zod on startup (`apps/api/src/config/env.ts`). The server exits with an error log if any required variable is missing or malformed.

### Required

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string (e.g. `mongodb://localhost:27017/postlane`) |
| `JWT_SECRET` | Min 12 chars — signs all JWT tokens |

### Optional with defaults

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API listen port |
| `NODE_ENV` | `development` | `development \| test \| production` |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime |
| `CLIENT_URL` | `http://localhost:5173` | Frontend origin (used in CORS + OAuth callbacks) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed CORS origins |
| `UPLOAD_DIR` | `uploads` | Local file storage directory (relative to `apps/api/`) |
| `FACEBOOK_GRAPH_API_VERSION` | `v25.0` | Meta Graph API version |
| `FACEBOOK_SCOPES` | `instagram_basic,instagram_content_publish,…` | IG OAuth scopes |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/api/google-drive/oauth/callback` | |
| `FACEBOOK_REDIRECT_URI` | `http://localhost:4000/api/instagram/oauth/callback` | |

### Feature keys

| Variable | Description |
|---|---|
| `PUBLIC_API_URL` | **Required for Instagram publishing.** HTTPS URL reachable from Meta servers (Cloudflare tunnel URL or production domain). |
| `GEMINI_API_KEY` | Primary Gemini API key for AI captions |
| `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, … | Additional keys for parallel automation runs. Any env var matching `GEMINI_API_KEY*` is loaded. |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `FACEBOOK_APP_ID` | Meta app ID |
| `FACEBOOK_APP_SECRET` | Meta app secret |
| `SCHEDULER_SECRET` | If set, the `/api/scheduler/cron` endpoint requires `x-cron-secret: <value>` |

### Frontend (`apps/web/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` | API base URL. If blank, auto-targets `window.location.host:4000`. |

---

## 10. Deployment

### Local (Docker + Cloudflare Tunnel)

```bash
npm install
docker compose up -d        # start MongoDB on port 27017
./start.sh                  # start tunnel + API + web
```

`start.sh` workflow:
1. Starts a Cloudflare Quick Tunnel → `localhost:4000`
2. Captures the generated `*.trycloudflare.com` URL
3. Writes it to `apps/api/.env` as `PUBLIC_API_URL`
4. Starts API (`npm run dev:api`) and web (`npm run dev:web`) via concurrently

The tunnel URL changes on every restart; `start.sh` updates `.env` automatically.

Frontend: `http://localhost:5173`
API: `http://localhost:4000`

### Docker Container

```dockerfile
# Dockerfile builds the API only
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build --workspace api
CMD ["node", "apps/api/dist/index.js"]
```

### Fly.io

```bash
fly launch    # uses fly.toml
fly deploy
```

Set secrets: `fly secrets set MONGODB_URI=… JWT_SECRET=… GEMINI_API_KEY=…`

### Render

`render.yaml` defines a web service. Set all env vars in the Render dashboard.

### Vercel (Cron Only)

`vercel.json` configures the `/api/scheduler/cron` endpoint as a Vercel Cron Job. The API itself should be hosted elsewhere (Fly/Render/self-hosted); Vercel just triggers the scheduler endpoint on a schedule.

Set `SCHEDULER_SECRET` in both the API host and Vercel env, and configure the cron to send `x-cron-secret: <value>`.

---

## 11. Scheduler & Automation Engine

### Scheduler Tick (every 60 seconds)

```
startScheduler()
  └─ setInterval(runNow, 60000)
       ├─ publishDuePosts()        → finds scheduled drafts past their time
       │    └─ publishDraftById()  → up to 3 concurrent publishes per tick
       └─ runPendingAutomations()  → runs highest-priority idle automation
            └─ runAutomation()     → fire-and-forget (sets status "running")
```

### Automation Execution Flow

```
runAutomation(id)
  1. Set status = "running"
  2. Fetch Drive folder file list
  3. Filter: skip already-imported (driveFileId unique index)
  4. Group files by groupingMode:
       "one_per_file"  → each file = one post
       "batch_size"    → N files per carousel
       "subfolder"     → files in same sub-folder = one carousel
  5. For each group:
       a. Download/read media
       b. Generate caption via Gemini (with key rotation)
       c. Create MediaAsset records
       d. Create PostDraft with scheduledFor based on cadenceMode:
            "interval"    → now + (intervalValue * intervalUnit)
            "daily_slots" → next upcoming slot time today or tomorrow
            "smart"       → smart-timing service suggestion
  6. Set status = "idle" (or "finished" if folder fully processed)
  7. Write AutomationRun audit record
```

### Priority System

Automations have a `priority` field (lower = runs first). The scheduler picks the highest-priority idle automation per tick. `GET /api/automations/next-priority` returns `max(existing priority) + 10` as a suggested value for new automations.

### Manual Review Escalation

When a PostDraft fails after 2 retry attempts:
- Draft status → `"error"`, `needsManualReview = true`
- If automation-linked → automation status → `"manual_review"` (stops the automation)
- User can review in Studio, fix the issue, then call `POST /:id/approve-schedule` to reschedule

---

## 12. AI Caption System (Gemini)

### Key Pool Architecture

All env vars starting with `GEMINI_API_KEY` are collected at startup into an `ApiKeyManager`. This enables parallel automation runs to use different keys.

Rotation logic:
- On `429 / 503 / RESOURCE_EXHAUSTED`: mark current key as on 60-second cooldown, rotate to next
- On `400 / API_KEY_INVALID`: mark with 30-second cooldown, rotate
- On network/parse errors: throw immediately (no retry)
- If all keys are on cooldown: throw `"All Gemini API keys are rate-limited"`

### Caption Generation

**Single image/video** (`generateInstagramCaptionFromMedia`):
- Sends media as base64 inline data
- Prompt: 3–5 line caption with emojis, 20 targeted hashtags in specified tone
- Model: `gemini-2.5-flash`, `temperature: 0.8`, `maxOutputTokens: 2048`

**Carousel** (`generateCaptionForCarousel`):
- Sends up to 8 images (skips any >10MB)
- Prompt: cohesive multi-slide narrative, 25 hashtags
- Falls back to single-image on first slide if carousel JSON parse fails

**Hashtag suggestions** (`suggestHashtagsWithAI`):
- Caption text only (no media)
- Returns 15–20 hashtags
- Falls back to keyword extraction from caption text if AI unavailable

### Response Parsing

Three-pass extraction handles malformed Gemini output:
1. Strip markdown code fences → JSON parse
2. Find first `{` to last `}` → JSON parse
3. Regex extract `"caption": "..."` + `"hashtags": [...]`

---

## 13. Instagram Publishing Pipeline

### Prerequisites

- `PUBLIC_API_URL` must be an HTTPS URL (Cloudflare tunnel or production domain)
- Instagram account must have `igUserId` and `accessToken` set (via OAuth flow)
- At least one `MediaAsset` linked to the draft

### Publish Flow

```
POST /api/posts/:id/publish
  └─ publishDraftById(id)
       ├─ Load draft, account, assets
       ├─ draft.status = "posting"
       ├─ resolvePublishUrl() for each asset:
       │    Drive image  → download → fit → tunnel URL
       │    Drive video  → try public share → fall back to download
       │    Local image  → fit → tunnel URL
       │    Local video  → tunnel URL
       ├─ Call IG API:
       │    postType="single"   → create image container → publish
       │    postType="carousel" → create N child containers → carousel container → publish
       │    postType="video"    → create video container → poll 15s until FINISHED → publish
       │    postType="reel"     → same as video, REELS media product type
       ├─ draft.status = "live", store igMediaId + permalink
       ├─ Update MediaAsset.workflowStatus = "live"
       ├─ Fetch + store collaborator status (non-blocking)
       ├─ Fire-and-forget: fetch IG thumbnail
       └─ Revoke temp Drive permissions (always, in finally)
```

### Error & Retry

| Attempt | Outcome |
|---|---|
| 1st failure | `retryCount = 1`, reschedule in +5 minutes, status stays `"scheduled"` |
| 2nd failure | `retryCount = 2`, status → `"error"`, `needsManualReview = true` |

If the draft was created by an automation, the automation also gets paused (`status = "manual_review"`) so it does not keep spawning drafts for the same broken account.

---

## 14. Google Drive Integration

### OAuth Flow

1. Frontend calls `GET /api/google-drive/oauth/start?businessId=…`
2. Backend returns Google OAuth URL with `drive.file` + `drive.metadata.readonly` scopes
3. User completes consent → Google redirects to `GET /api/google-drive/oauth/callback?code=…`
4. Backend exchanges code for tokens, stores `refreshToken` in `GoogleDriveConnection`

### File Browsing

- `GET /api/google-drive/folders` — top-level folders
- `GET /api/google-drive/folders/:id` — folder contents
- `GET /api/google-drive/files?folderId=…` — file list with metadata + thumbnail URLs
- `GET /api/google-drive/preview?fileId=…` — signed short-lived URL for file preview

### Import

`POST /api/media/import-drive` creates a `MediaAsset` record linked to a Drive file. The file is not downloaded at import time — only when publishing.

### Deduplication

The compound unique index `(businessId, driveFileId)` on `MediaAsset` prevents the same Drive file being imported twice into the same business.

---

## 15. Image Fitting (Sharp)

Instagram enforces an aspect ratio range of 4:5 (portrait) to 1.91:1 (landscape). Images outside this range are rejected.

The fitting service (`image-fit.service.ts`) handles this automatically:

1. Read original image dimensions
2. If within allowed ratio: pass through unchanged
3. If outside: composite the image centered on a 1080×1350 (4:5) canvas, with the original blurred and stretched as background fill
4. Output: JPEG at 95% quality
5. Cache stored at `uploads/fitted-cache/<businessId>/<assetId>.jpg`
6. Cache is checked before re-fitting: if `fittedFilePath` exists and file is present, skip re-fit

The fitted URL is served publicly via Express static middleware at `/uploads/…` and used as the media URL in the Meta API call.

---

## 16. Error Handling & Retry Logic

### API Errors

`ApiError(statusCode, message)` — thrown in controllers/services. The global `errorHandler` middleware formats these as:

```json
{ "success": false, "message": "Error description" }
```

Zod validation failures are caught in controllers and return `400` with field-level detail.

### Publish Retry

See section 13. Retry is automatic (scheduler re-picks drafts with `status = "scheduled"` and past `scheduledFor`).

### Gemini Key Rotation

See section 12. Failed keys cool down rather than being discarded, so they recover automatically.

### Scheduler Isolation

Each scheduler tick uses `Promise.allSettled` so a single publish failure does not prevent other drafts from publishing in the same tick.

---

## 17. How-To Guides

### Bootstrap a fresh install

1. Run `npm install && docker compose up -d && ./start.sh`
2. In another tab: `curl -X POST http://localhost:4000/api/auth/bootstrap -H "Content-Type: application/json" -d '{"name":"Admin","email":"you@example.com","password":"yourpassword"}'`
3. Open `http://localhost:5173` and log in

Bootstrap is disabled after the first user is created.

### Connect Instagram

1. Log in → go to **Integrations**
2. Click **Connect Instagram** → complete Meta OAuth
3. Instagram account appears in the Integrations page
4. All future post drafts can target this account

### Connect Google Drive

1. Log in → go to **Integrations**
2. Click **Connect Google Drive** → complete Google OAuth
3. Go to **Drive Browser** to browse folders and import media

### Manually publish a post

1. Go to **Content Queue** → select a draft
2. Open in **Studio** (edit caption, hashtags, add collaborators)
3. Click **Publish Now** — or set a date/time and click **Schedule**
4. Scheduled posts publish automatically within 60 seconds of their scheduled time

### Create a Folder Automation

1. Go to **Automations** → **New Automation**
2. Pick a Drive folder
3. Choose: target IG account, grouping mode, cadence, brand voice, emoji setting
4. Save → automation runs on the next scheduler tick if there are unprocessed files

### Manually trigger the scheduler

```bash
curl -X POST http://localhost:4000/api/scheduler/run-now \
  -H "Authorization: Bearer <token>"
```

Or with the cron secret (no JWT needed):

```bash
curl -X POST http://localhost:4000/api/scheduler/cron \
  -H "x-cron-secret: <SCHEDULER_SECRET>"
```

### Add multiple Gemini API keys

Add to `apps/api/.env`:
```
GEMINI_API_KEY=key1
GEMINI_API_KEY_2=key2
GEMINI_API_KEY_3=key3
```

The AI service loads all of them automatically. When one is rate-limited the system rotates to the next without delay.

### Handle a manual_review post

1. A post in `manual_review` state means it failed twice during publish
2. Open the draft in Studio
3. Check `lastError` (shown in UI) — fix the underlying issue (reconnect IG, check tunnel URL, etc.)
4. Click **Approve & Reschedule** to queue it again

---

*Documentation generated from source: `apps/api/src/` (controllers, models, services, routes, middlewares, config) + `apps/web/src/` (pages, store).*
