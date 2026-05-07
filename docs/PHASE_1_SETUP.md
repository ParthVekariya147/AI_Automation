# Phase 1 Setup Guide

## Current Phase Status

This phase already includes:

- monorepo structure
- Express API
- MongoDB models
- JWT auth
- role-based access for `super_admin`, `admin`, and `user`
- business tenancy
- media records
- post draft records
- smart timing suggestion stub
- likes analytics records
- Google Drive connection records
- Instagram account records

## Pending Tasks In This Phase

These items are still pending before the platform is fully production-ready:

1. Real Google Drive OAuth flow
2. Real Google Drive file listing and import sync
3. Real Instagram Graph API OAuth flow
4. Real Instagram publish flow for image/video
5. Background scheduler worker for scheduled posts
6. Gemini integration for hashtag suggestions
7. secure token encryption at rest
8. invite/reset-password flow
9. refresh tokens and logout/session invalidation
10. role-aware UI restrictions in every screen
11. production deployment config
12. audit log screens and admin support tools

## Login Flow

### 1. Super Admin

The first platform user is created from:

- `http://localhost:5173/setup`

This creates the first `super_admin`.

### 2. Create First Business

After `super_admin` logs in, create the first business from:

- `Businesses` page

Without a business, there is no tenant to attach members, Instagram accounts, Drive connections, media, or posts.

### 3. Create Business Admin

On the `Businesses` page:

- choose the business
- add a member
- choose role `admin`
- set the password in the member creation form

That user can then log in from:

- `http://localhost:5173/login`

### 4. Create Normal User

On the same `Businesses` page:

- add a member
- choose role `user`
- set the password in the member creation form

That user also logs in from:

- `http://localhost:5173/login`

## Current Password Rules

- setup password: minimum `6` characters
- added members now should be created with an explicit password from the `Businesses` page
- when an existing member is updated and a password is entered again, that password becomes the new login password

## Which Login Is Used For What

- `super_admin`
  - create businesses
  - view all businesses
  - manage tenant structure
- `admin`
  - manage business members
  - connect Drive
  - connect Instagram
  - upload media
  - create drafts
  - schedule/publish posts
- `user`
  - currently can log in and access business-scoped read flows where allowed by backend routes
  - should be tightened further in a later RBAC UI pass

## Google Drive Env Storage

Store Google Drive secrets only in:

- `apps/api/.env`

Do not store Google secrets in:

- `apps/web/.env`

Current backend env keys prepared for Drive:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_DRIVE_SCOPES`

## Instagram OAuth Env Storage

Store Meta/Instagram secrets only in:

- `apps/api/.env`

Do not store Meta secrets in:

- `apps/web/.env`

Current backend env keys prepared for Instagram OAuth:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_REDIRECT_URI`
- `FACEBOOK_GRAPH_API_VERSION`
- `FACEBOOK_SCOPES`

Recommended local values:

- `FACEBOOK_REDIRECT_URI=http://localhost:4000/api/instagram/oauth/callback`
- `FACEBOOK_GRAPH_API_VERSION=v25.0`
- `FACEBOOK_SCOPES=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement`

## Meta App / API Credential Generation Steps

1. Open Meta for Developers and create a new app (Business app type).
2. Add products:
  - Facebook Login for Business
  - Instagram Graph API
3. Go to App Settings -> Basic and copy:
  - App ID -> `FACEBOOK_APP_ID`
  - App Secret -> `FACEBOOK_APP_SECRET`
  - do not use a generated user access token here
4. In Facebook Login settings, add Authorized Redirect URI exactly as:
  - `http://localhost:4000/api/instagram/oauth/callback`
5. Add your Facebook user as a developer/tester in app roles.
6. Ensure a Facebook Page is linked to an Instagram Professional account (Business/Creator).
7. Restart API after editing env values.

## Frontend API Base URL (Env)

In `apps/web/.env`:

- `VITE_API_URL=http://localhost:4000/api`

If this is blank, frontend uses current host with port `4000` and `/api` path.

## Recommended Google Drive Scopes

- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.metadata.readonly`

These are narrower than full Drive access and fit this product better for file operations and metadata reads.

## Local Startup

1. Start MongoDB
2. Start API
3. Start frontend
4. Create `super_admin`
5. Create first business
6. Add `admin` user
7. Add `user` if needed
8. Connect Drive
9. Connect Instagram
10. Start media and post flow
