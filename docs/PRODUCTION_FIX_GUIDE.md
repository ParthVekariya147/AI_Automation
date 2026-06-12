# Postlane Production Fix Guide
# Domain: app.postlane.software | API: api.postlane.software

---

## ROOT CAUSE SUMMARY

You are using OLD credentials that were created for localhost.
These must be replaced with NEW credentials pointing to your live domain.

| What               | Old Value (BROKEN)                              | New Value (CORRECT)                                              |
|--------------------|------------------------------------------------|------------------------------------------------------------------|
| GOOGLE_REDIRECT_URI| http://localhost:4000/api/google-drive/...     | https://api.postlane.software/api/google-drive/oauth/callback   |
| FACEBOOK_REDIRECT_URI | http://localhost:4000/api/instagram/...     | https://api.postlane.software/api/instagram/oauth/callback      |
| CLIENT_URL         | http://localhost:5173                          | https://app.postlane.software                                   |
| CORS_ORIGINS       | http://localhost:5173                          | https://app.postlane.software                                   |

---

## STEP 1 — Create New Google OAuth Credentials

1. Go to: https://console.cloud.google.com
2. Select your project
3. Go to: APIs & Services → Credentials
4. Click: Create Credentials → OAuth 2.0 Client ID
5. Application type: Web application
6. Name: Postlane Production

Under "Authorized JavaScript Origins" add:
```
https://app.postlane.software
```

Under "Authorized Redirect URIs" add:
```
https://api.postlane.software/api/google-drive/oauth/callback
```

7. Click Create
8. COPY and SAVE the new:
   - Client ID     → GOOGLE_CLIENT_ID
   - Client Secret → GOOGLE_CLIENT_SECRET

Also make sure Google Drive API is enabled:
- APIs & Services → Library → Search "Google Drive API" → Enable

---

## STEP 2 — Create New Facebook App

1. Go to: https://developers.facebook.com
2. Click: My Apps → Create App
3. Type: Business
4. App Name: Postlane

Add Facebook Login product:
- Dashboard → Add Product → Facebook Login → Web
- Site URL: https://app.postlane.software

Go to: Facebook Login → Settings
Under "Valid OAuth Redirect URIs" add:
```
https://api.postlane.software/api/instagram/oauth/callback
```

Go to: App Settings → Basic
Under "App Domains" add:
```
postlane.software
```

5. COPY and SAVE the new:
   - App ID     → FACEBOOK_APP_ID
   - App Secret → FACEBOOK_APP_SECRET

---

## STEP 3 — Update .env on Your DigitalOcean Droplet

SSH into your droplet:
```bash
ssh root@YOUR_DROPLET_IP
```

Open the .env file:
```bash
nano /root/AI_Automation/apps/api/.env
```

Replace the entire file content with this (fill in your new credentials from Step 1 and Step 2):

```env
NODE_ENV=production
PORT=4000

MONGODB_URI=mongodb+srv://parthvekariya147_db_user:tyKrOQwyey9AZdgz@igautomation.pliznzw.mongodb.net/ai-instagram-automation?appName=IGAutomation

JWT_SECRET=change-me-super-secret-key
JWT_EXPIRES_IN=7d

CLIENT_URL=https://app.postlane.software
CORS_ORIGINS=https://app.postlane.software
PUBLIC_API_URL=https://api.postlane.software
UPLOAD_DIR=uploads

# NEW Google credentials from Step 1
GOOGLE_CLIENT_ID=PASTE_NEW_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=PASTE_NEW_CLIENT_SECRET_HERE
GOOGLE_REDIRECT_URI=https://api.postlane.software/api/google-drive/oauth/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email

# NEW Facebook credentials from Step 2
FACEBOOK_APP_ID=PASTE_NEW_APP_ID_HERE
FACEBOOK_APP_SECRET=PASTE_NEW_APP_SECRET_HERE
FACEBOOK_REDIRECT_URI=https://api.postlane.software/api/instagram/oauth/callback
FACEBOOK_GRAPH_API_VERSION=v25.0
FACEBOOK_SCOPES=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement

# Gemini API Keys (keep your existing ones)
GEMINI_API_KEYS=AIzaSyBjHbk9_XnuvLyq4AOef5NK7aC8zR8inYw
GEMINI_API_KEYS2=AIzaSyAp0o_Jx1-3enewo6CGehGxCWJN6obGtTE
GEMINI_API_KEYS3=AIzaSyBxQcMiK_2WqEENS0epN9XnLKgRxraoWh4
GEMINI_API_KEYS4=AIzaSyBinR81cvD6F_4wxfWhJqjTOlMemFT0nPw
GEMINI_API_KEYS5=AIzaSyBq1NLOg09-dRVWb805PfcpshVjQ9EwtH0
GEMINI_MODEL=gemini-2.5-flash
```

Save: Ctrl+O → Enter → Ctrl+X

---

## STEP 4 — Restart the API Server

```bash
pm2 restart all
pm2 logs --lines 30
```

If you are not using pm2:
```bash
systemctl restart postlane-api
```

Verify the server started correctly — logs should show:
```
Server running on port 4000
MongoDB connected
```

---

## STEP 5 — Verify Everything Works

Test the API is live:
```bash
curl https://api.postlane.software/api/health
```

Should return:
```json
{"success":true,"message":"API is healthy"}
```

Then open https://app.postlane.software and test:
1. Click Connect Google Drive → should open Google login popup
2. Click Connect Facebook → should open Facebook login popup

---

## QUICK CHECKLIST

- [ ] Step 1: New Google OAuth credentials created with correct redirect URI
- [ ] Step 2: New Facebook App created with correct redirect URI
- [ ] Step 3: .env updated on droplet with new credentials + production URLs
- [ ] Step 4: API server restarted (pm2 restart all)
- [ ] Step 5: Tested /api/health returns success
- [ ] Step 6: Google Drive connect button works on live site
- [ ] Step 7: Facebook connect button works on live site

---

## COMMON ERRORS AND FIXES

### Error 400: redirect_uri_mismatch (Google)
Cause: URL in Google Console does not exactly match GOOGLE_REDIRECT_URI in .env
Fix: Make sure both are exactly: https://api.postlane.software/api/google-drive/oauth/callback

### Error: Invalid redirect_uri (Facebook)
Cause: URL in Facebook Login settings does not match FACEBOOK_REDIRECT_URI in .env
Fix: Make sure both are exactly: https://api.postlane.software/api/instagram/oauth/callback

### Button clicks but nothing happens
Cause: Frontend cannot reach the API (CORS error or wrong API URL)
Fix: Check that your frontend is calling https://api.postlane.software/api
     Run in browser console: check Network tab for failed requests

### No Instagram account found after Facebook login
Cause: Instagram account is not a Professional account or not linked to a Facebook Page
Fix: On Instagram → Settings → Account → Switch to Professional Account
     Then link it to a Facebook Page

---

## FILE LOCATIONS ON DROPLET

API code:     /root/AI_Automation/apps/api/
API .env:     /root/AI_Automation/apps/api/.env
Frontend:     /root/AI_Automation/apps/web/
PM2 logs:     pm2 logs
PM2 status:   pm2 status
