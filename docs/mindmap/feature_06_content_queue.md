# Feature 06 — Content Queue (Posts)

## Purpose
- Central planning board for all Instagram post drafts
- Create, edit, schedule, and manually publish posts
- Each PostDraft = one Instagram post (single, carousel, video, or reel)
- Caption + hashtag management with AI suggestions
- Collaborator tagging
- Manual review workflow for failed posts

---

## API Endpoints

### GET `/api/posts`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&status=&page=&limit=`
- **Purpose:** Paginated list of post drafts for a business
- **Returns:** `{ drafts[], total, page }`

### POST `/api/posts`
- **Auth:** JWT + active membership
- **Purpose:** Create a new post draft
- **Body:**
  ```json
  {
    "businessId": "string",
    "instagramAccountId": "string",
    "mediaAssetIds": ["string"],
    "title": "string",
    "caption": "string",
    "hashtags": ["string"],
    "postType": "single | carousel | video | reel",
    "groupId": "string (optional)",
    "scheduledFor": "ISO date (optional)"
  }
  ```
- **Returns:** `{ draft }`

### PATCH `/api/posts/:id`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Update any field on a draft (caption, schedule time, status, collaborators, etc.)
- **Body:** Partial `PostDraft` fields
- **Returns:** `{ draft }`

### DELETE `/api/posts/:id`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Delete a draft and unlink its media assets

### POST `/api/posts/:id/schedule`
- **Auth:** JWT + active membership
- **Purpose:** Set `scheduledFor` datetime and flip status to `"scheduled"`
- **Body:** `{ businessId, scheduledFor: "ISO date" }`
- **Returns:** `{ draft }`
- **Side effect:** Scheduler will auto-publish this draft when `scheduledFor <= now`

### POST `/api/posts/:id/publish`
- **Auth:** JWT + active membership
- **Purpose:** Publish immediately (bypasses scheduler)
- **Body:** `{ businessId }`
- **Returns:** `{ externalPostId, permalink }`
- **Side effect:** Calls full publish pipeline (see Feature 10)

### POST `/api/posts/:id/approve-schedule`
- **Auth:** JWT + active membership
- **Purpose:** Rescue a `manual_review` draft — reset retryCount and reschedule
- **Body:** `{ businessId, scheduledFor: "ISO date" }`
- **Returns:** `{ draft }`

### POST `/api/posts/:id/suggest-hashtags`
- **Auth:** JWT + active membership
- **Purpose:** Ask Gemini to suggest hashtags based on the draft's current caption
- **Body:** `{ businessId }`
- **Returns:** `{ hashtags: string[] }`

### GET `/api/posts/:id/collaborators`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Fetch collaborator accept/decline status from Meta Graph API
- **Returns:** `{ collaborators: [{ username, status, checkedAt }] }`

---

## Data Model

### PostDraft (`postdrafts` collection)

#### Ownership
- `businessId` → Business (indexed)
- `instagramAccountId` → InstagramAccount (indexed)
- `createdBy` → User
- `automationId` → FolderAutomation (set if created by automation)

#### Content
- `mediaAssetIds` → MediaAsset[] (ordered list)
- `title` — internal label
- `caption` — final caption text sent to Instagram
- `hashtags` — String[] (appended after caption on publish)
- `aiCaption` — AI-generated draft caption (user edits before using)
- `postType` — `"single" | "carousel" | "video" | "reel"`
- `groupId` — carousel grouping key

#### Scheduling
- `scheduledFor` — Date (when scheduler publishes)
- `smartTimingSuggestedFor` — Date (AI suggestion, not enforced)

#### Status
- `status` — `"new" | "scheduled" | "posting" | "live" | "error" | "manual_review"`

#### Collaborators
- `collaborators` — String[] (IG handles without @)
- `collaboratorStatus` — `[{ username, status, checkedAt }]`

#### Post-Publish
- `igMediaId` — IG post ID returned by Meta after publish
- `permalink` — `https://instagram.com/p/...`
- `likeCount` — Number
- `reachCount` — Number
- `livePostThumbnailUrl` — fetched from IG Graph API after publish
- `livePostFetchedAt` — Date

#### Error Handling
- `retryCount` — Number (max 2 retries; 3rd failure → manual_review)
- `needsManualReview` — Boolean (indexed)
- `lastError` — last publish error message
- `driveUploadRequested` — Boolean (legacy)

---

## Status State Machine

```
new
 └─ schedule  → scheduled
               └─ (scheduler tick) → posting
                                       ├─ success → live
                                       └─ failure (attempt 1) → scheduled (+5 min)
                                                  (attempt 2) → error / manual_review

manual_review
 └─ approve-schedule → scheduled (reset retryCount)
```

---

## Frontend
- **Page:** `PostsPage.tsx` → route `/posts`
  - List/filter/sort all drafts
  - Status badges (new, scheduled, live, error, manual_review)
  - Quick schedule inline
  - Delete action

- **Page:** `StudioPage.tsx` → route `/studio/:id`
  - Edit caption and hashtags
  - AI caption suggestion panel
  - Set scheduled date/time
  - Add/remove collaborators
  - Publish Now button
  - Manual Review approve + reschedule

---

## Key Rules
- Caption and hashtags are joined at publish time: `caption + "\n\n" + hashtags.join(" ")`
- `postType` determines which Meta API function is called at publish
- Carousel posts require `mediaAssetIds.length > 1` (or explicit `postType: "carousel"`)
- Collaborators stored without `@`; sanitized to remove it before calling IG API
- After 2 publish failures, draft moves to `manual_review` — scheduler will no longer auto-publish it
- If the draft belongs to an automation (`automationId` set) and hits `manual_review`, the automation itself is also paused

---

## Dependencies
- **Auth** (Feature 01) — all routes protected
- **Business** (Feature 02) — all drafts scoped to `businessId`
- **Instagram Integration** (Feature 03) — `instagramAccountId` required on every draft
- **Media Library** (Feature 05) — `mediaAssetIds` references `MediaAsset` records
- **AI Captions** (Feature 09) — `suggest-hashtags` endpoint calls Gemini
- **Publishing Pipeline** (Feature 10) — `publish` and scheduler use `publishDraftById`
- **Scheduler** (Feature 08) — auto-publishes `scheduled` drafts
