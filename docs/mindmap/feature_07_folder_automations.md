# Feature 07 — Folder Automations

## Purpose
- Watch a Google Drive folder and automatically import files, generate AI captions, group them into posts, and schedule publishing — with zero manual work
- Each automation is a persistent rule tied to a business + Drive folder + Instagram account
- Runs on every scheduler tick if there are unprocessed files

---

## API Endpoints

### GET `/api/automations`
- **Auth:** JWT required
- **Query:** `?businessId=`
- **Purpose:** List all automations for a business
- **Returns:** `{ automations[] }`

### POST `/api/automations`
- **Auth:** JWT required
- **Purpose:** Create a new folder automation
- **Body:**
  ```json
  {
    "businessId": "string",
    "folderId": "Drive folder ID",
    "folderName": "string",
    "igAccountId": "InstagramAccount ID",
    "groupingMode": "one_per_file | batch_size | subfolder",
    "batchSize": 3,
    "cadenceMode": "interval | daily_slots | smart",
    "intervalValue": 5,
    "intervalUnit": "minutes | hours | days",
    "dailySlots": ["09:00", "14:00", "18:00"],
    "brandVoice": "string (optional)",
    "useEmojis": true,
    "collaborators": ["handle1"],
    "reprocessImported": false,
    "priority": 100
  }
  ```
- **Returns:** `{ automation }`

### POST `/api/automations/preview`
- **Auth:** JWT required
- **Purpose:** Preview what an automation config would import without saving anything
- **Body:** Same as create
- **Returns:** `{ files[], estimatedPosts, schedule[] }`

### GET `/api/automations/next-priority`
- **Auth:** JWT required
- **Query:** `?businessId=`
- **Purpose:** Returns `max(existing priority) + 10` as suggested priority for a new automation
- **Returns:** `{ priority: number }`

### PATCH `/api/automations/:id`
- **Auth:** JWT required
- **Purpose:** Update any field on an existing automation (config, status, cadence, etc.)
- **Body:** Partial `FolderAutomation` fields

### DELETE `/api/automations/:id`
- **Auth:** JWT required
- **Purpose:** Delete an automation (does not delete already-created drafts)

### POST `/api/automations/:id/fetch`
- **Auth:** JWT required
- **Purpose:** Trigger an automation run immediately (does not wait for scheduler)
- **Returns:** `{ status, postsCreated, filesProcessed }`

### POST `/api/automations/:id/pause`
- **Auth:** JWT required
- **Purpose:** Set `status: "paused"` — scheduler will skip this automation
- **Returns:** `{ automation }`

### POST `/api/automations/:id/resume`
- **Auth:** JWT required
- **Purpose:** Set `status: "idle"` — scheduler will pick it up again
- **Returns:** `{ automation }`

### GET `/api/automations/:id/runs`
- **Auth:** JWT required
- **Purpose:** List run history for an automation (audit trail)
- **Returns:** `{ runs[] }`

---

## Data Models

### FolderAutomation (`folderautomations` collection)

#### Identity
- `businessId` → Business (indexed)
- `folderId` — Google Drive folder ID
- `folderName` — Display name
- `igAccountId` → InstagramAccount
- `createdBy` → User

#### Grouping
- `groupingMode` — `"one_per_file" | "batch_size" | "subfolder"`
  - `one_per_file`: each file becomes its own post
  - `batch_size`: N files grouped into one carousel
  - `subfolder`: files in the same Drive sub-folder form one carousel
- `batchSize` — used with `batch_size` mode
- `carouselMaxSize` — max images per carousel (default 10)

#### Scheduling (Cadence)
- `cadenceMode` — `"interval" | "daily_slots" | "smart"`
- `intervalValue` + `intervalUnit` — used with `interval` mode (e.g. every 5 hours)
- `dailySlots` — used with `daily_slots` mode (e.g. `["09:00", "14:00"]`)

#### AI Config
- `captionMode` — `"auto"` (Gemini always)
- `brandVoice` — injected into Gemini prompt
- `useEmojis` — Boolean
- `collaborators` — String[] (IG handles, tagged on every post)
- `reprocessImported` — Boolean (re-caption already-imported files)

#### State
- `status` — `"idle" | "running" | "finished" | "paused" | "manual_review"` (indexed)
- `priority` — Number, lower runs first (indexed)
- `lastFetchedAt` — Date
- `finishedAt` — Date
- `lastRunError` — String

#### Indexes
- `{ businessId: 1 }` — list queries
- `{ status: 1 }` — scheduler query
- `{ priority: 1 }` — sort order
- `{ businessId: 1, status: 1, priority: 1 }` — compound for scheduler

### AutomationRun (`automationruns` collection)
- `automationId` → FolderAutomation
- `businessId` → Business
- `status` — `"success" | "error" | "partial"`
- `filesFound` — Number
- `filesProcessed` — Number
- `postsCreated` — Number
- `errorMessage` — String
- `startedAt` — Date
- `finishedAt` — Date

---

## Service: `folder-automation.service.ts`

### `runAutomation(automationId, triggeredBy)`
Full execution flow:
1. Set `status = "running"`
2. List files from Drive folder via `google-drive.service.ts`
3. Filter out already-imported files (unique index on `(businessId, driveFileId)`)
4. Group files based on `groupingMode`
5. For each group:
   - Download/read media bytes
   - Call Gemini (`ai.service.ts`) to generate caption + hashtags
   - Create `MediaAsset` records
   - Compute `scheduledFor` based on `cadenceMode`
   - Create `PostDraft` with `automationId` set
6. Set `status = "idle"` (or `"finished"` if folder fully drained)
7. Write `AutomationRun` record

### `hasPendingWork(automation)`
- Checks if the Drive folder still has unprocessed files
- Used by scheduler to decide whether to run this automation

### `handleAutomationDraftCompleted(automationId)`
- Called by publish service when an automation-linked draft goes `live`
- Checks if all drafts for this automation are `live` → if yes, sets automation `status = "finished"`

---

## Cadence Modes

| Mode | Behaviour |
|---|---|
| `interval` | Next post = last scheduled post + interval (e.g. every 6 hours) |
| `daily_slots` | Posts fill the next available slot from `dailySlots` array (wraps to next day) |
| `smart` | Calls `smart-timing.service.ts` to suggest optimal time based on analytics |

---

## Priority System
- Lower number = runs first in each scheduler tick
- `GET /api/automations/next-priority` returns `max + 10` for new automations
- Only one automation runs per scheduler tick to avoid resource contention

---

## Status State Machine

```
idle
 └─ scheduler tick / fetch-now → running
                                   ├─ success → idle (more files) or finished (folder empty)
                                   └─ error   → idle (logged in AutomationRun)

idle / running
 └─ pause → paused
              └─ resume → idle

idle / running
 └─ draft publish fails 2x → manual_review (automation paused automatically)
                                └─ user resolves draft → resume → idle
```

---

## Frontend
- **Page:** `AutomationsPage.tsx` → route `/automations`
  - List automations with status badges
  - Create automation wizard (folder picker → cadence → caption settings)
  - Pause / Resume / Delete per automation
  - "Run Now" button
  - Run history modal

---

## Key Rules
- `reprocessImported: false` (default) means the same Drive file is never imported twice
- If an automation-linked draft fails 2x at publish, the **automation is paused** automatically (not just the draft)
- Only one automation runs per 60-second scheduler tick
- `carouselMaxSize` hard cap: 10 images per carousel (Instagram limit)
- Gemini key rotation happens inside `ai.service.ts` — the automation service doesn't need to know about it

---

## Dependencies
- **Auth** (Feature 01) — all routes protected
- **Business** (Feature 02) — all automations scoped to `businessId`
- **Google Drive** (Feature 04) — reads Drive folder contents
- **Media Library** (Feature 05) — creates `MediaAsset` records
- **AI Captions** (Feature 09) — generates captions for each group
- **Content Queue** (Feature 06) — creates `PostDraft` records
- **Scheduler** (Feature 08) — triggers automation execution on each tick
- **Publishing Pipeline** (Feature 10) — `handleAutomationDraftCompleted` called after each publish
