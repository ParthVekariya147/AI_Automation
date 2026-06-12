# Feature 01 — Authentication

## Purpose
- First-run setup of the super admin account
- Email + password login for all users
- JWT-based session management

---

## API Endpoints

### POST `/api/auth/bootstrap`
- **Auth:** None (public)
- **Purpose:** Create the first admin user; endpoint self-disables after first call
- **Body:** `{ name, email, password (min 6 chars) }`
- **Returns:** `{ token, user }`
- **Guard:** Returns `403` if any user already exists in DB

### POST `/api/auth/login`
- **Auth:** None (public)
- **Purpose:** Email + password login
- **Body:** `{ email, password }`
- **Returns:** `{ token, user, memberships[] }`
- **Failure:** `401` on wrong credentials

### GET `/api/auth/me`
- **Auth:** JWT required
- **Purpose:** Return current user profile + active business memberships
- **Returns:** `{ user, memberships[] }`

---

## Data Models

### User (`users` collection)
- `name` — String, required
- `email` — String, unique, lowercase
- `passwordHash` — String (bcrypt)
- `globalRole` — `"admin"` (only role in use)
- `isActive` — Boolean

### Membership (`memberships` collection)
- `userId` → User
- `businessId` → Business
- `role` — `"admin"`
- `status` — `"active" | "invited" | "disabled"`

---

## Services / Utils
- `utils/auth.ts`
  - `hashPassword(plain)` — bcrypt hash
  - `comparePassword(plain, hash)` — bcrypt compare
  - `signToken(user)` — signs JWT with `JWT_SECRET`, expiry from `JWT_EXPIRES_IN`
  - `verifyToken(token)` — verifies + decodes JWT payload

---

## Middleware
- `middlewares/auth.ts`
  - `requireAuth` — extracts Bearer token → verifies → attaches `req.user`
  - `requireBusinessRole(...roles)` — checks active `Membership` for `(userId, businessId)`
  - `requireGlobalRole(...roles)` — checks `req.user.globalRole` directly

---

## Frontend
- **Page:** `LoginPage.tsx` → route `/login`
- **Page:** `SetupPage.tsx` → route `/setup` (bootstrap form)
- **Store:** `store/auth-store.ts` — holds `token`, `user`, active `businessId`

---

## Environment Variables
- `JWT_SECRET` — required, min 12 chars
- `JWT_EXPIRES_IN` — default `7d`

---

## Key Rules
- Bootstrap is a one-time action; second call returns `403`
- JWT payload: `{ sub: userId, email, globalRole }`
- All users currently normalize to `globalRole: "admin"` — role expansion is designed-in but not yet used
- Membership `status` must be `"active"` for `requireBusinessRole` to pass

---

## Dependencies
- Uses `Business` model (memberships returned in login response)
- Every other feature depends on this feature's middleware
