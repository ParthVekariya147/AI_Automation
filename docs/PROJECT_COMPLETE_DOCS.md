# Postlane — Complete Project Documentation

> Updated: 2026-05-12
> Codebase: `/Users/yashmadhavtech/Documents/AI_Automation`
> Stack: Node.js + Express + MongoDB (API) · React + Vite + Tailwind (Web)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Models](#4-data-models)
5. [Frontend Pages](#5-frontend-pages)
6. [Backend Services](#6-backend-services)
7. [API Routes Summary](#7-api-routes-summary)
8. [Auth & Session System](#8-auth--session-system)
9. [State Management](#9-state-management)
10. [Environment Variables](#10-environment-variables)
11. [Known Bugs](#11-known-bugs)
12. [Improvement Opportunities](#12-improvement-opportunities)
13. [Recommended Next Features](#13-recommended-next-features)

---

## 1. Project Overview

**Postlane** (working name: Instagram Automation Suite) is a self-hosted social media management platform for agency teams and solo operators to:

- Browse and import media from **Google Drive** into a content queue
- Use **Gemini AI** to generate Instagram captions and hashtags from media files
- Manage post drafts with scheduling, hashtags, and collaborators
- **Publish directly to Instagram** (single, carousel, video, reel) via Meta Graph API
- Run **Folder Automations** that watch a Drive folder, auto-generate captions, group files, and schedule posts — all without manual work
- Auto-schedule posts with a background scheduler (60-second tick)
- Track basic analytics (like-count snapshots)
- Fit images to Instagram's allowed aspect ratios automatically using blur-padded backgrounds

Every resource belongs to a **Business** workspace. All roles share the same `/login` route; membership determines which business a user accesses.

---

## 2. Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS v3, TanStack Query v5, Zustand, React Router v6 |
| Backend | Node.js, Express 5 (ESM), TypeScript, Mongoose 8, Zod, JWT, Multer |
| Database | MongoDB (local or Atlas) |
| AI | Google Gemini 2.5 Flash (captions, hashtags) |
| Image Processing | Sharp (aspect-ratio fitting for Instagram) |
| Social API | Meta Graph API v21+ (Instagram + Facebook OAuth) |
| Drive API | Google OAuth 2.0 + Drive REST API v3 |
| Scheduler | Custom interval-based (60s tick) |
| Auth | JWT stored in localStorage (`automation.session`) |

---

## 3. Monorepo Structure

```
AI_Automation/
├── apps/
│   ├── api/                        # Express backend
│   │   └── src/
│   │       ├── config/             # env.ts, database.ts
│   │       ├── controllers/        # auth, business, folder-automation,
│   │       │                         integrations, media, post, report
│   │       ├── middlewares/        # auth.ts, error-handler.ts
│   │       ├── models/             # Mongoose schemas
│   │       ├── routes/             # Route definitions
│   │       ├── services/           # ai, audit, auto-publish, folder-automation,
│   │       │                         google-drive, image-fit, instagram,
│   │       │                         publish, scheduler, smart-timing
│   │       ├── types.ts
│   │       ├── utils/              # api-error, async-handler, auth
│   │       ├── app.ts
│   │       └── index.ts            # Server entry (starts scheduler)
│   │
│   └── web/                        # React frontend
│       └── src/
│           ├── app/App.tsx
│           ├── components/         # AppShell, Panel, ToastProvider,
│           │                         automations/AutomationDrawer, queue/ConfirmDialog
│           ├── lib/                # api.ts, ds.ts (design system), errors.ts,
│           │                         media.ts, types.ts
│           ├── pages/              # One file per route
│           ├── store/              # auth-store.ts (Zustand)
│           └── styles/index.css
│
├── packages/
│   ├── config/
│   ├── types/
│   └── utils/
│
├── docs/
│   ├── PHASE_1_SETUP.md
│   ├── WORKFLOW_USER_GUIDE.md
│   ├── PROJECT_COMPLETE_DOCS.md    ← This file
│   └── AUTOMATIONS_GUIDE.md
│
├── reports/
├── docker-compose.yml
├── start.sh
└── package.json
```

---

## 4. Data Models

### `MediaAsset` (MongoDB)

Core entity. Each Drive file or local upload = one queue row.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId ref Business | Required, indexed |
| `uploadedBy` | ObjectId ref User | Required |
| `source` | `"local" \| "google_drive" \| "instagram_direct"` | |
| `mediaType` | `"image" \| "video"` | |
| `originalName` | String | |
| `mimeType` | String | |
| `sizeInBytes` | Number | |
| `filePath` | String | Local disk path |
| `publicUrl` | String | Accessible URL for publishing |
| `previewUrl` | String | Cached local thumbnail path |
| `driveViewLink` | String | |
| `driveThumbnailLink` | String | Raw Google CDN URL |
| `folderName` | String | |
| `driveFileId` | String | Unique per business (sparse index) |
| `driveFolderId` | String | |
| `status` | `"ready" \| "processing" \| "failed"` | |
| `workflowStatus` | `"new" \| "scheduled" \| "posting" \| "live" \| "error" \| "manual_review"` | |
| `captionStatus` | `"pending" \| "processing" \| "done" \| "failed"` | Tracks AI caption generation state |
| `failedReason` | String | Why caption gen or publish failed |
| `groupId` | String | Carousel grouping key |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | Auto-inferred in pre-validate hook |
| `scheduledTime` | Date | |
| `aiCaption` | String | Gemini-generated |
| `hashtags` | String[] | Generated or manually entered |
| `igMediaId` | String | After publishing |
| `likeCount` | Number | Manual entry |
| `reachCount` | Number | Manual entry |
| `automationId` | ObjectId ref FolderAutomation | Set when created by an automation |

**Pre-validate hook** (`models/MediaAsset.ts`):
- Video → `postType = "video"`
- Image + groupId → `postType = "carousel"`
- Image, no groupId → `postType = "single"`
- Reel type: cannot be auto-inferred — must be set explicitly (see BUG-002)

---

### `PostDraft` (MongoDB)

The publishing unit. Links multiple `MediaAsset` IDs into one post.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId ref Business | |
| `instagramAccountId` | ObjectId ref InstagramAccount | |
| `createdBy` | ObjectId ref User | |
| `mediaAssetIds` | ObjectId[] ref MediaAsset | |
| `title` | String | Required, min 2 chars |
| `caption` | String | |
| `hashtags` | String[] | |
| `collaborators` | String[] | IG handles (no @) |
| `scheduledFor` | Date | Scheduler uses this |
| `smartTimingSuggestedFor` | Date | From SmartTiming service |
| `status` | `"new" \| "scheduled" \| "posting" \| "live" \| "error" \| "manual_review"` | |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | |
| `groupId` | String | |
| `aiCaption` | String | |
| `igMediaId` | String | After publishing |
| `permalink` | String | Live IG post URL |
| `likeCount` | Number | |
| `reachCount` | Number | |
| `automationId` | ObjectId ref FolderAutomation | Set when created by automation |

---

### `FolderAutomation` (MongoDB)

Defines a rule: watch Drive folder → auto-import → AI captions → group → schedule posts.

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId ref Business | |
| `folderId` | String | Google Drive folder ID |
| `folderName` | String | Display name |
| `igAccountId` | ObjectId ref InstagramAccount | Target IG account |
| `collaborators` | String[] | |
| `groupingMode` | `"one_per_file" \| "batch_size" \| "subfolder"` | How files are grouped into posts |
| `batchSize` | Number | Used when `groupingMode = "batch_size"` |
| `carouselMaxSize` | Number | Default 10, hard cap per carousel |
| `cadenceMode` | `"interval" \| "daily_slots" \| "smart"` | Scheduling strategy |
| `intervalValue` | Number | e.g. `5` |
| `intervalUnit` | `"minutes" \| "hours" \| "days"` | |
| `dailySlots` | String[] | e.g. `["09:00", "14:00"]` |
| `brandVoice` | String | Tone hint for Gemini captions |
| `useEmojis` | Boolean | |
| `reprocessImported` | Boolean | Re-run already-imported files |
| `status` | `"idle" \| "running" \| "finished" \| "paused" \| "manual_review"` | |
| `priority` | Number | Lower = runs first when chained |
| `lastFetchedAt` | Date | |
| `finishedAt` | Date | |
| `lastRunError` | String | |

---

### `AutomationRun` (MongoDB)

One execution record per automation trigger.

| Field | Type | Notes |
|---|---|---|
| `automationId` | ObjectId ref FolderAutomation | |
| `businessId` | ObjectId ref Business | |
| `triggeredBy` | ObjectId ref User | |
| `startedAt` | Date | |
| `finishedAt` | Date | |
| `filesImported` | Number | |
| `groupsCreated` | Number | |
| `postsScheduled` | Number | |
| `status` | `"running" \| "completed" \| "failed"` | |
| `errorLog` | `{ step, message, at }[]` | Per-step failure log |

---

### Other Models

| Model | Purpose |
|---|---|
| `User` | Platform user — email, password (bcrypt), globalRole |
| `Business` | Workspace — name, slug, timezone |
| `Membership` | User ↔ Business link, role, status |
| `InstagramAccount` | Connected IG account — igUserId, accessToken, pageId, handle |
| `GoogleDriveConnection` | OAuth tokens for Drive per business |
| `PublishJob` | Tracks publish attempts per draft |
| `AuditLog` | Immutable action log |
| `AnalyticsLike` | Like-count snapshot |

---

## 5. Frontend Pages

### 5.1 Setup Page `/setup`

One-time bootstrap for the first `super_admin`. Calls `POST /auth/bootstrap`. Disabled after first use.

---

### 5.2 Login Page `/login`

Auth for all roles. Sets JWT + session in Zustand + localStorage. Redirects to `/`.

---

### 5.3 Dashboard Page `/`

**File:** `apps/web/src/pages/DashboardPage.tsx`

- Status stat cards (All Files, New, Scheduled, Live, Errors)
- Upcoming schedule (next 5 items)
- Workflow guide panel
- Navigation guide panel

---

### 5.4 Drive Browser Page `/drive-browser`

**File:** `apps/web/src/pages/DriveBrowserPage.tsx`

Most complex page. Handles Drive OAuth, folder tree, file grid, bulk import.

| Feature | Detail |
|---|---|
| OAuth connect/disconnect | `GET /google-drive/oauth/start` → redirect → callback |
| Folder tree sidebar | Recursive expand/collapse, depth indent, Photos/Videos/Both badge |
| Folder filter | Text filter on folder list |
| File grid (4 view modes) | Large, Medium, Small, Detailed list |
| File search + type filter | Client-side filtering |
| Multi-select | Click / Ctrl+Click / Shift+Click range |
| Per-file import | Per-card Import button |
| Bulk import | `Promise.allSettled` for all selected |
| Duplicate detection | Already-imported badge, Re-import button |
| Infinite scroll + load-more | `IntersectionObserver` on sentinel + manual fallback |
| Server-side pagination | Drive API `pageToken` |
| Disconnect Drive | `POST /google-drive/disconnect` |

---

### 5.5 Content Queue Page `/queue`

**File:** `apps/web/src/pages/QueuePage.tsx`

Master planning table for all `MediaAsset` records.

| Feature | Detail |
|---|---|
| Search | Filters by name, driveFileId, groupId, caption, folderName |
| Select all / per-row checkbox | |
| Bulk Group ID | Apply one Group ID to all selected rows |
| Bulk Remove | Parallel DELETE with confirm |
| Inline Status dropdown | Saves on change |
| Inline Group ID input | Saves on blur; shows "View" link if set |
| Inline Post Type dropdown | Saves on change |
| Inline Scheduled Time | datetime-local, saves on blur |
| Media thumbnail | 40×40 px; links to detail page |
| Carousel / Manual Review status | New `manual_review` workflowStatus visible |

---

### 5.6 Queue Detail Page `/queue/:id`

**File:** `apps/web/src/pages/QueueDetailPage.tsx`

Single media asset full edit + preview.

| Feature | Detail |
|---|---|
| Media preview | Image `<img>` / Video `<video controls>` |
| Meta card grid | Drive File ID, Folder, Status, Post Type, Group ID, Scheduled Time, IG Media ID, Likes/Reach |
| Gemini caption | `POST /media/:id/generate-caption` |
| Caption textarea | Saves on blur |
| Status | Saves immediately on change |
| Group ID, Post Type, Scheduled Time, IG Media ID, Likes/Reach | All save on blur |
| Related group assets | Thumbnail grid of siblings if groupId is set |

**Note:** Post Type now correctly includes `"reel"` in the selector options.

---

### 5.7 Queue Group Page `/queue/group/:groupId`

**File:** `apps/web/src/pages/QueueGroupPage.tsx`

Carousel planning view — shows all assets sharing the same `groupId`. Grid of asset cards linking to individual detail pages.

---

### 5.8 Posts Page `/posts`

**File:** `apps/web/src/pages/PostsPage.tsx`

Instagram publisher — manage `PostDraft` entities.

Tabs: All / Draft / Scheduled / Live (with count badges)

View modes: Small / Medium / Large grid, List

Features: Create Drawer (right-side slide-in), Post Detail Modal (full edit), Broken Thumbnail Repair on mount, Prefill flow from Queue Detail, Hashtag AI suggestion, Publish Now, Delete with confirm.

---

### 5.9 Automations Page `/automations`

**File:** `apps/web/src/pages/AutomationsPage.tsx`

Manage **Folder Automations** — rules that watch a Drive folder, generate AI captions, and auto-schedule posts.

| Feature | Detail |
|---|---|
| Stats bar | Total / Running / Paused / Needs Review |
| Automation cards | Status badge, folder name, cadence label, IG account, last run info, error message |
| New Automation wizard | Multi-step drawer: folder selection → grouping → cadence → review |
| Edit automation | Same drawer in edit mode |
| Fetch Now | `POST /automations/:id/fetch` — triggers immediate run |
| Pause / Resume | `POST /automations/:id/pause` and `/resume` |
| Delete | With confirm dialog |
| Run history | `GET /automations/:id/runs` |
| Auto-refresh | TanStack Query polls every 10s when any automation is `running` |
| Preview | Before saving, shows which files will be grouped and when they'll be scheduled |

**Cadence modes:**
- `smart` — delegates to SmartTiming service
- `interval` — every N minutes/hours/days
- `daily_slots` — post at specific times each day (e.g. `["09:00", "14:00", "18:00"]`)

**Grouping modes:**
- `one_per_file` — one post per Drive file
- `batch_size` — N files per post (carousel)
- `subfolder` — group files by Drive subfolder

---

### 5.10 Businesses Page `/businesses`

**File:** `apps/web/src/pages/BusinessesPage.tsx`

Create businesses, add members, assign roles (`admin` / `user`), set passwords.

---

### 5.11 Integrations Page `/integrations`

**File:** `apps/web/src/pages/IntegrationsPage.tsx`

Connect/disconnect Instagram accounts and view Google Drive status.

| Feature | Detail |
|---|---|
| Instagram panel | Account list, connect via Facebook OAuth, disconnect |
| Drive panel | Status (Connected / Disconnected / Not connected), connected email, link to Drive Browser |
| Success/error banners | Parsed from URL params after OAuth redirect |

---

### 5.12 Analytics Page `/analytics`

**File:** `apps/web/src/pages/AnalyticsPage.tsx`

Manual like-count snapshots. MVP only — no auto-fetch from IG API yet.

---

### 5.13 Media Page (Dev Tool) `/media`

**File:** `apps/web/src/pages/MediaPage.tsx`

Internal developer tool for manual local uploads and Drive metadata imports. Not exposed in the main navigation — accessible by direct URL only.

---

## 6. Backend Services

### 6.1 AI Service

**File:** `apps/api/src/services/ai.service.ts`

| Function | Description |
|---|---|
| `generateInstagramCaptionFromMedia(input)` | Sends base64 media to Gemini 2.5 Flash → returns `{ caption, hashtags }` |
| `suggestHashtagsWithAI(caption)` | Gemini generates 12–15 trending hashtags |
| `suggestHashtagsFromCaption(caption)` | Local fallback tokenizer — picks unique words >3 chars, returns first 8 as `#tags` |
| `getGeminiKeyCount()` | Returns how many Gemini API keys are configured |
| `getGeminiAvailableCount()` | Returns how many keys are not currently rate-limited |

**Multi-key support:** Configure `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` etc. for parallel automation caption generation. Keys rotate round-robin; a key is skipped if rate-limited (429).

**Size limit:** Media ≤ 10 MB for inline base64 submission.

---

### 6.2 Instagram Service

**File:** `apps/api/src/services/instagram.service.ts`

Handles all Meta Graph API interactions: OAuth URL generation, code exchange, account listing, single/carousel/video/reel publishing, collaborator ID resolution.

**Video poll:** 24 attempts × 5s = 120s max before timeout.

**Scopes:** `pages_show_list`, `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `business_management`

---

### 6.3 Publish Service

**File:** `apps/api/src/services/publish.service.ts`

`publishDraftById(draftId, actorUserId?)` — core publish function.

**Flow:**
1. Load `PostDraft` + `InstagramAccount` + `MediaAsset[]`
2. Validate `PUBLIC_API_URL`
3. For each asset, resolve a public URL (Drive download → local cache → prepend tunnel URL)
4. Fit image to Instagram aspect ratio via `image-fit.service.ts` if needed
5. Set draft status = `"posting"`
6. Build `captionWithHashtags`
7. Resolve collaborator IDs
8. Route by post type → reel / video / carousel / single
9. On success: set status = `"live"`, save `igMediaId` + `permalink`
10. On failure: set status = `"error"`, re-throw
11. Upsert `PublishJob` record

---

### 6.4 Scheduler Service

**File:** `apps/api/src/services/scheduler.service.ts`

- Starts on server boot via `startScheduler()` in `index.ts`
- Runs every **60 seconds**
- Queries `PostDraft` where `status = "scheduled"` AND `scheduledFor <= now()`
- Calls `publishDraftById()` for each due draft

---

### 6.5 Folder Automation Service

**File:** `apps/api/src/services/folder-automation.service.ts`

Main automation engine. Called by `POST /automations/:id/fetch` or chained automatically.

**Flow:**
1. `fetchNewAndOrphanedFiles()` — lists Drive files, finds new ones not yet in DB, finds existing assets not yet linked to a draft
2. `importFilesToMedia()` — creates `MediaAsset` records for new files, caches thumbnails
3. `generateCaptionsForBatch()` — parallel Gemini calls (up to 4 concurrent, capped by key count); marks assets `manual_review` on failure
4. `groupFiles()` — applies `groupingMode` and `carouselMaxSize`
5. Creates `PostDraft` records with `scheduledFor` from `pickScheduleSlot()`
6. Updates `AutomationRun` with counts
7. `triggerNextPendingAutomation()` — chains the next `idle` automation by priority

**Caption failure policy:** No retry. Failed assets get `workflowStatus = "manual_review"` immediately. If all Gemini keys are rate-limited, remaining assets are bulk-marked `manual_review`.

---

### 6.6 Auto-Publish Service

**File:** `apps/api/src/services/auto-publish.service.ts`

`autoPublishMediaAsset(assetId)` — creates an ephemeral `PostDraft` from a single asset and calls `publishDraftById()`. Used for direct MediaAsset-level publishing without a pre-existing draft.

`autoPublishCarouselGroup(groupId, businessId)` — same for a carousel group.

---

### 6.7 Image Fit Service

**File:** `apps/api/src/services/image-fit.service.ts`

Uses Sharp to ensure images fit Instagram's allowed aspect ratio range (0.8 – 1.91 for feed, 9:16 for Reels).

If an image is outside the range, it pads the canvas with a blurred, zoomed copy of the original as the background.

| Function | Description |
|---|---|
| `fitForInstagramFeed(inputPath, outputPath)` | Fits to feed ratio (0.8–1.91), JPEG output |
| `fitForInstagramReel(inputPath, outputPath)` | Fits to Reels ratio (9:16), JPEG output |

`wasFitted: boolean` in the return value indicates whether padding was applied.

---

### 6.8 Google Drive Service

**File:** `apps/api/src/services/google-drive.service.ts`

OAuth flow, folder listing, paginated file listing, thumbnail download and caching, full-file download for publish.

Key functions: `listFolders`, `listFiles`, `getFolderDetail`, `ensureDriveThumbnailCached`, `downloadDriveFileForPublish`

---

### 6.9 Smart Timing Service

**File:** `apps/api/src/services/smart-timing.service.ts`

`suggestSmartTime(businessId)` — looks at existing posts and gaps in the schedule, returns `{ suggestedFor: Date }`.

---

### 6.10 Audit Service

**File:** `apps/api/src/services/audit.service.ts`

Writes immutable `AuditLog` records. Actions: `media.uploaded`, `media.imported_from_drive`, `media.workflow_updated`, `media.ai_caption_generated`, `media.deleted`, `post_draft.created`, `post.published`, `post_draft.deleted`.

---

## 7. API Routes Summary

### Auth (`/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/bootstrap` | Create first super_admin (one-time) |
| POST | `/auth/login` | Login, returns JWT + user + memberships |
| GET | `/auth/me` | Validate token, return current user |

### Business (`/businesses`)
| Method | Path | Description |
|---|---|---|
| GET | `/businesses` | List all businesses |
| POST | `/businesses` | Create business |
| POST | `/businesses/members` | Create user + membership |

### Media (`/media`)
| Method | Path | Description |
|---|---|---|
| GET | `/media` | List all media assets for businessId |
| GET | `/media/:id` | Get single asset + relatedGroupAssets |
| POST | `/media/upload` | Local file upload (multipart) |
| POST | `/media/import-from-drive` | Import Drive file metadata |
| PATCH | `/media/:id` | Update workflow fields |
| DELETE | `/media/:id` | Delete asset |
| POST | `/media/:id/generate-caption` | AI caption via Gemini |
| POST | `/media/:id/ensure-thumbnail` | Ensure cached thumbnail |

### Posts (`/posts`)
| Method | Path | Description |
|---|---|---|
| GET | `/posts` | List post drafts for businessId |
| POST | `/posts` | Create post draft |
| PATCH | `/posts/:id` | Update draft |
| DELETE | `/posts/:id` | Delete draft |
| POST | `/posts/:id/schedule` | Schedule a draft |
| POST | `/posts/:id/suggest-hashtags` | AI hashtag suggestion |
| POST | `/posts/:id/publish` | Publish immediately |

### Automations (`/automations`)
| Method | Path | Description |
|---|---|---|
| GET | `/automations` | List automations for businessId |
| POST | `/automations` | Create automation |
| POST | `/automations/preview` | Preview groups + schedule without saving |
| GET | `/automations/next-priority` | Get next priority number |
| PATCH | `/automations/:id` | Update automation config |
| DELETE | `/automations/:id` | Delete automation |
| POST | `/automations/:id/fetch` | Trigger immediate run |
| POST | `/automations/:id/pause` | Pause automation |
| POST | `/automations/:id/resume` | Resume automation |
| GET | `/automations/:id/runs` | List run history |

### Integrations (`/instagram`, `/google-drive`)
| Method | Path | Description |
|---|---|---|
| GET | `/instagram/oauth/start` | Get Facebook OAuth URL |
| GET | `/instagram/oauth/callback` | Handle OAuth return |
| GET | `/instagram/accounts` | List connected IG accounts |
| POST | `/instagram/disconnect` | Disconnect account |
| GET | `/google-drive/oauth/start` | Get Google OAuth URL |
| GET | `/google-drive/oauth/callback` | Handle OAuth return |
| GET | `/google-drive/connections` | List Drive connections |
| POST | `/google-drive/disconnect` | Disconnect Drive |
| GET | `/google-drive/folders` | List folders for parent |
| GET | `/google-drive/folders/:id` | Get folder detail |
| GET | `/google-drive/files` | List files with pagination |

### Analytics (`/analytics`)
| Method | Path | Description |
|---|---|---|
| GET | `/analytics/likes` | List like snapshots |
| POST | `/analytics/likes` | Record new snapshot |

### Reports (`/reports`)
| Method | Path | Description |
|---|---|---|
| POST | `/reports/save` | Save a report (admin only) |
| POST | `/reports/dev-report` | Save a dev report |

---

## 8. Auth & Session System

1. User logs in → API returns `{ token, user, memberships }`
2. Frontend: `setSession()` in Zustand → sets axios Authorization header → stores `{ token }` in localStorage
3. On reload: `hydrateMe()` in `App.tsx` useEffect → reads localStorage token → calls `GET /auth/me` → re-populates store
4. `ProtectedRoute` checks for `token` in store → if missing, redirect to `/login`
5. `clearSession()` removes token from axios, localStorage, and Zustand

**Active Business:** Defaults to `memberships[0].businessId._id`. Switch with `setActiveBusinessId()` (saved to localStorage). Note: `hydrateMe()` currently overrides this with `memberships[0]` on every reload — see BUG-001.

---

## 9. State Management

**Zustand (`auth-store.ts`):**
- `token`, `user`, `memberships`, `activeBusinessId`
- `setSession`, `clearSession`, `setActiveBusinessId`, `hydrateMe`

**TanStack Query v5 — all server state:**

| Query Key | Data |
|---|---|
| `["queue-overview", businessId]` | All media (Dashboard) |
| `["queue", businessId]` | All media (Queue table) |
| `["media", businessId]` | All media (Posts page picker) |
| `["queue-detail", id, businessId]` | Single asset detail |
| `["posts", businessId]` | All post drafts |
| `["ig-accounts", businessId]` | Instagram accounts |
| `["drive-connections", businessId]` | Drive connections |
| `["businesses"]` | All businesses |
| `["likes", businessId]` | Like snapshots |
| `["automations", businessId]` | Folder automations |
| `["drive-folder-detail", businessId, folderId]` | Folder name |

---

## 10. Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Token signing secret |
| `GEMINI_API_KEY` | Yes | Primary Google AI key |
| `GEMINI_API_KEY_2` | No | Additional key (automation parallel runs) |
| `GEMINI_API_KEY_3` | No | Additional key |
| `FACEBOOK_APP_ID` | Yes | Meta App ID |
| `FACEBOOK_APP_SECRET` | Yes | Meta App Secret (not an access token) |
| `FACEBOOK_REDIRECT_URI` | Yes | Must match Meta app settings exactly |
| `FACEBOOK_GRAPH_API_VERSION` | No | Default `v25.0` |
| `FACEBOOK_SCOPES` | No | Default as in README |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Google OAuth callback URL |
| `GOOGLE_DRIVE_SCOPES` | No | Default: drive.file + drive.metadata.readonly |
| `PUBLIC_API_URL` | Yes | Publicly accessible API URL (Cloudflare Tunnel) |
| `PORT` | No | Default `4000` |
| `UPLOAD_DIR` | No | Default `uploads/` |

### Frontend (`apps/web/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | API base URL. Default: current host port 4000 |

---

## 11. Known Bugs

### BUG-001 — activeBusinessId not restored on reload
**File:** `apps/web/src/store/auth-store.ts`
`hydrateMe()` always sets `activeBusinessId` to `memberships[0]._id`, ignoring the value saved in localStorage by `setActiveBusinessId()`. Users with multiple businesses always land on business #0 after reload.

---

### BUG-002 — MediaAsset pre-validate hook overrides "reel" postType
**File:** `apps/api/src/models/MediaAsset.ts`
The pre-validate hook always sets `postType` from media type + groupId. If a user sets `postType = "reel"`, the hook overrides it back to `"video"`. Reel type cannot be preserved on `MediaAsset`.
**Fix:** Skip inference when `postType = "reel"` is explicitly set.

---

### BUG-003 — Scheduler does not rate-limit concurrent publishes
**File:** `apps/api/src/services/scheduler.service.ts`
Multiple due posts at the same time are processed sequentially. Video polls block for up to 2 minutes each. At high volume, the scheduler tick can stall for a very long time.

---

### BUG-004 — Post Detail Modal state does not sync when post prop updates
**File:** `apps/web/src/pages/PostsPage.tsx`
Form state is initialized from `post` prop in `useState()`. If the parent refetches a newer version, the modal retains stale values.

---

### BUG-005 — `window.confirm` used for destructive actions in Queue
**File:** `apps/web/src/pages/QueuePage.tsx`
Native browser `confirm()` cannot be styled and may be blocked in some environments. Should be replaced with an inline confirmation UI.

---

### BUG-006 — PublishJob "failed" status never set
**File:** `apps/api/src/services/publish.service.ts`
`PublishJob` supports `"failed"` status but only `"queued"` and `"completed"` are ever written. On publish error the job is left as `"queued"`.

---

## 12. Improvement Opportunities

| ID | Area | Description |
|---|---|---|
| IMP-001 | UI | Business switcher in AppShell — `setActiveBusinessId` exists but no UI calls it |
| IMP-002 | Analytics | Auto-fetch like/reach from IG Graph API for live posts |
| IMP-003 | Performance | Server-side pagination for Content Queue (currently fetches all assets) |
| IMP-004 | Performance | Server-side pagination for Posts page |
| IMP-005 | Automations | Show per-asset caption retry UI in manual_review state |
| IMP-006 | Automations | Webhook trigger for Drive file additions (instead of manual Fetch Now) |
| IMP-007 | Publishing | Decouple video status polling from sync publish flow (exponential backoff) |
| IMP-008 | Storage | TTL-based cleanup job for `uploads/publish-cache/` and `uploads/drive-thumbnails/` |
| IMP-009 | Auth | Token refresh / session invalidation flow |
| IMP-010 | Auth | Invite flow + reset-password flow |
| IMP-011 | UI | PublishJob history + retry failed jobs screen |
| IMP-012 | UI | Smart timing suggestion displayed to users in the scheduling UI |

---

## 13. Recommended Next Features

| Priority | Feature | Complexity |
|---|---|---|
| High | Fix BUG-001 (activeBusinessId restore on reload) | Low |
| High | Business switcher dropdown in AppShell sidebar | Low |
| High | Manual review queue — bulk approve/edit/retry for automation-failed captions | Medium |
| Medium | Real Instagram analytics fetch (like/reach per post via Graph API) | Medium |
| Medium | Audit log viewer page | Medium |
| Medium | Queue server-side pagination | Medium |
| Medium | Publish-cache cleanup job | Low |
| Low | Instagram Story publishing support | High |
| Low | Replace `window.confirm` with modal confirms throughout | Low |
| Low | Webhook-driven automation trigger (Drive → new file → auto-run) | High |
| Low | Multi-language caption tone selector in automation wizard | Medium |

---

*End of Documentation*
