# Feature 08 — Background Scheduler

## Purpose
- Heartbeat service that runs every 60 seconds inside the API process
- Publishes all post drafts whose scheduled time has passed
- Triggers pending folder automations
- Exposed as an HTTP endpoint for external cron services (Vercel, etc.)

---

## API Endpoints

### POST `/api/scheduler/run-now`
- **Auth:** JWT required
- **Purpose:** Trigger one full scheduler tick immediately (useful for testing or manual flush)
- **Returns:** `{ postsTriggered: number, automationsTriggered: number }`

### POST `/api/scheduler/cron`
- **Auth:** `x-cron-secret` header (no JWT)
- **Purpose:** External cron trigger (Vercel Cron, cURL, etc.)
- **Header:** `x-cron-secret: <SCHEDULER_SECRET>`
- **Returns:** `{ postsTriggered: number, automationsTriggered: number }`
- **Guard:** If `SCHEDULER_SECRET` env var is set, the header value must match; otherwise the endpoint is open

---

## Service: `scheduler.service.ts`

### `startScheduler()`
- Called once on API boot (`apps/api/src/index.ts`)
- Immediately calls `runNow()` on startup
- Sets `setInterval(runNow, 60_000)` — ticks every 60 seconds

### `runNow()`
Runs two tasks in **parallel** using `Promise.allSettled` (one failing does not block the other):

```
runNow()
  ├─ publishDuePosts()         → publishes scheduled drafts
  └─ runPendingAutomations()   → runs next idle automation
```

Returns: `{ postsTriggered: number, automationsTriggered: number }`

### `publishDuePosts()`
1. Query `PostDraft` where `status = "scheduled"` AND `scheduledFor <= now`
2. Log how many are due
3. Process in batches of **3** using `Promise.allSettled` (concurrent, non-blocking)
4. For each draft: call `publishDraftById()` from `publish.service.ts`
5. Individual failures are caught and logged — do not abort remaining batch

### `runPendingAutomations()`
1. Query `FolderAutomation` where `status = "idle"`, sorted by `priority ASC, createdAt ASC`
2. For each automation, call `hasPendingWork()` — skip if nothing to process
3. Run the first automation with pending work via `runAutomation()` (fire-and-forget)
4. Return after triggering **at most one** automation per tick

---

## Tick Diagram

```
Every 60 seconds:
┌─────────────────────────────────────────────────────────┐
│                      runNow()                           │
│                                                         │
│  ┌──────────────────────┐  ┌───────────────────────┐   │
│  │  publishDuePosts()   │  │ runPendingAutomations()│   │
│  │                      │  │                        │   │
│  │  Find all scheduled  │  │  Find highest-priority │   │
│  │  drafts past due     │  │  idle automation       │   │
│  │  ↓                   │  │  ↓                     │   │
│  │  Batch of 3          │  │  hasPendingWork()?     │   │
│  │  publishDraftById()  │  │  → yes: runAutomation()│   │
│  │  each concurrently   │  │  (fire and forget)     │   │
│  └──────────────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment: External Cron (Vercel)

When the API is hosted on a platform without persistent processes (serverless), the internal `setInterval` won't work. Use the external cron endpoint instead:

**`vercel.json` configuration (example):**
```json
{
  "crons": [
    {
      "path": "/api/scheduler/cron",
      "schedule": "* * * * *"
    }
  ]
}
```

Set `SCHEDULER_SECRET` in both the API host environment and the Vercel project environment to prevent unauthorized triggers.

---

## Environment Variables
- `SCHEDULER_SECRET` — optional; if set, `POST /api/scheduler/cron` requires matching `x-cron-secret` header

---

## Key Rules
- `Promise.allSettled` is used at every level — one failure never blocks others
- Max **3 concurrent publishes** per tick (configurable via `MAX_CONCURRENT` constant in `scheduler.service.ts`)
- Max **1 automation run** per tick — prevents CPU/memory spikes from parallel Drive + AI calls
- The scheduler starts on API boot and does not need to be started manually
- `runNow()` is idempotent — safe to call multiple times; it just queries current DB state

---

## Dependencies
- **Publishing Pipeline** (Feature 10) — calls `publishDraftById()`
- **Folder Automations** (Feature 07) — calls `hasPendingWork()` + `runAutomation()`
- **Content Queue** (Feature 06) — reads `PostDraft` records with `status: "scheduled"`
- **DM Automation** (Feature 12, planned) — will add `processPendingWebhookEvents()` as third parallel task
