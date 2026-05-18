# Phase 1 Setup Guide

> Updated: 2026-05-12

## What's Already Built

- Monorepo structure (Express API + React Web)
- MongoDB models: User, Business, Membership, MediaAsset, PostDraft, InstagramAccount, GoogleDriveConnection, PublishJob, AuditLog, AnalyticsLike, **FolderAutomation, AutomationRun**
- JWT auth + role-based access (`super_admin`, `admin`, `user`)
- Google Drive OAuth + file browsing + thumbnail cache
- Instagram OAuth + full publish flow (single, carousel, video, reel)
- Background scheduler (60-second tick)
- Gemini AI caption generation (multi-key support for parallel automation runs)
- Image aspect-ratio fitting via Sharp (blur-padded background)
- **Folder Automations** — watch Drive folder → AI captions → group files → auto-schedule posts
- Content Queue, Queue Detail, Drive Browser, Posts, Integrations, Businesses, Analytics pages
- Automations page with wizard UI, run history, pause/resume, Fetch Now

## Pending Before Production-Ready

1. Refresh tokens + session invalidation
2. Invite flow + reset-password flow
3. Token encryption at rest
4. Real Instagram analytics auto-fetch (like/reach via Graph API)
5. Audit log viewer screen
6. Business switcher in AppShell UI (store method exists, no UI)
7. Role-aware UI restrictions for `user` role (backend is correct; frontend needs tightening)
8. Production deployment config (permanent Cloudflare tunnel or cloud host)
9. Publish-cache and thumbnail-cache cleanup job

---

## Login Flow

### 1. Create Super Admin

Open: `http://localhost:5173/setup`

Fill in name, email, password. This creates the first `super_admin`. Route is disabled after first use.

### 2. Create First Business

After logging in as `super_admin`:

- Open `Businesses` page
- Create a new business (name, slug, timezone)

Without a business there is no workspace to attach anything else.

### 3. Create Admin User

On `Businesses` page:

- Select the business
- Add a member → role `admin` → set a password

This admin manages Drive, Instagram, media queue, and publishing for that business.

### 4. Create Normal User (Optional)

Same page, role `user`. Currently has limited access based on backend route guards. Frontend RBAC tightening is pending.

All roles use the same `/login` page.

---

## Password Rules

- Setup page: minimum 6 characters
- Members: password set explicitly in the member creation form on the Businesses page
- Updating a member with a new password immediately replaces the login password

---

## Role Capabilities

| Role | Can Do |
|---|---|
| `super_admin` | Create businesses, view all businesses, manage tenant structure |
| `admin` | Manage business members, connect Drive, connect Instagram, upload/import media, schedule/publish posts, manage automations |
| `user` | Read-only access to business-scoped data where backend allows |

---

## Environment Variables

### Backend (`apps/api/.env`)

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/ai-automation
JWT_SECRET=your-long-random-secret
GEMINI_API_KEY=your-gemini-key
FACEBOOK_APP_ID=your-meta-app-id
FACEBOOK_APP_SECRET=your-meta-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:4000/api/instagram/oauth/callback
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/google-drive/oauth/callback
PUBLIC_API_URL=https://your-tunnel.trycloudflare.com

# Optional
GEMINI_API_KEY_2=second-gemini-key
GEMINI_API_KEY_3=third-gemini-key
FACEBOOK_GRAPH_API_VERSION=v25.0
FACEBOOK_SCOPES=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly
PORT=4000
UPLOAD_DIR=uploads/
```

**Multiple Gemini keys:** Configure `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` etc. for parallel caption generation in automation runs. The system rotates keys round-robin and skips rate-limited keys automatically.

### Frontend (`apps/web/.env`)

```bash
VITE_API_URL=http://localhost:4000/api
```

If blank, frontend auto-targets current host port `4000`.

---

## Instagram OAuth (Meta App Setup)

1. Go to **Meta for Developers** → create a new **Business** app.
2. Add products: **Facebook Login for Business** + **Instagram Graph API**.
3. **App Settings → Basic** → copy `App ID` (→ `FACEBOOK_APP_ID`) and `App Secret` (→ `FACEBOOK_APP_SECRET`).
   - Do **not** paste a user access token in `FACEBOOK_APP_SECRET`. Use the app secret from the dashboard.
4. **Facebook Login settings** → add authorized redirect URI exactly:
   `http://localhost:4000/api/instagram/oauth/callback`
5. Add yourself as a **developer/tester** in App Roles.
6. Ensure a Facebook Page is linked to an **Instagram Professional** account (Business or Creator).
7. Restart the API after editing env values.

---

## Google Drive OAuth (Google Cloud Console)

1. Go to **Google Cloud Console** → create or select a project.
2. Enable the **Google Drive API**.
3. **APIs & Services → Credentials** → create an **OAuth 2.0 Client ID** (Web application type).
4. Add authorized redirect URI: `http://localhost:4000/api/google-drive/oauth/callback`
5. Copy `Client ID` (→ `GOOGLE_CLIENT_ID`) and `Client Secret` (→ `GOOGLE_CLIENT_SECRET`).
6. Recommended scopes (narrower than full Drive access):
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`

---

## Tunnel Setup (Required for Instagram Publishing)

Instagram fetches media from a **public URL**. Localhost is not reachable from Meta servers.

**Always start with:**
```bash
./start.sh
```

This script:
1. Starts a Cloudflare Quick Tunnel → `localhost:4000`
2. Reads the generated `*.trycloudflare.com` URL
3. Writes it to `apps/api/.env` as `PUBLIC_API_URL`
4. Starts API + Web

Each restart gets a new URL — the script updates `.env` automatically.

**For production:** Use a permanent named Cloudflare tunnel or deploy to a public HTTPS host.

---

## Full Local Startup Sequence

```
1. Start MongoDB (docker compose up -d)
2. ./start.sh                    ← starts tunnel + API + web
3. Open http://localhost:5173/setup
4. Create super_admin
5. Login → Businesses → create first business
6. Add admin user
7. Integrations → Connect Google Drive
8. Integrations → Connect Instagram
9. Drive Browser → browse folders → import files
10. Content Queue → plan scheduling and captions
   OR
10. Automations → create Folder Automation → Fetch Now
```

---

## LAN / Other Devices

Vite exposes a network URL automatically. If `VITE_API_URL` is empty, the frontend auto-targets the current host on port `4000` — it will work on any device on the same Wi-Fi.

For Google Drive OAuth from another device, set `GOOGLE_REDIRECT_URI` to your machine's LAN IP:
```bash
GOOGLE_REDIRECT_URI=http://192.168.1.x:4000/api/google-drive/oauth/callback
```
