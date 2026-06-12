# Feature 11 — Analytics

## Purpose
- Snapshot Instagram like-count and reach data for published posts
- Provide a basic performance view per business
- Generate content reports (post count, engagement trends)

---

## API Endpoints

### GET `/api/analytics`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&from=&to=`
- **Purpose:** List all like-count snapshots for a business in a date range
- **Returns:** `{ snapshots[] }`

### POST `/api/analytics/snapshot`
- **Auth:** JWT + active membership
- **Purpose:** Trigger an on-demand fetch of like/reach counts for all `live` posts in the business
- **Body:** `{ businessId }`
- **Side effects:**
  - Calls `GET /{igMediaId}?fields=like_count,reach` for each published post
  - Creates an `AnalyticsLike` record per post
  - Updates `PostDraft.likeCount` and `PostDraft.reachCount`
- **Returns:** `{ snapshotCount: number }`

### GET `/api/reports`
- **Auth:** JWT + active membership
- **Query:** `?businessId=&from=&to=`
- **Purpose:** Aggregate performance report (posts per status, total likes, reach totals)
- **Returns:** `{ report: { totalPosts, liveCount, scheduledCount, totalLikes, totalReach, byAccount[] } }`

---

## Data Model

### AnalyticsLike (`analyticslikes` collection)
- `businessId` → Business
- `postDraftId` → PostDraft
- `igMediaId` — Instagram post ID
- `likeCount` — Number (snapshot at time of fetch)
- `reachCount` — Number (snapshot at time of fetch)
- `snapshotAt` — Date

---

## External API Used

### Meta Graph API v25.0
- **Like + Reach fetch:** `GET https://graph.facebook.com/v25.0/{igMediaId}?fields=like_count,reach&access_token={token}`
- **Access token:** from the `InstagramAccount` linked to the `PostDraft`

---

## Frontend
- **Page:** `AnalyticsPage.tsx` → route `/analytics`
  - Like count and reach per post
  - Date range filter
  - Per-account breakdown
  - "Take Snapshot Now" button

---

## Key Rules
- Snapshots are point-in-time — they capture engagement at the moment of fetch, not live-streaming data
- Multiple snapshots for the same post over time create a history — useful for trend analysis
- Reach data requires `instagram_manage_insights` scope (separate from publish scope — may not always be available)
- `PostDraft.likeCount` and `MediaAsset.likeCount` are updated alongside the `AnalyticsLike` record so the Content Queue can show engagement inline

---

## Dependencies
- **Auth** (Feature 01) — all routes protected
- **Business** (Feature 02) — all data scoped to `businessId`
- **Instagram Integration** (Feature 03) — `accessToken` used to call Meta Graph API
- **Content Queue** (Feature 06) — updates `PostDraft.likeCount` + `reachCount`
- **Publishing Pipeline** (Feature 10) — only `live` posts are snapshotted
