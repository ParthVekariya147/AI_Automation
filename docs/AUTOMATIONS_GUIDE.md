# Folder Automations Guide

> Updated: 2026-05-12

Folder Automations let you point Postlane at a Google Drive folder and have it automatically:

1. Fetch new files
2. Generate AI captions with Gemini
3. Group files into posts (single, carousel, or video)
4. Schedule them to Instagram on a cadence you define

Once set up, a Folder Automation can run hands-free.

---

## How It Works

```
Drive Folder
    │
    ▼
fetchNewAndOrphanedFiles()
    │  — lists all files in the folder
    │  — skips files already imported (by driveFileId)
    │  — also picks up "orphaned" assets (imported but not yet linked to a draft)
    ▼
importFilesToMedia()
    │  — creates MediaAsset records in MongoDB
    │  — downloads + caches thumbnails for images
    ▼
generateCaptionsForBatch()
    │  — sends each image to Gemini 2.5 Flash (base64)
    │  — videos: uses filename as caption title (no Gemini call needed)
    │  — parallel batches up to 4 (capped by available Gemini key count)
    │  — on failure: marks asset manual_review immediately (no retry)
    ▼
groupFiles()
    │  — applies groupingMode (one_per_file / batch_size / subfolder)
    │  — applies carouselMaxSize cap (default 10)
    │  — assigns shared groupId to multi-asset groups
    ▼
PostDraft.create() × N
    │  — one draft per group
    │  — scheduledFor from pickScheduleSlot()
    │  — status: "scheduled" (or "manual_review" if any asset in group failed)
    ▼
triggerNextPendingAutomation()
    — chains the next idle automation by priority
```

---

## Statuses

### Automation Status

| Status | Meaning |
|---|---|
| `idle` | Ready to run |
| `running` | Currently fetching / processing |
| `finished` | Last run completed successfully |
| `paused` | Manually paused — will not auto-run |
| `manual_review` | One or more posts need human review before publishing |

### Asset Workflow Status (from automation)

| Status | Meaning |
|---|---|
| `new` | Imported, awaiting caption generation |
| `scheduled` | Caption generated, draft created and scheduled |
| `posting` | Publish in progress |
| `live` | Published to Instagram |
| `error` | Publish failed |
| `manual_review` | Caption generation failed — needs human review |

---

## Grouping Modes

### `one_per_file` (default)

Every Drive file becomes its own post. Images → single post. Videos → video post.

### `batch_size`

Groups N consecutive files into a carousel. Set `batchSize` to control N. Files beyond the carousel max (10) spill into a new carousel.

### `subfolder`

Groups files by the Drive subfolder they belong to. All images in the same subfolder become one carousel (or multiple carousels if > `carouselMaxSize`).

---

## Cadence Modes

### `smart`

Delegates to the SmartTiming service. It looks at existing scheduled posts and picks gap slots. Best for spreading content naturally.

### `interval`

Posts at fixed intervals. Configure `intervalValue` + `intervalUnit` (minutes / hours / days).

Example: `intervalValue: 8, intervalUnit: "hours"` → post every 8 hours.

### `daily_slots`

Posts at specific times each day. Configure `dailySlots` as an array of `"HH:MM"` strings.

Example: `dailySlots: ["09:00", "13:00", "18:00"]` → 3 posts per day at those times.

Posts fill slots in order. If a day's slots are all filled, it wraps to the next day.

---

## Caption Generation

- **Images:** The image is read from disk, base64-encoded, and sent to Gemini 2.5 Flash.
- **Videos:** Caption is generated from the filename (no Gemini call) since video frames cannot be sent to the Files API inline.
- **Brand voice:** Set `brandVoice` in the automation config (e.g. "playful", "luxury", "minimal") — passed as a tone hint to Gemini.
- **Hashtags:** Gemini generates them alongside the caption. Per-group hashtags are merged from all assets in the group, deduplicated, capped at 15.

### Multi-Key Setup for Parallel Runs

If you have many files per automation run, configure multiple Gemini API keys:

```bash
GEMINI_API_KEY=key1
GEMINI_API_KEY_2=key2
GEMINI_API_KEY_3=key3
```

The system uses up to 4 parallel caption requests, cycling keys and skipping any that return a 429. If all keys are rate-limited, remaining assets are immediately marked `manual_review`.

---

## Manual Review

When caption generation fails for an asset (e.g. file too large, API error, rate limit):

- `captionStatus` = `"failed"`
- `workflowStatus` = `"manual_review"`
- `failedReason` contains the error message

The entire **group** that contains a failed asset gets `status = "manual_review"` on its `PostDraft` — it will not be auto-published.

To recover:
1. Open the failed assets in Content Queue → Queue Detail
2. Write or regenerate the caption manually
3. Set `workflowStatus` back to `"scheduled"`
4. Set `scheduledFor` on the PostDraft via the Posts page

---

## Priority Chaining

Multiple automations in a business run one at a time. When one finishes, `triggerNextPendingAutomation()` auto-starts the next `idle` automation sorted by:
- `priority` (lower = first)
- then `createdAt` (older = first)

This prevents simultaneous Drive API + Gemini calls from the same business overwhelming rate limits.

Set `priority` manually in the automation wizard (or via PATCH).

---

## Fetch Now

Clicking **Fetch Now** on an automation card:

1. Sets the automation to `running`
2. Creates an `AutomationRun` record
3. Runs the full pipeline (fetch → captions → group → schedule)
4. Updates `AutomationRun` with counts (filesImported, groupsCreated, postsScheduled)
5. Sets automation back to `finished` (or `paused` on error)

The Automations page polls every 10 seconds while any automation is running and refreshes the UI automatically.

---

## Preview Before Saving

The automation wizard Step 3 shows a preview without saving:

- Total files found in the folder
- How many are already imported
- How many are new
- Groups (with files and scheduled times) based on your config

This uses `POST /automations/preview` which runs `groupFiles()` and `pickScheduleSlot()` on mock data without touching the database.

---

## Automation Runs History

Each `POST /automations/:id/fetch` creates an `AutomationRun` record:

```
{
  automationId,
  businessId,
  triggeredBy,
  startedAt,
  finishedAt,
  filesImported,
  groupsCreated,
  postsScheduled,
  status: "running" | "completed" | "failed",
  errorLog: [{ step, message, at }]
}
```

View run history via `GET /automations/:id/runs` or on the Automations page (runs panel per card).

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/automations?businessId=...` | List automations |
| POST | `/automations` | Create automation |
| POST | `/automations/preview` | Preview without saving |
| GET | `/automations/next-priority` | Get next available priority number |
| PATCH | `/automations/:id` | Update config |
| DELETE | `/automations/:id` | Delete automation |
| POST | `/automations/:id/fetch` | Trigger immediate run |
| POST | `/automations/:id/pause` | Pause |
| POST | `/automations/:id/resume` | Resume |
| GET | `/automations/:id/runs` | List run history |

---

## Data Model Reference

See [`PROJECT_COMPLETE_DOCS.md`](PROJECT_COMPLETE_DOCS.md) → Section 4 for full field-by-field schema for `FolderAutomation` and `AutomationRun`.

---

## Known Limitations

- **No webhook trigger:** Automations are triggered manually (Fetch Now) or by the scheduler check. There is no Drive webhook that fires on new file uploads. To auto-detect new files, you would need to set up a cron to call `POST /automations/:id/fetch` externally.
- **Video captions are filename-based:** Gemini cannot analyze video frames via the inline API. For better video captions, the Files API (with URI-based upload) would be needed.
- **One automation runs at a time per business:** Sequential chaining by priority. If you have 5 automations and add 100 files each, they process one after another.
- **Reels not auto-inferred:** The `MediaAsset` pre-validate hook sets videos to `postType = "video"`. Reels must be set manually.
