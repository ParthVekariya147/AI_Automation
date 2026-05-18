# Postlane — Instagram Automation Suite

Monorepo for a multi-user, multi-business Instagram scheduling and automation SaaS.

- `apps/api` — Express + TypeScript + MongoDB
- `apps/web` — React + Vite + TailwindCSS
- `packages/*` — shared type/config/utils stubs

## Product Scope

- Multi-tenant SaaS: `super_admin`, `admin`, and `user` roles
- Multiple Instagram accounts per business
- Google Drive integration (browse, import, auto-publish from folders)
- Local file upload support
- Content Queue with planning fields: Status, Group ID, Post Type, Scheduled Time, AI Caption, IG Media ID, Likes/Reach
- Queue Detail page for per-file scheduling and edits
- **Folder Automations** — watch a Drive folder, generate AI captions via Gemini, group files, and auto-schedule posts to Instagram
- Gemini AI caption generation and hashtag suggestions
- Image aspect-ratio fitting for Instagram (blur-padded background)
- Background scheduler that publishes due posts every 60 seconds

## Quick Start

```bash
npm install
docker compose up -d   # start MongoDB
./start.sh             # start API + web + Cloudflare tunnel
```

Frontend: `http://localhost:5173`

## Tunnel Setup (Required for Instagram Publishing)

Instagram's Graph API fetches media from a **public URL** during container creation. `localhost` is not reachable from Meta servers. The startup script uses a Cloudflare Quick Tunnel to expose the local API.

**Always start with:**
```bash
./start.sh
```

This script:
1. Starts a Cloudflare quick tunnel → `localhost:4000`
2. Reads the generated `*.trycloudflare.com` URL
3. Writes it to `apps/api/.env` as `PUBLIC_API_URL`
4. Starts API + Web (`npm run dev:all`)

Each restart gets a new tunnel URL — the script updates `.env` automatically.

**For production:** Use a permanent Cloudflare named tunnel or deploy to a public HTTPS host.

## Instagram OAuth Setup (Meta)

Add to `apps/api/.env`:

```bash
FACEBOOK_APP_ID=your_meta_app_id
FACEBOOK_APP_SECRET=your_meta_app_secret
FACEBOOK_REDIRECT_URI=http://localhost:4000/api/instagram/oauth/callback
FACEBOOK_GRAPH_API_VERSION=v25.0
FACEBOOK_SCOPES=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement
```

Steps to generate Meta credentials:

1. Go to Meta for Developers → create a new Business app.
2. Add **Facebook Login for Business** and **Instagram Graph API** products.
3. App Settings → Basic → copy `App ID` and `App Secret` (not a user access token).
4. Facebook Login settings → add redirect URI exactly: `http://localhost:4000/api/instagram/oauth/callback`
5. Add yourself as a tester/developer and link a Facebook Page to an Instagram Professional account.

## Google Drive Setup

Add to `apps/api/.env`:

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/google-drive/oauth/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly
```

## Gemini AI Setup

```bash
GEMINI_API_KEY=your_gemini_key
```

Used for: AI caption generation (Queue Detail → **Generate with Gemini**) and automated caption generation in Folder Automations. Supports multiple keys — set `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` etc. for parallel automation runs.

## Frontend → API Connection

`apps/web/.env`:
```bash
VITE_API_URL=http://localhost:4000/api
```

If blank, frontend auto-targets current host on port `4000`.

## API Bootstrapping

```
POST /api/auth/bootstrap
```

Creates the first `super_admin`. Disabled after first call.

## Core Modules

- JWT auth + role-based access control
- Business tenancy and memberships
- Instagram account OAuth (Meta Graph API)
- Google Drive OAuth + file browsing + thumbnail cache
- Media asset library (local upload + Drive import)
- Content Queue (planning, scheduling, AI captions)
- Post drafts, publish flow, background scheduler
- **Folder Automations** — Drive folder → AI captions → grouped post drafts → scheduled publishing
- Image aspect-ratio fitting via Sharp (blur-padded background for feed posts)
- Analytics like-count snapshots
- Audit log

## Current Workflow

1. `super_admin` creates the first business.
2. `admin` connects Google Drive and Instagram via `Integrations` page.
3. `admin` browses Drive in `Drive Browser`, imports media to queue.
4. Team uses `Content Queue` to plan scheduling, grouping, and captions.
5. Alternatively: create a **Folder Automation** in `Automations` — the system fetches Drive files, generates AI captions, groups them, and schedules posts automatically.
6. Background scheduler publishes due posts every 60 seconds.

## Documentation

- Full setup guide: [`docs/PHASE_1_SETUP.md`](docs/PHASE_1_SETUP.md)
- Complete project reference: [`docs/PROJECT_COMPLETE_DOCS.md`](docs/PROJECT_COMPLETE_DOCS.md)
- User workflow guide: [`docs/WORKFLOW_USER_GUIDE.md`](docs/WORKFLOW_USER_GUIDE.md)
- Automations deep-dive: [`docs/AUTOMATIONS_GUIDE.md`](docs/AUTOMATIONS_GUIDE.md)
