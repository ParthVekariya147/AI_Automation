# Instagram Automation Suite — Complete Project Documentation

> Generated: 2026-05-08  
> Codebase: `/Users/yashmadhavtech/Documents/AI_Automation`  
> Stack: Node.js + Express + MongoDB (API) · React + Vite + Tailwind (Web)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Data Models](#4-data-models)
5. [Frontend Pages — Full Feature Breakdown](#5-frontend-pages--full-feature-breakdown)
   - [Setup Page](#51-setup-page--setup)
   - [Login Page](#52-login-page--login)
   - [Dashboard Page](#53-dashboard-page-)
   - [Drive Browser Page](#54-drive-browser-page--drive-browser)
   - [Content Queue Page](#55-content-queue-page--queue)
   - [Queue Detail Page](#56-queue-detail-page--queueid)
   - [Queue Group Page](#57-queue-group-page--queuegroupgroupid)
   - [Posts Page](#58-posts-page--posts)
   - [Businesses Page](#59-businesses-page--businesses)
   - [Integrations Page](#510-integrations-page--integrations)
   - [Analytics Page](#511-analytics-page--analytics)
6. [Backend Services — Full Feature Breakdown](#6-backend-services--full-feature-breakdown)
   - [AI Service](#61-ai-service)
   - [Instagram Service](#62-instagram-service)
   - [Publish Service](#63-publish-service)
   - [Scheduler Service](#64-scheduler-service)
   - [Google Drive Service](#65-google-drive-service)
   - [Smart Timing Service](#66-smart-timing-service)
   - [Audit Service](#67-audit-service)
7. [API Routes Summary](#7-api-routes-summary)
8. [Auth & Session System](#8-auth--session-system)
9. [State Management](#9-state-management)
10. [Environment Variables](#10-environment-variables)
11. [Known Bugs](#11-known-bugs)
12. [Improvement Opportunities](#12-improvement-opportunities)
13. [Low-Level Code Issues](#13-low-level-code-issues)
14. [Recommended Next Features](#14-recommended-next-features)

---

## 1. Project Overview

**Instagram Automation Suite** is a self-hosted social media management platform that allows agency teams or solo operators to:

- Browse and import media from **Google Drive** into a content queue
- Use **Gemini AI** to generate Instagram captions from media files
- Manage post drafts with scheduling, hashtags, and collaborators
- **Publish directly to Instagram** (single, carousel, video, reel) via Meta Graph API
- Auto-schedule posts with a background scheduler running every 60 seconds
- Track basic analytics (like count snapshots)

The platform is workspace-scoped — every resource belongs to a **Business** entity. All admins share the same `/login` route; membership determines which business they access.

---

## 2. Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS v3, TanStack Query v5, Zustand, React Router v6 |
| Backend | Node.js, Express 5 (ESM), TypeScript, Mongoose 8, Zod, JWT, Multer |
| Database | MongoDB (local or Atlas) |
| AI | Google Gemini 2.5 Flash (caption generation, hashtag suggestion) |
| Social API | Meta Graph API v21 (Instagram + Facebook OAuth) |
| Drive API | Google OAuth 2.0 + Drive REST API v3 |
| Scheduler | Custom interval-based (60s tick, no external queue) |
| Auth | JWT stored in localStorage (`automation.session`) |

---

## 3. Monorepo Structure

```
AI_Automation/
├── apps/
│   ├── api/                        # Express backend
│   │   └── src/
│   │       ├── config/             # env.ts, database.ts
│   │       ├── controllers/        # auth, business, integrations, media, post
│   │       ├── middlewares/        # auth.ts, error-handler.ts
│   │       ├── models/             # Mongoose schemas
│   │       ├── routes/             # Route definitions
│   │       ├── services/           # Business logic (ai, audit, google-drive,
│   │       │                         instagram, publish, scheduler, smart-timing)
│   │       ├── types.ts            # Shared Express types
│   │       ├── utils/              # api-error, async-handler, auth
│   │       ├── app.ts              # Express app factory
│   │       └── index.ts            # Server entry point (starts scheduler)
│   │
│   └── web/                        # React frontend
│       └── src/
│           ├── app/App.tsx         # Root router
│           ├── components/         # AppShell, Panel, ProtectedRoute, ToastProvider
│           ├── lib/                # api.ts (axios), errors.ts, media.ts, types.ts
│           ├── pages/              # One file per route
│           ├── store/              # auth-store.ts (Zustand)
│           └── styles/index.css    # Global Tailwind styles
│
├── packages/
│   ├── config/                     # Shared config package (stub)
│   ├── types/                      # Shared type package (stub)
│   └── utils/                      # Shared utils package (stub)
│
├── docs/
│   ├── PHASE_1_SETUP.md
│   ├── WORKFLOW_USER_GUIDE.md
│   └── PROJECT_COMPLETE_DOCS.md    ← This file
│
├── docker-compose.yml
├── start.sh
└── package.json                    # npm workspaces root
```

---

## 4. Data Models

### `MediaAsset` (MongoDB)

The core entity. Each Drive file or local upload = one row in queue.

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
| `folderName` | String | Drive folder label |
| `driveFileId` | String | Unique per business (sparse index) |
| `driveFolderId` | String | |
| `status` | `"ready" \| "processing" \| "failed"` | |
| `workflowStatus` | `"new" \| "scheduled" \| "posting" \| "live" \| "error"` | |
| `groupId` | String | Carousel grouping |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | Auto-inferred in pre-validate hook |
| `scheduledTime` | Date | Media-level schedule |
| `aiCaption` | String | Gemini-generated |
| `igMediaId` | String | After publishing |
| `likeCount` | Number | Manual entry |
| `reachCount` | Number | Manual entry |

**Important pre-validate hook** (`models/MediaAsset.ts:80`):
- Video → always `postType = "video"`
- Image + groupId → `postType = "carousel"`
- Image, no groupId → `postType = "single"`

---

### `PostDraft` (MongoDB)

The publishing unit. Many `MediaAsset` ids link into one post.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `businessId` | ObjectId ref Business | |
| `instagramAccountId` | ObjectId ref InstagramAccount | |
| `createdBy` | ObjectId ref User | |
| `mediaAssetIds` | ObjectId[] ref MediaAsset | |
| `title` | String | Required, min 2 chars |
| `caption` | String | |
| `hashtags` | String[] | |
| `collaborators` | String[] | IG handles (without @) |
| `smartTimingSuggestedFor` | Date | From SmartTiming service |
| `scheduledFor` | Date | Scheduler uses this |
| `status` | `"new" \| "scheduled" \| "posting" \| "live" \| "error"` | |
| `postType` | `"single" \| "carousel" \| "video" \| "reel"` | |
| `groupId` | String | |
| `aiCaption` | String | |
| `igMediaId` | String | After publishing |
| `permalink` | String | Instagram post URL |
| `likeCount` | Number | |
| `reachCount` | Number | |

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
| `AnalyticsLike` | Like count snapshot |

---

## 5. Frontend Pages — Full Feature Breakdown

### 5.1 Setup Page `/setup`

**File:** `apps/web/src/pages/SetupPage.tsx`

**Purpose:** One-time bootstrap for the very first admin user.

**Features:**
- Form: full name, email, password
- Calls `POST /auth/bootstrap`
- On success: sets session in Zustand store → redirects to `/`
- If platform already initialized, the API returns an error — shown inline

**State:** Local `form` state only. No React Query.

**Edge case handled:** Error message shown if bootstrap fails (e.g. already initialized).

---

### 5.2 Login Page `/login`

**File:** `apps/web/src/pages/LoginPage.tsx`

**Purpose:** Authentication for all admins.

**Features:**
- Form: email + password
- Calls `POST /auth/login`
- Sets JWT token and session (user + memberships) into Zustand + localStorage
- Redirects to `/`
- Shows error message on failure

**Hint text:** Shows that single admin login is used — all admins use the same `/login` URL.

---

### 5.3 Dashboard Page `/`

**File:** `apps/web/src/pages/DashboardPage.tsx`

**Purpose:** Operational summary and quick navigation.

**Features:**

| Feature | Detail |
|---|---|
| **Status stat cards** | Shows totals: All Files, New, Scheduled, Live, Errors — derived from `/media` query |
| **Upcoming schedule** | Next 5 items with `scheduledTime` set, sorted ascending, linked to detail page |
| **Workflow guide panel** | 4-step workflow instructions |
| **Navigation guide panel** | Description of each section (Drive Browser, Queue, Posts, etc.) |

**API calls:** `GET /media?businessId=...` via TanStack Query key `["queue-overview", activeBusinessId]`

**Components used:** `Panel`, `StatCard`, `InfoLine`, `EmptyState`

---

### 5.4 Drive Browser Page `/drive-browser`

**File:** `apps/web/src/pages/DriveBrowserPage.tsx` (1,069 lines)

This is the most complex page. It handles Google Drive OAuth, folder tree browsing, and bulk media import.

**Features:**

| Feature | Detail |
|---|---|
| **OAuth connect/disconnect** | Triggers `GET /google-drive/oauth/start` → redirects to Google, returns to this page with `?connected=1` or `?connected=0&error=...` |
| **OAuth feedback banner** | Shows success/error message parsed from URL params after OAuth redirect |
| **Metric cards (4)** | Media Source, Folders found, Files found, Imported count |
| **Folder tree sidebar** | Recursive `FolderNode` component with expand/collapse, depth indent, type badge (Photos/Videos/Both) |
| **Folder filter** | Text input that filters the displayed folder list |
| **Auto-fetch on folder select** | When a different folder is selected and Drive is connected, `fetchDriveData()` fires automatically |
| **File grid (4 view modes)** | Large (2-3 col), Medium (3-4 col), Small (4-6 col), Detailed (list with thumbnail) |
| **File search** | Filters by file name client-side |
| **Media type filter** | All / Images only / Videos only |
| **Sort order** | Newest first / Oldest first |
| **Multi-select** | Click = single select; Ctrl/Cmd+Click = add/remove; Shift+Click = range select |
| **Per-file import** | Import button on each card, tracks import state per-file |
| **Bulk import** | "Import N files" button imports all selected files in parallel (`Promise.allSettled`) |
| **Duplicate detection** | Already-imported files show "Imported" badge; import button says "Re-import" |
| **Infinite scroll** | `IntersectionObserver` on a sentinel div auto-loads next page when in viewport |
| **Load more button** | Manual fallback for pagination |
| **Server-side pagination** | Uses `pageToken` from Drive API, stored in `filesNextPageToken` |
| **Disconnect Drive** | Calls `POST /google-drive/disconnect`, resets all state |

**Important state variables:**
```
selectedFolderId    – current folder being viewed
folderTree          – Record<folderId, DriveFolder[]> — lazy loaded
files               – current page's raw file list
mediaFiles          – filtered + sorted version of files (useMemo)
filesNextPageToken  – for pagination
importingFileIds    – Set<string> tracking in-flight imports
selectedFileIds     – for bulk operations
lastSelectedIndex   – for Shift+Click range
```

**Sub-components:**
- `FolderNode` — recursive tree node
- `FolderTypeBadge` — Photos/Videos/Both badge
- `StatusPill` — Connected/Disconnected/Not connected
- `MetricCard` — top stat cards
- `LoadingGrid` — 6 skeleton cards
- `SimpleEmptyState` — dashed empty box

---

### 5.5 Content Queue Page `/queue`

**File:** `apps/web/src/pages/QueuePage.tsx`

**Purpose:** Master table view of all imported `MediaAsset` records. This is the "planner" view — not the publisher.

**Features:**

| Feature | Detail |
|---|---|
| **Search bar** | Filters by originalName, driveFileId, groupId, aiCaption, folderName |
| **Item count badge** | Shows filtered count |
| **Select all checkbox** | Selects/deselects all visible filtered rows |
| **Per-row checkbox** | Individual row selection |
| **Bulk Group ID** | Enter Group ID → apply to all selected rows in parallel |
| **Bulk Remove** | window.confirm → delete all selected rows in parallel |
| **Status dropdown** | Per-row inline select: new/scheduled/posting/live/error — saves on change |
| **Group ID input** | Per-row inline input — saves on blur; shows "View" link if groupId set |
| **Group View link** | Navigates to `/queue/group/:groupId` |
| **Post Type dropdown** | Per-row: single/carousel/video/reel — saves on change |
| **Scheduled Time** | Per-row datetime-local — saves on blur |
| **Media thumbnail** | 40×40 px preview; clicks to `/queue/:id` detail page |
| **Folder column** | Shows `folderName` |
| **Actions column** | "Open" (→ detail page) + "Remove" (with confirm dialog) |
| **Toast notifications** | Success/error toasts on all operations via `useToast` |

**Tips panel:** Three explanation cards (Carousel logic, Scheduling, Analytics).

**Functions:**
- `patchRow(id, payload)` — PATCH `/media/:id` + invalidate queries
- `removeRow(id, name)` — DELETE `/media/:id` with confirm
- `applyBulkGroupId()` — parallel PATCH for all selected
- `applyBulkRemove()` — parallel DELETE for all selected
- `toInputDateTime(value)` — converts ISO string to datetime-local string

---

### 5.6 Queue Detail Page `/queue/:id`

**File:** `apps/web/src/pages/QueueDetailPage.tsx`

**Purpose:** Single media asset edit + preview. Full-detail companion to the queue table.

**Features:**

| Feature | Detail |
|---|---|
| **Media preview** | Image: `<img>` with `object-contain`. Video: `<video controls>` |
| **Open original file** | Button visible if `driveViewLink` exists |
| **Meta card grid** | Drive File ID, Folder, Status, Post Type, Group ID, Scheduled Time, IG Media ID, Likes/Reach |
| **Status selector** | Saves immediately via `updateAsset` on change |
| **Group ID input** | Saves on blur |
| **Post Type selector** | Saves on blur; choices are single/carousel/video (note: reel missing — see bugs) |
| **Scheduled Time** | Datetime-local input, saves on blur |
| **Gemini AI caption** | Button → `POST /media/:id/generate-caption` → sets textarea; also invalidates queries |
| **Caption textarea** | Editable, saves on blur |
| **IG Media ID input** | Manual field, saves on blur |
| **Likes/Reach number inputs** | Saves on blur |
| **Related group assets** | If `groupId` set, shows thumbnail grid of siblings; link to group page |
| **Save indicator** | "Saving changes..." / "Changes save as you update each field." |
| **Back link** | `← Back to queue` |
| **Toast notifications** | Error toasts on all operations |

**API calls:**
- `GET /media/:id?businessId=...` → returns `{ asset, relatedGroupAssets }`
- `PATCH /media/:id`
- `POST /media/:id/generate-caption`

---

### 5.7 Queue Group Page `/queue/group/:groupId`

**File:** `apps/web/src/pages/QueueGroupPage.tsx`

**Purpose:** View all media assets sharing the same `groupId` — the carousel planning view.

**Features:**
- Fetches `/media?businessId=...` and filters client-side by `groupId` from URL param
- Shows a grid of asset cards with preview thumbnails
- Links to individual Queue Detail pages

---

### 5.8 Posts Page `/posts`

**File:** `apps/web/src/pages/PostsPage.tsx` (1,453 lines — largest file)

**Purpose:** The Instagram publisher. Manage `PostDraft` entities — captions, hashtags, scheduling, and publishing.

**Features:**

#### Tab bar
| Tab | Filter |
|---|---|
| All | All posts |
| Draft | status = "new" |
| Scheduled | status = "scheduled" OR "posting" |
| Live | status = "live" OR "error" |

Each tab shows a count badge.

#### View modes (4)
| Mode | Layout |
|---|---|
| Small | 3–6 column square grid |
| Medium | 2–5 column square grid |
| Large | 1–3 column square grid |
| List | Horizontal list rows |

#### Post Card (grid view)
- Thumbnail with status ring color-coding (slate/blue/amber/emerald/red)
- Post type badge (carousel, video, reel — not shown for single)
- On hover: overlay with **# Hashtags**, **Publish now**, **Edit / Details** buttons
- Below card (medium/large): title, caption preview, hashtag pills (first 4), status badge, scheduled time
- Collaborators display

#### List Card (list view)
- 56×56 thumbnail with status ring
- Title + status badge
- Caption preview
- Hashtag pills (first 3)
- Scheduled time
- Hover actions: "View" (live posts with permalink) or "Publish" + "Edit"

#### New Post Card
- Dashed placeholder at end of grid; opens CreateDrawer

#### Broken Thumbnail Repair
- On mount, scans `media` for google_drive images where `previewUrl` is missing or is an `http://` URL
- Calls `POST /media/:id/ensure-thumbnail` for each broken item
- Refreshes media query if any succeeded

#### Create Drawer (right-side panel)
Slide-in panel from the right with full form:
1. **Post Type** selector (single/carousel/video/reel icons)
2. **Instagram Account** dropdown
3. **Media picker** — grid of filtered media (images for single/carousel; videos for video/reel); max 1 for non-carousel, max 10 for carousel; order indicator badges
4. **AI Generate caption** — `POST /media/:firstSelectedId/generate-caption`; auto-fills Title from first 6 words
5. **Caption textarea**
6. **Title input** — auto-filled from AI caption
7. **Schedule (optional)** — datetime-local; if blank → "Save Draft"; if set → "Schedule Post"
8. **Collaborators** — comma-separated handles, @ stripped on save
9. **Submit** → `POST /posts` via createMutation

#### Post Detail Modal (center overlay)
Full edit modal for existing posts:
- Left panel: media preview (image/video) + "View on Instagram" gradient button for live posts
- Right panel form:
  - Title (disabled if live)
  - Caption textarea (disabled if live)
  - Hashtags textarea + **AI Suggest** button (`POST /posts/:id/suggest-hashtags`)
  - Preview of first 8 hashtag pills
  - Collaborators input
  - Scheduled For datetime-local (hidden if live)
  - Post info section (type, scheduled, IG media ID)
- Footer actions:
  - **Delete** (confirm flow)
  - **Publish Now** (`POST /posts/:id/publish`)
  - **Save Changes / Save & Schedule** (`PATCH /posts/:id`)

**Prefill flow:** If navigated with `location.state = { mediaIds, postType, aiCaption, groupId }`, the CreateDrawer opens pre-filled (used by Queue Detail for quick posting).

---

### 5.9 Businesses Page `/businesses`

**File:** `apps/web/src/pages/BusinessesPage.tsx`

**Purpose:** Create businesses and manage admin users.

**Features:**

| Feature | Detail |
|---|---|
| **Auth flow explanation** | Cards explaining first admin vs additional admin flow |
| **Business list** | Shows name, slug, timezone for each business |
| **Create business form** | Fields: name, slug, timezone (default "Asia/Kolkata") → `POST /businesses` |
| **Create admin login** | Name, email, password → `POST /businesses/members`; shows login instructions + success message |
| **Current role display** | Shows `user.globalRole` from Zustand auth store |

---

### 5.10 Integrations Page `/integrations`

**File:** `apps/web/src/pages/IntegrationsPage.tsx`

**Purpose:** Connect/disconnect Instagram Professional accounts and view Google Drive status.

**Features:**

#### Instagram panel
| Feature | Detail |
|---|---|
| **Success banner** | Shows when `?ig_connected=1` in URL (auto-clears URL after 5s) |
| **Error banner** | Shows when `?error=...` in URL |
| **Account list** | Each account: gradient avatar (initials), name, @handle, ConnectedBadge, disconnect button |
| **Disconnect button** | `POST /instagram/disconnect` with spinner during loading |
| **IG account link help** | If error contains "no linked instagram professional account", shows numbered fix steps |
| **Connect via Facebook** | `GET /instagram/oauth/start` → redirects to Facebook OAuth dialog |

#### Google Drive panel
- Shows Drive connection status (Connected/Disconnected/Not connected)
- Shows connected email
- "Open Drive Browser" button

---

### 5.11 Analytics Page `/analytics`

**File:** `apps/web/src/pages/AnalyticsPage.tsx`

**Purpose:** Manual like-count snapshot tracking. Intentionally minimal ("likes snapshots only").

**Features:**
- List of past snapshots: like count + fetch date
- Form: Instagram Account ID, Post Draft ID, Like Count → `POST /analytics/likes`
- Data sorted newest first, limit 100

**Status:** Stub/MVP — requires manual data entry, no auto-fetching from IG API.

---

## 6. Backend Services — Full Feature Breakdown

### 6.1 AI Service

**File:** `apps/api/src/services/ai.service.ts`

| Function | Description |
|---|---|
| `suggestHashtagsFromCaption(caption)` | Basic fallback — tokenizes caption, picks unique words >3 chars, returns first 8 as `#tags` |
| `suggestHashtagsWithAI(caption)` | Calls Gemini 2.5 Flash to generate 12–15 trending hashtags; falls back to basic if key missing or API fails |
| `generateInstagramCaptionFromMedia(input)` | Sends base64-encoded media + prompt to Gemini; returns `{ caption, hashtags }` |

**Gemini model:** `gemini-2.5-flash`  
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

**Caption prompt instructions:**
- Natural human language
- Mention location if visible
- 2–4 short lines
- End with subtle CTA
- Returns only caption text (no extra commentary)

**Hashtag prompt:** Asks for 12–15 mixed popular+niche tags, space-separated.

**Size limit:** Media must be ≤10MB for inline base64 submission to Gemini.

---

### 6.2 Instagram Service

**File:** `apps/api/src/services/instagram.service.ts`

Handles all Meta Graph API interactions.

| Function | Description |
|---|---|
| `ensureFacebookConfigured()` | Validates env vars; detects if `APP_SECRET` looks like an access token |
| `signFacebookState(payload)` | JWT-signs `{ businessId, userId, frontendOrigin }` as OAuth state (15-min expiry) |
| `verifyFacebookState(state)` | Verifies state JWT, checks `purpose = "facebook_oauth"` |
| `getFacebookOAuthUrl(state)` | Builds Facebook dialog URL with required scopes |
| `exchangeFacebookCode(code)` | Short-lived → long-lived token exchange (two-step) |
| `fetchConnectedInstagramAccounts(accessToken)` | Lists user's FB Pages, resolves linked IG accounts (business + connected), does follow-up profile lookups for missing usernames |
| `postSingleMedia(...)` | Creates container → publishes → fetches permalink |
| `postVideoMedia(...)` | Creates container → polls status every 5s up to 24 attempts → publishes → permalink |
| `postReelsMedia(...)` | Same as video but `media_type: "REELS"` |
| `postCarouselMedia(...)` | Creates child containers for each image → creates carousel container → publishes → permalink |
| `resolveCollaboratorIds(...)` | Looks up IG user IDs for collaborator handles via business_discovery |

**Video poll timeout:** 24 attempts × 5s = 120 seconds max (2 minutes).

**Scopes requested:**
- `pages_show_list`
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `business_management`

---

### 6.3 Publish Service

**File:** `apps/api/src/services/publish.service.ts`

`publishDraftById(draftId, actorUserId?)` — the core publish function.

**Flow:**
1. Load `PostDraft` by ID
2. Load associated `InstagramAccount` (needs `accessToken` + `igUserId`)
3. Load associated `MediaAsset[]`
4. Validate `PUBLIC_API_URL` env var
5. For each asset, `resolvePublishUrl()`:
   - If `asset.publicUrl` starts with `http` → use directly
   - If google_drive source → `downloadDriveFileForPublish()` → gets local cached path → prepend `PUBLIC_API_URL`
   - Otherwise → prepend `PUBLIC_API_URL` to relative path
6. Set draft status = `"posting"` before publish attempt
7. Build `captionWithHashtags = caption + "\n\n" + hashtags.join(" ")`
8. Resolve collaborator IDs (if any)
9. Route by post type: reel → reels, video → video, carousel/multiple assets → carousel, else → single
10. On success: set status = `"live"`, save `igMediaId` + `permalink`
11. On failure: set status = `"error"`, re-throw
12. Upsert `PublishJob` record with status `"completed"`

**Key requirement:** `PUBLIC_API_URL` must be set to a publicly accessible URL (e.g. Cloudflare Tunnel) for Instagram to fetch media files.

---

### 6.4 Scheduler Service

**File:** `apps/api/src/services/scheduler.service.ts`

- Starts on server boot via `startScheduler()` in `index.ts`
- Runs `runOnce()` every **60 seconds**
- Queries `PostDraft` where `status = "scheduled"` AND `scheduledFor <= now()`
- For each due draft: calls `publishDraftById(draft._id.toString())`
- Logs success/failure per draft
- Top-level try/catch prevents scheduler crash if DB query fails

---

### 6.5 Google Drive Service

**File:** `apps/api/src/services/google-drive.service.ts`

Handles Drive OAuth flow and file operations.

Key capabilities:
- `oauth/start` → generates Google OAuth URL with Drive scopes
- OAuth callback → exchanges code for tokens, stores in `GoogleDriveConnection`
- `listFolders(businessId, parentFolderId)` → returns folders with `containsImages`/`containsVideos` flags
- `listFiles(businessId, folderId, pageToken?)` → returns paginated files with preview URLs
- `getFolderDetail(businessId, folderId)` → name + metadata for a single folder
- `ensureDriveThumbnailCached(connectionId, businessId, file)` → downloads thumbnail, saves to `uploads/drive-thumbnails/{businessId}/{fileId}.jpg`, returns local path
- `downloadDriveFileForPublish(connectionId, businessId, driveFileId, mimeType)` → downloads full file to `uploads/publish-cache/{businessId}/{fileId}.ext`, returns local path

---

### 6.6 Smart Timing Service

**File:** `apps/api/src/services/smart-timing.service.ts`

`suggestSmartTime(businessId)` — suggests the next optimal posting time.

Logic:
- Loads business timezone
- Looks at existing scheduled/live posts to find gaps
- Returns `{ suggestedFor: Date }` pointing to a future slot

Used by `createDraft` and `schedulePost` controllers.

---

### 6.7 Audit Service

**File:** `apps/api/src/services/audit.service.ts`

`createAuditLog({ actorUserId, businessId, action, entityType, entityId })` — writes to `AuditLog` collection.

Actions logged: `media.uploaded`, `media.imported_from_drive`, `media.workflow_updated`, `media.ai_caption_generated`, `media.deleted`, `post_draft.created`, `post.published`, `post_draft.deleted`.

---

## 7. API Routes Summary

### Auth Routes (`/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/bootstrap` | Create first admin (one-time) |
| POST | `/auth/login` | Login, returns JWT + user + memberships |
| GET | `/auth/me` | Validate token, return current user |

### Business Routes (`/businesses`)
| Method | Path | Description |
|---|---|---|
| GET | `/businesses` | List all businesses |
| POST | `/businesses` | Create business |
| POST | `/businesses/members` | Create admin user + membership |

### Media Routes (`/media`)
| Method | Path | Description |
|---|---|---|
| GET | `/media` | List all media assets for businessId |
| GET | `/media/:id` | Get single asset + relatedGroupAssets |
| POST | `/media/upload` | Local file upload (multipart) |
| POST | `/media/import-from-drive` | Import Drive file metadata |
| PATCH | `/media/:id` | Update workflow fields |
| DELETE | `/media/:id` | Delete asset |
| POST | `/media/:id/generate-caption` | AI caption via Gemini |
| POST | `/media/:id/ensure-thumbnail` | Ensure cached thumbnail exists |

### Post Routes (`/posts`)
| Method | Path | Description |
|---|---|---|
| GET | `/posts` | List post drafts for businessId |
| POST | `/posts` | Create post draft |
| PATCH | `/posts/:id` | Update draft (title/caption/hashtags/schedule) |
| DELETE | `/posts/:id` | Delete draft |
| POST | `/posts/:id/schedule` | Schedule a draft |
| POST | `/posts/:id/suggest-hashtags` | AI hashtag suggestion |
| POST | `/posts/:id/publish` | Publish immediately |

### Integrations Routes (`/instagram`, `/google-drive`)
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

### Analytics Routes (`/analytics`)
| Method | Path | Description |
|---|---|---|
| GET | `/analytics/likes` | List like snapshots |
| POST | `/analytics/likes` | Record new snapshot |

---

## 8. Auth & Session System

**Flow:**
1. User logs in → API returns `{ token, user, memberships }`
2. Frontend: `setSession()` in Zustand → sets axios Authorization header → stores `{ token }` in localStorage
3. On page reload: `hydrateMe()` in `App.tsx` useEffect → reads localStorage token → calls `GET /auth/me` → re-populates store
4. `ProtectedRoute` checks if `token` exists in store → if not, redirect to `/login`
5. `clearSession()` removes token from axios, localStorage, and Zustand

**Active Business:** Always defaults to `memberships[0].businessId._id`. Multi-business switching via `setActiveBusinessId()` (saved in localStorage `automation.activeBusinessId`) — but the hydration flow at line 62 in `auth-store.ts` **overrides this** with `memberships[0]` on every reload, ignoring the stored value.

**JWT secret:** Configured in `env.JWT_SECRET`. Tokens are long-lived (no expiry set in login — check `utils/auth.ts`).

---

## 9. State Management

**Zustand store** (`auth-store.ts`):
- `token` — JWT
- `user` — `SessionUser` (id, name, email, globalRole)
- `memberships` — array of `Membership` with nested `Business`
- `activeBusinessId` — currently selected workspace
- `setSession`, `clearSession`, `setActiveBusinessId`, `hydrateMe`

**TanStack Query v5** — all server data:
| Query Key | Data |
|---|---|
| `["queue-overview", businessId]` | All media (for Dashboard + Drive Browser counts) |
| `["queue", businessId]` | All media (for Queue table) |
| `["media", businessId]` | All media (for Posts page picker) |
| `["queue-detail", id, businessId]` | Single asset detail |
| `["posts", businessId]` | All post drafts |
| `["ig-accounts", businessId]` | Instagram accounts |
| `["drive-connections", businessId]` | Drive connections |
| `["businesses"]` | All businesses |
| `["likes", businessId]` | Like snapshots |
| `["drive-folder-detail", businessId, folderId]` | Folder name |

---

## 10. Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Token signing secret |
| `GEMINI_API_KEY` | Yes | Google AI API key for Gemini |
| `FACEBOOK_APP_ID` | Yes | Meta App ID |
| `FACEBOOK_APP_SECRET` | Yes | Meta App Secret (NOT an access token) |
| `FACEBOOK_REDIRECT_URI` | Yes | Must match Meta app settings exactly |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Google OAuth callback URL |
| `PUBLIC_API_URL` | Yes | Publicly accessible API URL (e.g. Cloudflare Tunnel) for Instagram media |
| `PORT` | No | Default 3001 |
| `UPLOAD_DIR` | No | Default `uploads/` |

### Frontend (`apps/web/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Base URL for API (e.g. `http://localhost:3001`) |

---

## 11. Known Bugs

### BUG-001 — activeBusinessId not restored on reload
**File:** `apps/web/src/store/auth-store.ts:62`  
**Severity:** Medium  
**Description:** `hydrateMe()` always sets `activeBusinessId` to `memberships[0]._id`, ignoring the `localStorage.getItem("automation.activeBusinessId")` value saved by `setActiveBusinessId()`.  
**Impact:** Users with multiple businesses always land on business #0 after a page reload — their last selected business is lost.  
**Fix:**
```typescript
// In hydrateMe(), replace the hardcoded fallback:
activeBusinessId:
  localStorage.getItem("automation.activeBusinessId") ||
  response.data.data.memberships[0]?.businessId?._id
```

---

### BUG-002 — QueueDetailPage Post Type missing "reel"
**File:** `apps/web/src/pages/QueueDetailPage.tsx:254`  
**Severity:** Low  
**Description:** The Post Type selector in Queue Detail only offers `["single", "carousel", "video"]`. The "reel" type exists in the schema and is supported by the publish service but cannot be set from this UI.  
**Fix:** Add `"reel"` to the options array.
```typescript
{["single", "carousel", "video", "reel"].map((value) => (
```

---

### BUG-003 — MediaAsset `updateMediaSchema` missing "reel"
**File:** `apps/api/src/controllers/media.controller.ts:33`  
**Severity:** Medium  
**Description:** `postType` in the update schema is `z.enum(["single", "carousel", "video"])` — it does not accept "reel". Sending `postType: "reel"` from the frontend will cause a Zod validation error.  
**Fix:**
```typescript
postType: z.enum(["single", "carousel", "video", "reel"]).optional(),
```

---

### BUG-004 — DriveBrowserPage `MetricCard` type mismatch
**File:** `apps/web/src/pages/DriveBrowserPage.tsx:571`  
**Severity:** Low  
**Description:** `MetricCard` is called with `subValue` prop (e.g. `<MetricCard label="..." value={...} subValue="..." />`) on lines 563–580, but the `MetricCard` component interface (`line 962`) defines `note?: string` not `subValue`. TypeScript will catch this but the prop is silently ignored in the component body.  
**Fix:** Either rename the prop in usage to `note`, or rename the interface prop to `subValue`.

---

### BUG-005 — `actionError` state referenced but never declared in DriveBrowserPage
**File:** `apps/web/src/pages/DriveBrowserPage.tsx:250`  
**Severity:** High (runtime error)  
**Description:** Inside `connectGoogleDrive()`, the code calls `setActionError("")` and `setActionError(...)`, but there is no `const [actionError, setActionError] = useState("")` declaration anywhere in `DriveBrowserPage`. This will throw a `ReferenceError: setActionError is not defined` at runtime when the user clicks "Connect Drive" or an error occurs.  
**Fix:** Add the state declaration at the top of `DriveBrowserPage`:
```typescript
const [actionError, setActionError] = useState("");
```

---

### BUG-006 — Broken thumbnail repair loop runs without cleanup dependency
**File:** `apps/web/src/pages/PostsPage.tsx:110–138`  
**Severity:** Low  
**Description:** The `useEffect` that repairs broken thumbnails includes `[media, activeBusinessId]` as dependencies but not `queryClient`. ESLint exhaustive-deps would flag this. The `queryClient` reference is stable (won't change) so this is low risk, but the dependency array is technically incomplete.

---

### BUG-007 — Scheduler does not rate-limit concurrent publishes
**File:** `apps/api/src/services/scheduler.service.ts:24–34`  
**Severity:** Medium  
**Description:** If many posts are scheduled at the same time (e.g. 10 posts due at midnight), `publishDraftById` is called sequentially in a `for` loop, but each publish involves waiting for video processing polls (up to 2 minutes each). This could block the scheduler for a very long time. Additionally, video status polling uses `setTimeout` inside an async loop and blocks the entire Node.js event loop effectively.  
**Improvement:** Process due posts in parallel with `Promise.allSettled`, or cap concurrency with a semaphore.

---

### BUG-008 — Post Detail Modal state does not update when `post` prop changes
**File:** `apps/web/src/pages/PostsPage.tsx:738–745`  
**Severity:** Low  
**Description:** Modal form state (`title`, `caption`, etc.) is initialized from `post` prop in `useState()`. If the parent refetches and passes an updated `post` object, the modal does not update its local state — the stale values remain. This means "Save" writes back old values.  
**Fix:** Use `useEffect` to sync state when `post._id` or `post.updatedAt` changes, similar to how `QueueDetailPage` handles `aiCaption`.

---

## 12. Improvement Opportunities

### IMP-001 — Business switcher in AppShell
Currently the AppShell shows the current business name but provides no UI to switch between businesses. `setActiveBusinessId` exists in the store but is never called from the UI.  
**Suggestion:** Add a dropdown or button in the sidebar's user card to select the active workspace.

---

### IMP-002 — Analytics page is a placeholder
The Analytics page requires users to manually type an Instagram Account ID and Post Draft ID to record a like snapshot. There is no auto-fetch from the Instagram API.  
**Suggestion:** Add a "Fetch from Instagram" button that calls `GET /{igMediaId}?fields=like_count,reach` via the Graph API for each live post.

---

### IMP-003 — No pagination on Content Queue
The queue table fetches all `MediaAsset` records at once. For a business with 1,000+ assets this will be slow.  
**Suggestion:** Add server-side pagination (limit/offset or cursor-based) to `GET /media`.

---

### IMP-004 — No pagination on Posts page
Same issue — `GET /posts` returns all drafts with `populate()` on two relations. Expensive at scale.

---

### IMP-005 — Toast system is functional but DriveBrowserPage has a missing display
`DriveBrowserPage` calls `toast()` from `useToast` but the `actionError` state (BUG-005) error message set in `connectGoogleDrive` is not rendered anywhere in the JSX — it should be shown inline near the Connect button.

---

### IMP-006 — Caption generation only uses the first selected media asset
**File:** `apps/web/src/pages/PostsPage.tsx:1170`  
When generating AI captions in the CreateDrawer, only `selectedMediaIds[0]` is used, regardless of how many media items are selected. For carousel posts, analyzing all images would produce better captions.

---

### IMP-007 — PublishJob records are created but never fully used
`PublishJob` model is created on schedule and updated on publish completion, but there is no UI to view publish job history or retry failed jobs. The `status` field supports `"queued"`, `"in_progress"`, `"completed"`, `"failed"` but only `"queued"` and `"completed"` are set in code. `"failed"` is never set.

---

### IMP-008 — Smart timing service needs visible output
`suggestSmartTime` runs every time a draft is created but the result is stored in `smartTimingSuggestedFor`. There is no UI showing users what time was suggested or why. The Posts page shows the user-set `scheduledFor` but not the system suggestion.

---

### IMP-009 — No refresh token rotation for Google Drive
Drive tokens are long-lived but may expire. There is no token refresh logic in the google-drive service beyond what googleapis library handles automatically. Expired tokens silently fail; users must reconnect manually.

---

### IMP-010 — Drive thumbnail cache is permanent and grows unbounded
`uploads/drive-thumbnails/` and `uploads/publish-cache/` directories are never cleaned. High-volume usage will fill disk over time.  
**Suggestion:** Add a cleanup job or TTL-based eviction for publish-cache.

---

## 13. Low-Level Code Issues

### CODE-001 — `toInputDateTime` duplicated in two files
`apps/web/src/pages/QueuePage.tsx:402` and `apps/web/src/pages/QueueDetailPage.tsx:445` both define the exact same `toInputDateTime(value)` function.  
**Fix:** Extract to `apps/web/src/lib/media.ts` (alongside `formatSchedule`, `getMediaPreviewUrl`, etc.) and import from there.

---

### CODE-002 — `findPreviewUrl` in PostsPage is duplicated logic
`apps/web/src/pages/PostsPage.tsx:43–56` — `findPreviewUrl()` handles multiple fallbacks (full media lookup, previewUrl, driveThumbnailLink, publicUrl). Similar logic exists in `apps/web/src/lib/media.ts:getMediaPreviewUrl()`. The PostDraft object's nested `mediaAssetIds` have different fields than `MediaAsset`, necessitating the custom function, but the fallback chain is not unified.

---

### CODE-003 — `any` types in PostsPage CreateDrawer
`apps/web/src/pages/PostsPage.tsx:1277` — `accounts.map((acc: any) =>` and other usages of `any` for account objects. The `InstagramAccount` type exists implicitly but is not exported as a frontend type.  
**Fix:** Define `InstagramAccount` in `apps/web/src/lib/types.ts`.

---

### CODE-004 — Facebook Graph URL builder passes undefined values in URLSearchParams
`apps/api/src/services/instagram.service.ts:57–70` — `buildFacebookGraphUrl()` uses `if (value)` to skip undefined params, but empty strings (`""`) would also be skipped. More importantly, query parameters like `collaborator_tags` are passed as part of the query string in GET-style even for POST requests, which is correct for Meta API but not standard REST. This is intentional but worth documenting.

---

### CODE-005 — `window.confirm` used for destructive actions in Queue
`apps/web/src/pages/QueuePage.tsx:63` — Uses native browser `confirm()` dialog. This is inconsistent with the rest of the UI (which uses toasts) and cannot be styled. On some browsers/environments it may be blocked.  
**Fix:** Replace with an inline confirmation UI similar to the PostDetailModal's delete confirm pattern.

---

### CODE-006 — `DriveBrowserPage` has 1,069 lines — should be split
The page handles OAuth state, folder tree, file grid, bulk import, and infinite scroll in one file. Extract sub-components:
- `DriveOAuthPanel` (connect/disconnect buttons + status)
- `FolderTreePanel` (sidebar)
- `DriveFileGrid` (main content area)
- `DriveImportToolbar` (selection actions bar)

---

### CODE-007 — Scheduler `setTimeout` inside async while loop blocks the event loop
`apps/api/src/services/instagram.service.ts:402–418` — The video polling loop uses `await new Promise(resolve => setTimeout(resolve, 5000))` inside a `while` loop. This blocks the async function for up to 2 minutes. If multiple video posts are scheduled at the same time, each blocks sequentially.  
**Fix:** Decouple video processing status checks from the synchronous publish flow; use a polling model with exponential backoff.

---

### CODE-008 — `setSession` in auth-store does not persist `activeBusinessId` if switching
`apps/web/src/store/auth-store.ts:23–31` — `setSession` always overwrites `activeBusinessId` with `memberships[0]`, which means logging in after a `clearSession` also loses any previously saved `activeBusinessId`. The localStorage key is set by `setActiveBusinessId` but never read during `setSession`.

---

### CODE-009 — PostDraft `caption + hashtags` join in publish service can create double newlines
`apps/api/src/services/publish.service.ts:73`  
```typescript
const captionWithHashtags = `${draft.caption}\n\n${draft.hashtags.join(" ")}`.trim();
```
If `draft.caption` is empty and hashtags exist, the result starts with `\n\n`. The `.trim()` removes leading whitespace so the result is fine, but if caption is whitespace-only, the trim produces `hashtags` with no caption — which may not be intended. This is an edge case but worth documenting.

---

### CODE-010 — `MediaAsset` pre-validate hook overrides user-set `postType`
`apps/api/src/models/MediaAsset.ts:80–92` — The pre-validate hook unconditionally sets `postType` based on media type and groupId. This means if a user explicitly sets `postType = "reel"` for a video, the hook overrides it back to `"video"`. Reels cannot be set on `MediaAsset` at all.  
**Fix:** Only infer if `postType` was not explicitly set, or skip inference for `"reel"`.

---

## 14. Recommended Next Features

| Priority | Feature | Complexity |
|---|---|---|
| High | Multi-business switcher in sidebar | Low |
| High | Fix BUG-005 (setActionError crash) | Low |
| High | Fix BUG-001 (activeBusinessId restore on reload) | Low |
| High | Fix BUG-003 (reel in update schema) | Low |
| Medium | Real Instagram analytics fetch (like/reach per post) | Medium |
| Medium | Audit log viewer page | Medium |
| Medium | Post draft bulk scheduling (select multiple, set one time) | Medium |
| Medium | Drive thumbnail cache cleanup job | Low |
| Medium | Queue server-side pagination | Medium |
| Low | Replace `window.confirm` with modal confirms | Low |
| Low | PublishJob history + retry failed jobs UI | High |
| Low | Scheduled post calendar view | High |
| Low | Instagram Story publishing support | High |
| Low | Multi-language caption tone selector | Medium |

---

*End of Documentation*
