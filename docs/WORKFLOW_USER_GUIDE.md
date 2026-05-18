# Workflow User Guide

Aa file ma full samjan aapi chhe ke app nu workflow kai rite kaam kare chhe, kai page su kaam mate chhe, ane kai field ma su bharvanu chhe.

> Updated: 2026-05-12

---

## 1. System No Main Idea

Aa product na **2 main workflow** chhe:

### Manual Workflow
```
Connect Drive → Fetch Data → Display Files → Import File → Content Queue → Detail View → Schedule / Post
```

### Automation Workflow
```
Connect Drive → Automations Page → Create Folder Automation → Fetch Now → Auto-captions → Auto-schedule → Publish
```

---

## 2. User Roles

### `super_admin`
- Platform-level user
- Business create kari shake
- Business structure manage kari shake
- Badha businesses joi shake

### `admin`
- Specific business handle kare
- Google Drive connect kare
- Instagram account connect kare
- Files import kare
- Queue manage kare
- Scheduling / posting kare
- **Folder Automations create ane manage kare**

### `user`
- Business na data joi shake where allowed
- Queue/detail workflow ma kaam kari shake depending on access

---

## 3. Full Manual Workflow Step By Step

### Step 1: First Login / Setup

Pehla `super_admin` create karo:
- Open `http://localhost:5173/setup`
- Name, email, password bharo

Pachi login:
- Open `http://localhost:5173/login`

### Step 2: First Business Create Karvu

`super_admin` login pachi:
- `Businesses` page kholo
- Navi business create karo (name, slug, timezone)

Business create karya vagar baki no workflow proper nahi chale.

### Step 3: Admin User Add Karvo

`Businesses` page par:
- Business select karo
- Member add karo → role `admin` → password set karo

Aa admin business-level kaam sambhalse.

**Note:** Badha roles same `/login` page use kare chhe.

### Step 4: Google Drive Connect Karvu

Admin e:
- `Integrations` page kholo (ya Direct `Drive Browser`)
- `Connect Google Drive` karo
- Google account authorize karo

### Step 5: Instagram Account Connect Karvu

Admin e:
- `Integrations` page kholo
- `Connect via Facebook` karo
- Facebook OAuth complete karo
- Connected IG account list ma dekhase

### Step 6: Drive Browser Ma Files Browse Karva

- `Drive Browser` page kholo
- Left sidebar ma folders dekhase
- Folder click karo → right side ma files load thase
- Search, filter, multi-select all available chhe

### Step 7: Queue Ma Import Karvu

- File card par `Import` click karo (single)
- Ya multi-select kari `Import N files` click karo (bulk)
- Aa items `Content Queue` page ma rows tarike dekhase

### Step 8: Queue Table Ma Planning Karvi

Queue page par:
- Same `Group ID` aapo to carousel banavi shakay
- `Status`, `Scheduled Time`, `AI Caption`, `Post Type` manage kari shakay
- Bulk Group ID apply kari shakay (select multiple → type group id → apply)

### Step 9: Detail Page Ma Deep Edit Karvu

Queue row ma `Open` click karo → Queue Detail page khulse.

Detail page ma:
- File preview dekhase (image ya video)
- All metadata fields editable chhe (saves on blur)
- **Generate with Gemini** button → AI caption generate karo
- Related carousel files dekhase niche

### Step 10: Post Banavo ane Schedule Karo

- `Posts` page par jai ne **New Post** create karo
- Ya `Queue Detail` page ma `Create Post` action use karo (pre-filled hoi)
- Caption, hashtags, scheduled time set karo
- `Schedule Post` ya `Save Draft` → pachi `Publish Now` karo

---

## 4. Automation Workflow (Recommended for High Volume)

Jyare tamaro daily volume vadhu hoi (10+ posts per day), automation use karo.

### Step 1: Integrations Check Karo

Confirm karo ke:
- Google Drive connected chhe
- Instagram account connected chhe

### Step 2: Automations Page Kholo

- Left sidebar ma `Automations` click karo

### Step 3: New Automation Create Karo

**Wizard — 3 steps:**

**Step 1 — Source:**
- Drive folder select karo
- Instagram account select karo
- Brand voice / tone set karo (optional, e.g. "playful", "luxury")

**Step 2 — Schedule:**
- `Grouping Mode` select karo:
  - `One per file` — har file alag post
  - `Batch size` — N files ek carousel
  - `Subfolder` — har subfolder ek carousel
- `Cadence Mode` select karo:
  - `Smart` — system smart time choose kare
  - `Interval` — har X hours/days ek post
  - `Daily slots` — specific time slots (e.g. 9am, 2pm, 6pm)

**Step 3 — Preview:**
- Files ni estimated grouping ane schedule preview dekhase
- `Save` click karo

### Step 4: Fetch Now Karo

Automation card par `Fetch Now` click karo.

System:
1. Drive ma new files fetch kare
2. Har image mate Gemini AI caption generate kare
3. Files ne groups ma organize kare
4. PostDrafts create kare with scheduled times
5. Status update kare

### Step 5: Manual Review Items Handle Karo

Jo koi file mate caption generation fail thay:
- File `manual_review` status ma aave
- `Content Queue` ma jai ne caption manually lakhho
- `Posts` page par status `scheduled` set karo

---

## 5. Page Wise Samjan

### 5.1 Dashboard `/`

Quick summary:
- Total files, New, Scheduled, Live, Errors
- Upcoming schedule (next 5 items)

### 5.2 Drive Browser `/drive-browser`

- Google Drive connect/disconnect
- Folder tree sidebar (expand/collapse)
- File grid (4 view modes: Large / Medium / Small / Detailed)
- Multi-select ane bulk import
- Infinite scroll with pagination

### 5.3 Content Queue `/queue`

Master planning table.

Every row = one `MediaAsset`.

| Column | Use |
|---|---|
| File Name | Imported file nu naam |
| Drive File ID | Original Drive file trace karva |
| Status | `new` / `scheduled` / `posting` / `live` / `error` / `manual_review` |
| Group ID | Same value = carousel group (e.g. `summer-01`) |
| Post Type | `single` / `carousel` / `video` / `reel` |
| Scheduled Time | Post kyare live karvani chhe |
| AI Caption | Gemini-generated ya manually entered |
| IG Media ID | Posting pachi attach thay |
| Likes / Reach | Performance metrics |

**Carousel rule:** Same Group ID aapva thi system files ne carousel group ma gane.

### 5.4 Queue Detail `/queue/:id`

Ek specific file ni full detail ane editing.

- Media preview (image / video)
- Badha fields editable (saves on blur)
- **Generate with Gemini** button for AI caption
- Related carousel group files section

### 5.5 Posts Page `/posts`

Instagram publisher — `PostDraft` entities manage karva.

Tabs: All / Draft / Scheduled / Live

Features:
- Create Drawer — new post create karva (media select, caption, schedule)
- Post Detail Modal — existing post edit karva
- Publish Now button
- AI hashtag suggestion

### 5.6 Automations `/automations`

Folder Automations manage karva.

- Stats bar (Total / Running / Paused / Needs Review)
- Automation cards with status, last run info, error message
- **New Automation** wizard
- **Fetch Now** — immediate run trigger
- **Pause / Resume**
- Run history per automation

### 5.7 Businesses `/businesses`

Business create karvu ane members manage karva.

### 5.8 Integrations `/integrations`

- Instagram accounts connect/disconnect
- Google Drive status + link to Drive Browser

### 5.9 Analytics `/analytics`

Manual like-count snapshots. MVP only — no auto-fetch yet.

---

## 6. Field Reference — Shu Bharvanu Kyare

### Import Time (System auto-fill kare)

- file name
- drive file id
- folder id / folder name
- preview url (thumbnail)
- source (local / google_drive)
- media type (image / video)
- mime type

### Queue Planning Time (Team manually bhare)

- status
- group id
- post type
- scheduled time
- ai caption / final caption
- ig media id (after posting)
- likes / reach

### Automation Se Auto-fill Thay

- ai caption (Gemini)
- hashtags (Gemini)
- group id (auto-generated for carousel groups)
- post type (inferred from media + grouping)
- scheduled time (from cadence config)

---

## 7. Common Examples

### Example A: Single Photo Post (Manual)

1. Drive Browser → import `offer-banner.jpg`
2. Queue → Status: `new`, Group ID: blank, Post Type: `single`, Scheduled Time: set
3. Queue Detail → Generate Gemini caption
4. Posts → Create Post → select the image → save/schedule

### Example B: Carousel Post (Manual)

3 images import karo, pachi Queue ma:
- image1 → Group ID: `summer-01`, Post Type: `carousel`
- image2 → Group ID: `summer-01`, Post Type: `carousel`
- image3 → Group ID: `summer-01`, Post Type: `carousel`

Posts page → Create Post → select all 3 → Post Type: Carousel → schedule.

### Example C: Automation — One Post Per File

1. Automations → New Automation
2. Select Drive folder with 20 images
3. Grouping Mode: `One per file`
4. Cadence: `Daily slots` → `["11:00", "17:00"]`
5. Save → Fetch Now
6. System generates 20 captions, creates 20 post drafts at 11am + 5pm alternating

### Example D: Automation — Carousel from Subfolder

Drive folder has 3 subfolders: `Week1/`, `Week2/`, `Week3/`, each with 5 images.

1. Grouping Mode: `Subfolder`
2. Cadence: `Interval` → every 3 days
3. Result: 3 carousels (5 images each), one every 3 days

---

## 8. What Is Still Pending

1. Refresh tokens + session invalidation
2. Invite flow + reset-password
3. Real Instagram analytics auto-fetch (like/reach)
4. Audit log viewer screen
5. Business switcher in AppShell UI
6. Stronger UI RBAC for `user` role
7. Webhook-driven automation trigger (Drive file added → auto-run)

---

## 9. Simple Rules Yaad Rakho

- `Drive Browser` = files shodhva ane import karva
- `Content Queue` = planning and scheduling table
- `Queue Detail` = ek file ni deep detail ane preview
- `Posts` = Instagram publisher — drafts manage karva
- `Automations` = hands-free Drive → Instagram pipeline
- `Businesses` = user/business manage karva
- `Integrations` = account connections (IG + Drive)
- `Analytics` = performance data

---

## 10. Auth Flow Short Version

1. `super_admin` only `/setup` thi create thay
2. Badha roles same `/login` page use kare
3. `admin` ane `user` `Businesses` page thi create thay
4. Member create karta vakhat email + password set karvu jaruri chhe
5. Login pachi role-wise access male chhe
