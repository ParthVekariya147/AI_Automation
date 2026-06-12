# Feature 02 — Business Management

## Purpose
- Multi-tenant workspace isolation: every resource belongs to a Business
- Users join businesses via Memberships
- A user can be a member of multiple businesses

---

## API Endpoints

### GET `/api/businesses`
- **Auth:** JWT required
- **Purpose:** List all businesses the logged-in user is a member of
- **Returns:** `{ businesses[] }`

### POST `/api/businesses`
- **Auth:** JWT required
- **Purpose:** Create a new business workspace
- **Body:** `{ name, slug?, timezone? }`
- **Returns:** `{ business }`
- **Side effect:** Creates a `Membership` record linking creator → new business

### GET `/api/businesses/:businessId`
- **Auth:** JWT + active membership
- **Purpose:** Get a single business's details

### PATCH `/api/businesses/:businessId`
- **Auth:** JWT + active membership
- **Purpose:** Update business name, timezone, or settings
- **Body:** `{ name?, timezone?, settings? }`

### POST `/api/businesses/:businessId/members`
- **Auth:** JWT + active membership
- **Purpose:** Invite another user to join this business
- **Body:** `{ email, role }`
- **Side effect:** Creates a `Membership` with `status: "invited"`

### GET `/api/businesses/:businessId/members`
- **Auth:** JWT + active membership
- **Purpose:** List all members (and their status) for a business

---

## Data Models

### Business (`businesses` collection)
- `name` — String, required
- `slug` — String, unique, lowercase (URL-safe identifier)
- `timezone` — String, default `"Asia/Kolkata"`
- `isActive` — Boolean
- `settings.allowDirectInstagramPosting` — Boolean, default `true`
- `settings.defaultMediaSource` — `"local" | "google_drive"`, default `"local"`

### Membership (`memberships` collection)
- `userId` → User
- `businessId` → Business
- `role` — `"admin"`
- `status` — `"active" | "invited" | "disabled"`

---

## Frontend
- **Page:** `BusinessesPage.tsx` → route `/businesses`
  - Lists all businesses the user belongs to
  - Switch active business (writes to Zustand store)
  - Create new business form
  - Invite member form

---

## Key Rules
- `businessId` is required as a param, body field, or query string for all business-scoped API calls
- The `requireBusinessRole` middleware validates membership before any controller runs
- Slug is auto-generated from name (lowercase, hyphenated) if not supplied
- Switching the active business in the frontend changes the `businessId` stored in the Zustand auth store; all subsequent API calls use the new `businessId`

---

## Dependencies
- **Auth** (Feature 01) — `requireAuth` + `requireBusinessRole` protect all routes
- All other features reference `businessId` from this feature's `Business` model
