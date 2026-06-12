# Feature 10 — Instagram Publishing Pipeline

## Purpose
- The single code path for sending content to Instagram, regardless of how it was triggered
- Handles four post types: single image, carousel, video, reel
- Resolves media URLs (local or Drive), fits images to Instagram ratio, then calls Meta Graph API
- Retries twice on failure before moving to manual review
- Creates an audit record (`PublishJob`) for every publish attempt

---

## Trigger Points
The pipeline is always entered through `publishDraftById()`:

| Trigger | Source |
|---|---|
| Manual publish | `POST /api/posts/:id/publish` |
| Scheduled publish | Scheduler tick → `publishDuePosts()` |

---

## Service: `publish.service.ts` — `publishDraftById(draftId, actorUserId?)`

### Step-by-Step Flow

```
publishDraftById(draftId)
  1. Load PostDraft (404 if missing)
  2. Load InstagramAccount (400 if no accessToken or igUserId)
  3. Load MediaAsset[] linked to draft (400 if empty)
  4. draft.status = "posting" → save
  5. For each asset → resolvePublishUrl()
  6. Call IG API function based on postType
  7. On success:
       draft.status = "live"
       draft.igMediaId = externalPostId
       draft.permalink = permalink
       MediaAsset.workflowStatus = "live" (all linked assets)
       Fetch collaborator status (non-blocking)
       Fire-and-forget: fetch IG thumbnail
       If automationId set: handleAutomationDraftCompleted()
  8. On failure:
       retryCount++
       if retryCount < 2 → reschedule +5 min, status = "scheduled"
       if retryCount >= 2 → status = "error", needsManualReview = true
                             if automationId → pause automation (status = "manual_review")
  9. finally: revoke all temporary Drive share permissions
  10. Write PublishJob audit record
```

---

## `resolvePublishUrl(asset)` — Media URL Resolution

Instagram's Graph API fetches media from a URL during container creation. The URL **must be publicly accessible over HTTPS**.

| Asset Source | Media Type | Resolution Strategy |
|---|---|---|
| `google_drive` | `image` | Download locally → apply image fitting → serve via `PUBLIC_API_URL` |
| `google_drive` | `video` | Try `makeFilePublicForPublish()` → fallback: download locally → tunnel URL |
| `local` | `image` | Apply image fitting → serve via `PUBLIC_API_URL` |
| `local` | `video` | Serve via `PUBLIC_API_URL` directly |
| `local` (external URL) | any | Use `asset.publicUrl` directly if it starts with `http` |

---

## Service: `instagram.service.ts` — IG API Functions

### `postSingleMedia(igUserId, accessToken, imageUrl, caption, collaborators?)`
1. `POST /v25.0/{igUserId}/media` — create image container
   - Body: `{ image_url, caption, collaborators }`
2. `POST /v25.0/{igUserId}/media_publish` — publish the container
   - Body: `{ creation_id }`
3. Returns `{ externalPostId, permalink }`

### `postCarouselMedia(igUserId, accessToken, urls[], caption, collaborators?)`
1. For each URL: `POST /v25.0/{igUserId}/media` with `is_carousel_item: true` → get child container ID
2. `POST /v25.0/{igUserId}/media` with `media_type: "CAROUSEL"` + `children: [ids]` → get carousel container ID
3. `POST /v25.0/{igUserId}/media_publish` with carousel container ID
4. Returns `{ externalPostId, permalink }`

### `postVideoMedia(igUserId, accessToken, videoUrl, caption, collaborators?)`
1. `POST /v25.0/{igUserId}/media` with `media_type: "VIDEO"`, `video_url`
2. Poll `GET /v25.0/{containerId}?fields=status_code` every **15 seconds** until `status_code = "FINISHED"` (max 10 attempts)
3. `POST /v25.0/{igUserId}/media_publish` — publish
4. Returns `{ externalPostId, permalink }`

### `postReelsMedia(igUserId, accessToken, videoUrl, caption, collaborators?)`
- Same as `postVideoMedia` but uses `media_type: "REELS"` in step 1

### `fetchCollaboratorStatus(igMediaId, accessToken)`
- `GET /v25.0/{igMediaId}?fields=collaborators` → returns array of `{ username, status }`

### `sanitizeCollaborators(handles)`
- Strips `@` prefix from each handle, filters empty strings

---

## External API Used

### Meta Graph API v25.0
- **Base URL:** `https://graph.facebook.com/v25.0`
- **Create Media Container:** `POST /{igUserId}/media`
- **Publish Container:** `POST /{igUserId}/media_publish`
- **Check Container Status:** `GET /{containerId}?fields=status_code`
- **Fetch Post Thumbnail:** `GET /{igMediaId}?fields=media_url,thumbnail_url`
- **Fetch Collaborators:** `GET /{igMediaId}?fields=collaborators`

---

## Service: `image-fit.service.ts` — `fitForInstagramFeed(inputPath, outputPath)`

Instagram enforces aspect ratio 4:5 (portrait) to 1.91:1 (landscape). Out-of-range images are rejected.

**Algorithm:**
1. Read input image dimensions via Sharp
2. If within allowed ratio → return unchanged dimensions (`wasFitted: false`)
3. If outside → create 1080×1350 canvas (4:5 portrait)
   - Layer 1: blurred, stretched original (background fill)
   - Layer 2: original image resized to fit, centered
4. Output: JPEG at 95% quality to `outputPath`
5. Returns `{ width: 1080, height: 1350, wasFitted: true }`

**Cache:** If `fittedFilePath` already exists on disk, the service skips re-processing.

**Stored on asset:**
- `fittedFilePath` — local path
- `fittedPublicUrl` — `{PUBLIC_API_URL}/uploads/fitted-cache/{businessId}/{assetId}.jpg`
- `fitDimensions` — `{ width, height, wasFitted }`

---

## Data Models

### PublishJob (`publishjobs` collection)
- `businessId` → Business
- `postDraftId` → PostDraft
- `actorUserId` → User (set for manual publishes, absent for scheduler-triggered)
- `status` — `"completed" | "failed"`
- `attempts` — Number
- `processedAt` — Date

---

## Retry Logic

| Attempt | Outcome |
|---|---|
| 1st failure | `retryCount = 1`; `scheduledFor = now + 5min`; `status = "scheduled"` |
| 2nd failure | `retryCount = 2`; `status = "error"`; `needsManualReview = true` |

If the draft belongs to an automation, the automation also moves to `status = "manual_review"` on 2nd failure — it stops spawning new drafts until the user resolves the issue manually.

---

## Key Rules
- `PUBLIC_API_URL` **must be HTTPS** — Instagram rejects non-HTTPS media URLs
- Drive share permissions are always revoked in `finally` — never left open even on failure
- Video containers require polling (`status_code = "FINISHED"`) before publish — typically 30–90 seconds
- Caption + hashtags are joined at publish time: `caption + "\n\n" + hashtags.join(" ")`
- Collaborators are tagged in the media container, not the caption
- Thumbnail fetch is fire-and-forget — never blocks publish success or failure
- `workflowStatus` on every linked `MediaAsset` is updated to `"live"` on success

---

## Dependencies
- **Instagram Integration** (Feature 03) — `accessToken` + `igUserId` from `InstagramAccount`
- **Media Library** (Feature 05) — reads `MediaAsset` records for each draft
- **Google Drive** (Feature 04) — `downloadDriveFileForPublish()` + permission grant/revoke
- **Content Queue** (Feature 06) — reads and updates `PostDraft` status
- **Scheduler** (Feature 08) — calls this service on every tick
- **Folder Automations** (Feature 07) — calls `handleAutomationDraftCompleted()` after success
