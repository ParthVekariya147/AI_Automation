# Feature 03 — Instagram Integration

## Purpose
- Connect a client's Instagram Professional account via Meta OAuth
- Store the access token and IG User ID needed to publish content
- One Business can have multiple Instagram accounts

---

## API Endpoints

### GET `/api/instagram/oauth/start`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** Generate and return the Meta OAuth authorization URL
- **Returns:** `{ url }` — redirect the user's browser to this URL

### GET `/api/instagram/oauth/callback`
- **Auth:** None (Meta redirects here without JWT)
- **Query:** `?code=&state=`
- **Purpose:** Exchange the OAuth `code` for a long-lived access token
- **Side effects:**
  - Fetches IG User ID + Page ID from Meta Graph API
  - Creates or updates an `InstagramAccount` document
- **Redirects to:** Frontend integrations page on success

### GET `/api/instagram/accounts`
- **Auth:** JWT + active membership
- **Query:** `?businessId=`
- **Purpose:** List all connected Instagram accounts for a business
- **Returns:** `{ accounts[] }`

### POST `/api/instagram/connect`
- **Auth:** JWT + active membership
- **Purpose:** Manually connect an IG account (alternative to OAuth flow)
- **Body:** `{ businessId, name, handle, accessToken, igUserId, pageId }`

### POST `/api/instagram/disconnect`
- **Auth:** JWT + active membership
- **Purpose:** Remove an Instagram account connection
- **Body:** `{ businessId, accountId }`
- **Side effect:** Sets `isActive: false` on the `InstagramAccount` document

---

## Data Model

### InstagramAccount (`instagramaccounts` collection)
- `businessId` → Business (indexed)
- `name` — Display name (e.g. "Brand Account")
- `handle` — Instagram username (e.g. `@brandname`)
- `igUserId` — Meta IG User ID (used in all Graph API calls)
- `pageId` — Facebook Page ID linked to the IG account
- `accessToken` — Long-lived user access token
- `isActive` — Boolean

---

## External API Used

### Meta Graph API v25.0
- **OAuth Dialog:** `https://www.facebook.com/v25.0/dialog/oauth`
  - Params: `client_id`, `redirect_uri`, `scope`, `state`
- **Token Exchange:** `POST https://graph.facebook.com/v25.0/oauth/access_token`
  - Params: `client_id`, `client_secret`, `redirect_uri`, `code`
- **Long-lived Token:** `GET https://graph.facebook.com/v25.0/oauth/access_token`
  - Params: `grant_type=fb_exchange_token`, `client_id`, `client_secret`, `fb_exchange_token`
- **Account Info:** `GET https://graph.facebook.com/v25.0/me/accounts` — fetch linked Pages + IG accounts

### Required Scopes
```
instagram_basic
instagram_content_publish
pages_show_list
pages_read_engagement
```

---

## Frontend
- **Page:** `IntegrationsPage.tsx` → route `/integrations`
  - Shows connected Instagram accounts
  - "Connect Instagram" button → triggers OAuth start
  - "Disconnect" button per account

---

## Environment Variables
- `FACEBOOK_APP_ID` — Meta app ID
- `FACEBOOK_APP_SECRET` — Meta app secret
- `FACEBOOK_REDIRECT_URI` — default `http://localhost:4000/api/instagram/oauth/callback`
- `FACEBOOK_GRAPH_API_VERSION` — default `v25.0`
- `FACEBOOK_SCOPES` — comma-separated OAuth scopes

---

## Key Rules
- The OAuth callback is **public** — Meta does not send a JWT
- `state` param in OAuth URL encodes the `businessId` so the callback knows which business to attach the account to
- Access tokens must be **long-lived** (60-day expiry); short-lived tokens from OAuth are exchanged automatically
- `igUserId` (not `pageId`) is used in all publishing API calls
- `PUBLIC_API_URL` must be HTTPS — required for Instagram to fetch media during publish (not for OAuth itself)

---

## Dependencies
- **Auth** (Feature 01) — protects `/accounts`, `/connect`, `/disconnect`, `/oauth/start`
- **Business** (Feature 02) — account is scoped to a `businessId`
- **Publishing Pipeline** (Feature 10) — `accessToken` + `igUserId` from this model are consumed at publish time
- **DM Automation** (Feature 12) — `igUserId` used to match incoming webhook events to the correct rule
