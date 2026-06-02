
# Multi-Account Broadcast — Full Implementation Plan

> **Created:** 2026-05-18  
> **Feature:** Post to multiple Instagram accounts with a single post creation flow  
> **Status:** Planning — ready to implement

---

## User Requirements (Confirmed)

| Question | Answer |
|---|---|
| Caption/schedule per account? | **Same for all** — one caption, one schedule, broadcast to all selected accounts |
| Expected account count? | **15+ accounts** — agency scale, grouped by client/category with search |
| If one account fails? | **Publish the rest, flag the failed one** — partial failure tolerance |
| How to display in Studio/Posts? | **Single collapsed row** with account badges, expand to see per-account status |

---

## Architecture Decision

**No change to `PostDraft` data model.** One post per account, all linked by a shared `groupId`.

The `groupId` field **already exists** in `PostDraft` schema — it was clearly planned for this.

```
User creates 1 broadcast
  → API generates 1 groupId (e.g. "grp_abc123")
  → Creates N PostDraft documents — one per selected account
  → All share same groupId, caption, media, schedule
  → Each publishes independently via its own Instagram access token
  → Studio / Posts page groups them into 1 collapsed row by groupId
```

### Why not change `instagramAccountId` to an array?

| Approach | Pro | Con |
|---|---|---|
| Array field on PostDraft | Single document | Complex publish logic, per-account status tracking breaks |
| **N docs + groupId (chosen)** | Existing publish/retry/error logic untouched, per-account status works | More documents in DB |

The `groupId` field existing in the schema is confirmation this was the intended approach.

---

## Phase 1 — Backend (Day 1)

### 1.1 — Update `POST /posts` to accept account array

**File:** `apps/api/src/controllers/post.controller.ts`

**Before:**
```ts
instagramAccountId: z.string().min(1),
```

**After:**
```ts
instagramAccountIds: z.array(z.string().min(1)).min(1),
// Keep single instagramAccountId as alias for backwards compat with automations
```

**New create logic:**
```ts
import { nanoid } from "nanoid";

const {
  instagramAccountIds,
  groupId = instagramAccountIds.length > 1 ? nanoid(12) : undefined,
  ...shared
} = body;

const posts = await PostDraftModel.insertMany(
  instagramAccountIds.map((accountId: string) => ({
    ...shared,
    businessId,
    instagramAccountId: accountId,
    groupId,            // same groupId links all posts in this broadcast
    createdBy: req.user.id,
  }))
);

res.json({ success: true, data: { groupId, posts } });
```

> **Note:** `groupId` is only set when posting to 2+ accounts. Single-account posts have no `groupId` — they render as normal single rows.

---

### 1.2 — Add `tags` to `InstagramAccount` model

**File:** `apps/api/src/models/InstagramAccount.ts`

```ts
// Add one field to the schema
tags: { type: [String], default: [], index: true }
```

This enables the account picker to group accounts by client/category (e.g., "Fashion Clients", "Food & Beverage").

---

### 1.3 — New endpoint: `PATCH /instagram/accounts/:id/tags`

**File:** `apps/api/src/controllers/instagram.controller.ts`

```ts
export const updateAccountTags = asyncHandler(async (req, res) => {
  const { tags } = req.body; // string[]
  const account = await InstagramAccountModel.findOneAndUpdate(
    { _id: req.params.id, businessId: req.body.businessId },
    { tags },
    { new: true }
  );
  if (!account) throw new ApiError(404, "Account not found");
  res.json({ success: true, data: account });
});
```

**File:** `apps/api/src/routes/instagram.routes.ts`

```ts
router.patch("/accounts/:id/tags", requireAuth, updateAccountTags);
```

---

### 1.4 — Verify `GET /posts` returns `groupId`

No change needed. `groupId` is already in the schema and returned by the existing query. Frontend groups client-side.

---

## Phase 2 — `AccountPicker` Component (Day 2)

**New file:** `apps/web/src/components/AccountPicker.tsx`

A reusable, grouped, searchable multi-select component for Instagram accounts.

### UI Design

```
┌─────────────────────────────────────┐
│ 🔍 Search accounts...               │
├─────────────────────────────────────┤
│ ▸ Fashion Clients          [3/5] ✓  │  ← click to expand/collapse group
│   ☑ @client_luxe     Business       │
│   ☑ @client_mode     Business       │
│   ☐ @client_sg       Personal       │
├─────────────────────────────────────┤
│ ▸ Food & Beverage         [0/3]     │
│   ☐ @cafe_main       Business       │
│   ☐ @cafe_branch     Business       │
├─────────────────────────────────────┤
│ ▸ Untagged                [0/2]     │
│   ☐ @mybrand         Business       │
└─────────────────────────────────────┘
  2 accounts selected  ·  Min 1 required
```

### Rules

- Accounts with no tags → "Untagged" group at the bottom
- Clicking group header → select/deselect all accounts in group
- Search filters across all groups in real time (by handle, name, or tag)
- Minimum 1 account must be selected to enable submit
- Selected count shown at bottom: "3 accounts selected"

### Component Props

```tsx
interface AccountPickerProps {
  accounts: InstagramAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxHeight?: number;
}
```

### Grouping Logic

```tsx
const grouped = useMemo(() => {
  const map = new Map<string, InstagramAccount[]>();

  for (const acc of filtered) {
    const tag = acc.tags?.[0] ?? "__untagged__";
    const group = map.get(tag) ?? [];
    group.push(acc);
    map.set(tag, group);
  }

  // Move untagged to end
  const result: Array<{ label: string; accounts: InstagramAccount[] }> = [];
  for (const [label, accounts] of map.entries()) {
    if (label !== "__untagged__") result.push({ label, accounts });
  }
  if (map.has("__untagged__")) {
    result.push({ label: "Untagged", accounts: map.get("__untagged__")! });
  }
  return result;
}, [filtered]);
```

---

## Phase 3 — CreateDrawer Update (Day 3)

**File:** `apps/web/src/pages/PostsPage.tsx` — `CreateDrawer` component

### State change

```tsx
// Before
const [igAccountId, setIgAccountId] = useState(accounts[0]?._id ?? "");

// After
const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
  accounts[0] ? [accounts[0]._id] : []
);
```

### Replace `<select>` with `AccountPicker`

```tsx
// Before — single select dropdown
<select value={igAccountId} onChange={(e) => setIgAccountId(e.target.value)}>
  {accounts.map((acc) => (
    <option key={acc._id} value={acc._id}>
      {acc.name} (@{acc.handle})
    </option>
  ))}
</select>

// After — grouped multi-select
<AccountPicker
  accounts={accounts}
  selectedIds={selectedAccountIds}
  onChange={setSelectedAccountIds}
/>
```

### Update submit mutation

```tsx
return api.post("/posts", {
  businessId,
  instagramAccountIds: selectedAccountIds,   // ← array
  mediaAssetIds: selectedMediaIds,
  title: title.trim(),
  caption: caption.trim(),
  postType,
  scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
});
```

### Validation update

```tsx
if (!selectedAccountIds.length) throw new Error("Select at least one Instagram account");
```

---

## Phase 4 — BroadcastRow Component (Day 4)

**New file:** `apps/web/src/components/BroadcastRow.tsx`

### Collapsed state

```
┌──────────────────────────────────────────────────────┐
│ ☐  🖼  Summer Collection     Scheduled    ▸ 3 accts  │
│       @fashionbrand  @luxestyle  @trendhub           │
│       Jun 10, 9:00 AM                                │
└──────────────────────────────────────────────────────┘
```

### Expanded state

```
┌──────────────────────────────────────────────────────┐
│ ☐  🖼  Summer Collection     Scheduled    ▾ 3 accts  │
│       Jun 10, 9:00 AM                      [Edit]    │
├──────────────────────────────────────────────────────┤
│       @fashionbrand    ● Draft    [Publish]           │
│       @luxestyle       ✓ Live     [View ↗]           │
│       @trendhub        ✗ Error    [Retry]            │
└──────────────────────────────────────────────────────┘
```

### Overall status logic

```tsx
function deriveOverallStatus(posts: PostDraft[]): string {
  const statuses = new Set(posts.map((p) => p.status));
  if (statuses.size === 1) return [...statuses][0];       // all same
  if (statuses.has("error")) return "error";              // any error = error
  if (statuses.has("live") && statuses.has("new")) return "mixed";
  if (statuses.has("scheduled")) return "scheduled";
  return "mixed";
}
```

### Component props

```tsx
interface BroadcastRowProps {
  group: {
    groupId: string;
    posts: PostDraft[];
    overallStatus: string;
  };
  allMedia: MediaAsset[];
  businessId: string;
  selected: boolean;          // selects all posts in group for bulk delete
  onToggle: () => void;
  onRefresh: () => void;
}
```

### Bulk delete handling

Selecting a broadcast row selects ALL posts in the group:

```tsx
// In PostsPage / StudioPage
function toggleBroadcastSelect(groupPosts: PostDraft[]) {
  const ids = groupPosts.map((p) => p._id);
  const allSelected = ids.every((id) => selectedIds.includes(id));
  if (allSelected) {
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  } else {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  }
}
```

---

## Phase 5 — Wire Into PostsPage & StudioPage (Day 5)

**File:** `apps/web/src/pages/PostsPage.tsx`

### Grouping memo

```tsx
const { broadcastGroups, singlePosts } = useMemo(() => {
  const groups = new Map<string, PostDraft[]>();
  const singlePosts: PostDraft[] = [];

  for (const post of filteredPosts) {
    if (post.groupId) {
      const g = groups.get(post.groupId) ?? [];
      g.push(post);
      groups.set(post.groupId, g);
    } else {
      singlePosts.push(post);
    }
  }

  const broadcastGroups = [...groups.entries()].map(([groupId, posts]) => ({
    groupId,
    posts,
    overallStatus: deriveOverallStatus(posts),
    // Sort posts within group by account handle for stable order
    postsOrdered: [...posts].sort((a, b) =>
      (a.instagramAccountId as any)?.handle?.localeCompare(
        (b.instagramAccountId as any)?.handle ?? ""
      ) ?? 0
    ),
  }));

  return { broadcastGroups, singlePosts };
}, [filteredPosts]);
```

### Render

```tsx
<div className="space-y-2">
  {broadcastGroups.map((group) => (
    <BroadcastRow
      key={group.groupId}
      group={group}
      allMedia={media}
      businessId={activeBusinessId ?? ""}
      selected={group.posts.every((p) => selectedIds.includes(p._id))}
      onToggle={() => toggleBroadcastSelect(group.posts)}
      onRefresh={refresh}
    />
  ))}
  {singlePosts.map((post) =>
    viewMode === "list" ? (
      <ListCard key={post._id} post={post} ... />
    ) : (
      <PostCard key={post._id} post={post} ... />
    )
  )}
</div>
```

Apply same grouping logic in **StudioPage** for draft and scheduled stages.

---

## Phase 6 — Integrations Page: Tag Management (Day 6)

**File:** `apps/web/src/pages/IntegrationsPage.tsx`

Add tag editor under each connected Instagram account:

```
┌──────────────────────────────────────────────────────┐
│  @fashionbrand         Business Account   ✓ Active   │
│  Tags: [Fashion Clients ×]  [+ Add tag]              │
├──────────────────────────────────────────────────────┤
│  @luxestyle            Business Account   ✓ Active   │
│  Tags: [Fashion Clients ×]  [+ Add tag]              │
├──────────────────────────────────────────────────────┤
│  @mybrand              Business Account   ✓ Active   │
│  Tags: (none)          [+ Add tag]                   │
└──────────────────────────────────────────────────────┘
```

- Clicking `+ Add tag` opens an inline text input (or dropdown of existing tags)
- Existing tags show as dismissible chips
- Saves via `PATCH /instagram/accounts/:id/tags`
- Tags appear immediately in the AccountPicker inside CreateDrawer

---

## Complete File Change List

| File | Type | Change |
|---|---|---|
| `api/src/models/InstagramAccount.ts` | Backend model | Add `tags: string[]` field |
| `api/src/controllers/post.controller.ts` | Backend controller | Accept `instagramAccountIds[]`, create N docs with shared `groupId` |
| `api/src/controllers/instagram.controller.ts` | Backend controller | Add `updateAccountTags` handler |
| `api/src/routes/instagram.routes.ts` | Backend route | Register `PATCH /accounts/:id/tags` |
| `web/src/components/AccountPicker.tsx` | Frontend component | **New** — grouped, searchable, multi-select account picker |
| `web/src/components/BroadcastRow.tsx` | Frontend component | **New** — collapsed/expanded broadcast group row |
| `web/src/pages/PostsPage.tsx` — `CreateDrawer` | Frontend | Replace `<select>` with `AccountPicker`, update submit to send array |
| `web/src/pages/PostsPage.tsx` — main | Frontend | Add `groupBroadcasts` memo, render `BroadcastRow` |
| `web/src/pages/StudioPage.tsx` | Frontend | Same grouping for draft/scheduled stages |
| `web/src/pages/IntegrationsPage.tsx` | Frontend | Account tag editor UI |
| `web/src/lib/types.ts` | Frontend types | Add `tags` to `InstagramAccount` type, update `PostDraft` if needed |

---

## Day-by-Day Timeline

| Day | Focus | Deliverable |
|---|---|---|
| **Day 1** | Backend API | POST /posts accepts array, InstagramAccount tags, PATCH tags endpoint |
| **Day 2** | AccountPicker component | Grouped, searchable, multi-select UI component |
| **Day 3** | CreateDrawer integration | AccountPicker wired into create flow, submit sends array |
| **Day 4** | BroadcastRow component | Collapsed + expanded row with per-account status and actions |
| **Day 5** | PostsPage + StudioPage | groupBroadcasts memo, BroadcastRow rendered in both pages |
| **Day 6** | Integrations page | Tag editor per account |
| **Day 7** | End-to-end testing | Create → broadcast → per-account status → partial failure → retry |

---

## Edge Cases to Handle

| Scenario | Handling |
|---|---|
| User selects 1 account | Create single PostDraft with no `groupId` (normal flow, no group UI) |
| All accounts in a broadcast go live | Group row shows overall status "Live" |
| Only some accounts go live | Group row shows "Mixed" with expanded view to see which |
| User deletes a broadcast group | Delete all PostDraft docs with that `groupId` |
| Automation creates a post | Still uses single `instagramAccountId` — no change needed |
| Account token expires mid-broadcast | That account's post fails with error, others continue |
| User edits caption after broadcast created | Edit applies only to that account's PostDraft (by design — use Edit per-account) |

---

## Known Constraints

1. **Instagram API** does not allow the same media file to be published to two accounts simultaneously. Each account creates its own media container through its own access token. The existing `publishPost` function already handles this correctly — no changes needed to the publish pipeline.

2. **Media assets are shared** across all accounts in a broadcast (same `mediaAssetIds`). If a media asset is deleted after creating the broadcast, all accounts in the group lose their media.

3. **Caption is shared** — if the user later edits the caption on one account's post, it does not update the other accounts in the group (by design, per the user requirement of "same for all at creation time").

---

*Plan version: 1.0 — ready to implement. Start with Day 1 backend changes.*
