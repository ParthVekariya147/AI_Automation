# Postlane — Project Mindmap (Root)

## Identity
- **Name:** Postlane (Instagram Automation Suite)
- **Type:** Multi-tenant SaaS
- **Purpose:** Schedule, automate, and publish Instagram content

---

## Tech Stack
- ### Frontend
  - React 18
  - Vite 7 (SWC)
  - TypeScript 5.9
  - Tailwind CSS v3
  - TanStack Query v5
  - Zustand v5
  - React Router v7
  - Axios
  - dnd-kit (drag-and-drop)
  - Lucide (icons)

- ### Backend
  - Node.js (ESM)
  - Express 4
  - TypeScript 5.9
  - Mongoose 8
  - Zod 4 (validation)
  - JWT (jsonwebtoken)
  - Multer (file upload)
  - Morgan (logging)
  - Sharp (image processing)

- ### Database
  - MongoDB

- ### External APIs
  - Meta Graph API v25.0 (Instagram)
  - Google Drive API v3
  - Google Gemini API (gemini-2.5-flash)

- ### Infrastructure
  - Docker + Docker Compose (local dev)
  - Cloudflare Quick Tunnel (Instagram media exposure)
  - Fly.io (deployment)
  - Render (deployment)
  - Vercel (cron trigger)

---

## Monorepo Layout
- ### apps/api (Backend)
  - `src/index.ts` — Entry point
  - `src/app.ts` — Express setup
  - `src/types.ts` — Shared types
  - `src/config/` — env, database
  - `src/models/` — Mongoose schemas
  - `src/controllers/` — Route handlers
  - `src/routes/` — Express routers
  - `src/services/` — Business logic
  - `src/middlewares/` — Auth, error handling
  - `src/utils/` — api-error, async-handler, auth helpers

- ### apps/web (Frontend)
  - `src/main.tsx` — React entry
  - `src/pages/` — One file per route
  - `src/components/` — Shared UI
  - `src/store/` — Zustand + API client
  - `src/lib/` — Utilities

- ### packages/
  - `config/` — Shared tsconfig stubs
  - `types/` — Cross-package TypeScript types
  - `utils/` — Shared utility stubs

---

## Features (each has its own file)
- [01 — Authentication](feature_01_auth.md)
- [02 — Business Management](feature_02_businesses.md)
- [03 — Instagram Integration](feature_03_instagram_integration.md)
- [04 — Google Drive Integration](feature_04_google_drive.md)
- [05 — Media Library](feature_05_media_library.md)
- [06 — Content Queue (Posts)](feature_06_content_queue.md)
- [07 — Folder Automations](feature_07_folder_automations.md)
- [08 — Background Scheduler](feature_08_scheduler.md)
- [09 — AI Caption System (Gemini)](feature_09_ai_captions.md)
- [10 — Instagram Publishing Pipeline](feature_10_publishing_pipeline.md)
- [11 — Analytics](feature_11_analytics.md)
- [12 — DM Automation (Planned)](feature_12_dm_automation.md)

---

## Data Models (MongoDB Collections)
- `users`
- `businesses`
- `memberships`
- `instagramaccounts`
- `googledriveconnections`
- `mediaassets`
- `postdrafts`
- `publishjobs`
- `folderautomations`
- `automationruns`
- `analyticslikes`
- `auditlogs`
- `webhookevents` *(planned — DM automation)*
- `dmautomations` *(planned — DM automation)*

---

## API Base URL
- **Local:** `http://localhost:4000/api`
- **Route Groups:**
  - `/auth`
  - `/businesses`
  - `/instagram`
  - `/google-drive`
  - `/media`
  - `/posts`
  - `/automations`
  - `/analytics`
  - `/reports`
  - `/scheduler`
  - `/webhook` *(planned)*
  - `/dm-automations` *(planned)*

---

## Global Rules
- All routes require `Authorization: Bearer <JWT>` except:
  - `POST /auth/bootstrap`
  - `POST /auth/login`
  - `GET /instagram/oauth/callback`
  - `GET /google-drive/oauth/callback`
  - `GET|POST /webhook/instagram` *(planned)*
- `businessId` flows through every resource: URL param → body → query string
- Active membership required for all business-scoped operations
- Background scheduler runs every **60 seconds**
- `PUBLIC_API_URL` (HTTPS) is required for Instagram publishing
