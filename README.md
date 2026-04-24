# AI Instagram Automation Suite

Monorepo starter for a multi-user, multi-business Instagram automation SaaS built with:

- `apps/api`: Express + TypeScript + MongoDB
- `apps/web`: React + Vite + TailwindCSS
- `packages/*`: shared placeholders for future extracted types/config/utils

## Product Scope

- Multi-tenant SaaS with `super_admin`, `admin`, and `user` roles
- Multiple Instagram accounts per business
- Google Drive optional per admin workflow
- Drive Browser for folder/file preview and import
- Content Queue table for `File Name`, `Drive File ID`, `Status`, `Group ID`, `Post Type`, `Scheduled Time`, `AI Caption`, `IG Media ID`, and `Likes / Reach`
- Detail page per file for scheduling and metadata edits

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start MongoDB:

```bash
docker compose up -d
```

3. Start both apps:

```bash
npm run dev:all
```

4. Open the frontend:

```bash
http://localhost:5173
```

For other devices on the same Wi-Fi:

- the Vite dev server now exposes a network URL
- the API now accepts LAN development origins
- the frontend automatically targets the current host on port `4000` when `VITE_API_URL` is empty

If you test Google Drive OAuth from another device, set `GOOGLE_REDIRECT_URI` in [apps/api/.env](/Users/yashmadhavtech/Documents/AI_Automation/apps/api/.env) to your machine's LAN callback URL, for example:

```bash
http://192.168.1.108:4000/api/google-drive/oauth/callback
```

## API Bootstrapping

Create the first `super_admin` account with:

- `POST /api/auth/bootstrap`

After the first account exists, the bootstrap route is disabled.

## Core Backend Modules

- Authentication and JWT sessions
- Role-based access control
- Business tenancy and memberships
- Instagram account records
- Google Drive connection records
- Media asset library
- Post drafts, scheduling, and publish logs
- Likes analytics history

## Notes

- Third-party publishing and sync services are scaffolded with service boundaries, but production tokens, app review, and webhook flows still need live API credentials.
- Local uploads are supported for development, but long-term storage should be Google Drive or another durable object store.
- CORS is locked to the frontend URLs in `apps/api/.env` with a central allowlist in [env.ts](/Users/yashmadhavtech/Documents/AI_Automation/apps/api/src/config/env.ts) and enforced in [app.ts](/Users/yashmadhavtech/Documents/AI_Automation/apps/api/src/app.ts).
- Google Drive secrets should live only in [apps/api/.env](/Users/yashmadhavtech/Documents/AI_Automation/apps/api/.env), not in the frontend env file.
- A fuller project status and setup guide lives in [docs/PHASE_1_SETUP.md](/Users/yashmadhavtech/Documents/AI_Automation/docs/PHASE_1_SETUP.md).
- Full user workflow guide lives in [docs/WORKFLOW_USER_GUIDE.md](/Users/yashmadhavtech/Documents/AI_Automation/docs/WORKFLOW_USER_GUIDE.md).

## Current Workflow

1. `super_admin` logs in and creates the first business.
2. `admin` opens `Drive Browser`.
3. `admin` connects Google Drive and checks `Connected / Not connected / Disconnected`.
4. the app fetches Drive folders/files and displays that data.
5. team imports the required media into the queue.
6. team uses `Content Queue` to manage scheduling, grouping, captions, and performance fields.
