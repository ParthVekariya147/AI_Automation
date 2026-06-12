# Feature 12 — DM Automation (Planned)

## Purpose
- Watch for comments containing a trigger keyword on a client's Instagram posts
- Automatically send a pre-drafted Direct Message (DM) to whoever comments the keyword
- Ingest Meta webhook events without blocking the web server
- Process events asynchronously via the existing background scheduler

---

## Phases

```
Phase 1: Config    → Client defines keyword + DM rule
Phase 2: Ingestion → Meta sends webhook → fast write + 200 OK
Phase 3: Execution → Scheduler processes pending events async
Phase 4: Edge Cases → Self-reply guard + duplicate dedup
```

---

## New API Endpoints

### DM Automation Rules — `/api/dm-automations`

#### GET `/api/dm-automations`
- **Auth:** JWT required
- **Query:** `?businessId=`
- **Purpose:** List all DM automation rules for a business
- **Returns:** `{ automations[] }`

#### POST `/api/dm-automations`
- **Auth:** JWT required
- **Purpose:** Create a new DM automation rule
- **Body:**
  ```json
  {
    "businessId": "string",
    "instagramAccountId": "string",
    "triggerKeyword": "INFO",
    "replyMessage": "Here is the link you requested!",
    "isActive": true
  }
  ```
- **Returns:** `{ automation }`

#### PATCH `/api/dm-automations/:id`
- **Auth:** JWT required
- **Purpose:** Update keyword, message, or toggle `isActive`
- **Body:** Partial `DmAutomation` fields

#### DELETE `/api/dm-automations/:id`
- **Auth:** JWT required
- **Purpose:** Delete a rule permanently

---

### Webhook Endpoint — `/api/webhook/instagram`

#### GET `/api/webhook/instagram`
- **Auth:** None (public — Meta verification handshake)
- **Query:** `?hub.mode=subscribe&hub.challenge=<token>&hub.verify_token=<secret>`
- **Purpose:** One-time Meta webhook verification — echo back `hub.challenge` if `hub.verify_token` matches env var
- **Returns:** `hub.challenge` value as plain text

#### POST `/api/webhook/instagram`
- **Auth:** None (public — Meta sends without JWT)
- **Header:** `x-hub-signature-256: sha256=<HMAC>`
- **Purpose:** Receive comment events from Meta; write to `WebhookEvent` queue; respond immediately
- **Flow:**
  1. `verify-meta-signature` middleware validates HMAC (returns `403` if invalid)
  2. Parse body → extract all `comment` entries
  3. For each comment: `WebhookEvent.create(...)` — duplicate `commentId` silently fails (unique index)
  4. `res.sendStatus(200)` — **always**, even if some events were skipped
- **Response time target:** < 500ms (Meta requires response within 20 seconds)

---

## New Data Models

### DmAutomation (`dmautomations` collection)

| Field | Type | Notes |
|---|---|---|
| `businessId` | ObjectId → Business | indexed |
| `instagramAccountId` | ObjectId → InstagramAccount | which IG page to watch |
| `triggerKeyword` | String | e.g. `"INFO"` — matched case-insensitively |
| `replyMessage` | String | DM text sent to the commenter |
| `isActive` | Boolean | pause without deleting |
| `createdBy` | ObjectId → User | |
| `totalDmsSent` | Number | usage counter for billing analytics |

### WebhookEvent (`webhookevents` collection)

| Field | Type | Notes |
|---|---|---|
| `commentId` | String | **unique index** — deduplication guard |
| `igPageId` | String | Instagram page that received the comment |
| `commenterId` | String | IG User ID of the commenter |
| `commentText` | String | raw comment text |
| `rawPayload` | Mixed | full Meta JSON (for debugging) |
| `status` | `"pending" \| "processing" \| "processed" \| "failed" \| "skipped"` | |
| `failReason` | String | error message if `status = "failed"` |
| `processedAt` | Date | |

**Index:** `{ status: 1, createdAt: 1 }` — scheduler query

---

## New Files to Create

```
apps/api/src/
├── models/
│   ├── DmAutomation.ts
│   └── WebhookEvent.ts
├── controllers/
│   ├── dm-automation.controller.ts
│   └── webhook.controller.ts
├── routes/
│   ├── dm-automation.routes.ts
│   └── webhook.routes.ts
├── services/
│   └── dm-automation.service.ts
└── middlewares/
    └── verify-meta-signature.ts

apps/web/src/pages/
└── DmAutomationsPage.tsx
```

---

## New Middleware: `verify-meta-signature.ts`

Meta signs every webhook POST with `x-hub-signature-256: sha256=<value>`.

**Requirement:** The request body must be read as **raw bytes** (not parsed JSON) for the HMAC to match.

```
Route setup:
  POST /api/webhook/instagram
    → express.raw({ type: 'application/json' })   ← read raw body
    → verify-meta-signature middleware              ← HMAC check
    → webhook.controller (parse body manually)
```

**HMAC computation:**
```
expectedSignature = "sha256=" + HMAC-SHA256(rawBody, FACEBOOK_APP_SECRET)
receivedSignature = req.headers["x-hub-signature-256"]
if (expectedSignature !== receivedSignature) → res.status(403)
```

No new env var needed — uses existing `FACEBOOK_APP_SECRET`.

---

## New Service: `dm-automation.service.ts`

### `processPendingWebhookEvents()`
Called by the scheduler on every tick.

```
1. Find WebhookEvents where status = "pending", limit 10, oldest first
2. Set each to status = "processing" (prevents double-pickup)
3. For each event:
   a. Extract: igPageId, commenterId, commentText

   b. EDGE CASE — Self-reply trap:
        if (commenterId === igPageId) → mark "skipped", continue
        (prevents bot DMing the page owner when they comment on their own post)

   c. Find active DmAutomation:
        query: { instagramAccountId.igUserId = igPageId, isActive: true }
        if none → mark "skipped", continue

   d. Keyword match:
        if (!commentText.toLowerCase().includes(rule.triggerKeyword.toLowerCase()))
          → mark "skipped", continue

   e. Load InstagramAccount → get accessToken

   f. Send DM via Meta Graph API:
        POST /v25.0/me/messages
        Body: { recipient: { id: commenterId }, message: { text: replyMessage } }

   g. On success:
        mark "processed"
        DmAutomation.totalDmsSent++

   h. On Meta API error:
        mark "failed", store failReason
```

---

## Scheduler Integration

Add `processPendingWebhookEvents()` as a third parallel task in `scheduler.service.ts`:

```typescript
// scheduler.service.ts — runNow()
const [postsResult, autoResult, dmResult] = await Promise.allSettled([
  publishDuePosts(),
  runPendingAutomations(),
  processPendingWebhookEvents(),   // ← add this
]);
```

---

## External API Used

### Meta Graph API v25.0

#### Webhook Subscription Setup (one-time, in Meta Developer portal)
- Webhook URL: `https://<your-domain>/api/webhook/instagram`
- Object: `instagram`
- Fields to subscribe: `comments`
- Verify token: set as env var `WEBHOOK_VERIFY_TOKEN`

#### Send DM
- **Endpoint:** `POST https://graph.facebook.com/v25.0/me/messages`
- **Auth:** `?access_token={accessToken}`
- **Body:**
  ```json
  {
    "recipient": { "id": "<commenterId>" },
    "message": { "text": "<replyMessage>" }
  }
  ```
- **Required permission:** `instagram_manage_messages`

#### Webhook Event Payload (inbound from Meta)
```json
{
  "object": "instagram",
  "entry": [{
    "id": "<igPageId>",
    "changes": [{
      "field": "comments",
      "value": {
        "id": "<commentId>",
        "text": "I want more INFO",
        "from": { "id": "<commenterId>", "username": "follower123" },
        "media": { "id": "<postId>" }
      }
    }]
  }]
}
```

---

## Edge Cases (Phase 4 Safety Nets)

| Edge Case | Detection | Resolution |
|---|---|---|
| Self-reply | `commenterId === igPageId` | Mark `"skipped"`, do not DM |
| Duplicate webhook event | `commentId` unique index on `WebhookEvent` | Second insert throws `MongoServerError 11000`; silently ignored |
| No matching rule | Query returns null | Mark `"skipped"` |
| Keyword not found | Case-insensitive `includes` fails | Mark `"skipped"` |
| Meta API error on DM send | Non-200 response | Mark `"failed"`, store `failReason` |
| Meta timeout (> 20s) | Handled by fast write + immediate `200 OK` | Processing is always async |

---

## New Environment Variables
- `WEBHOOK_VERIFY_TOKEN` — arbitrary secret used in Meta webhook verification handshake
- No other new vars — `FACEBOOK_APP_SECRET` (already exists) is reused for HMAC verification

---

## New Instagram Permission Required
- `instagram_manage_messages` — must be added to the Meta app and to `FACEBOOK_SCOPES` env var

---

## Frontend
- **Page:** `DmAutomationsPage.tsx` → route `/dm-automations`
  - List DM rules per business
  - Create form: select IG account + enter keyword + draft DM text
  - Toggle `isActive` per rule
  - Show `totalDmsSent` counter per rule
  - Delete rule

---

## Files to Modify (Existing)

| File | Change |
|---|---|
| `routes/index.ts` | Mount `/webhook` (public, before requireAuth) and `/dm-automations` |
| `services/scheduler.service.ts` | Add `processPendingWebhookEvents()` to `runNow()` |
| `config/env.ts` | Add `WEBHOOK_VERIFY_TOKEN` to Zod schema |
| `apps/web/src/app/` (router) | Add `/dm-automations` route pointing to new page |

---

## Dependencies
- **Auth** (Feature 01) — protects `/dm-automations` CRUD routes
- **Business** (Feature 02) — rules scoped to `businessId`
- **Instagram Integration** (Feature 03) — `igUserId` used to match webhook events to rules; `accessToken` used to send DMs
- **Scheduler** (Feature 08) — triggers `processPendingWebhookEvents()` every 60 seconds
