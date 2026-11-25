## Storage policy (2026-11-25)

Meter readings are **Google Sheets STAGING only**. The API refuses POST /v1/meters with HTTP 503 if STAGING Google Sheets credentials are absent. The PWA disables the submit button unless authenticated GET /v1/storage-status confirms persisted:true, storage:google-staging. Previous RAM-only meter writes are disabled to avoid data loss and false success. Photos are no longer accepted. Do not use production accounts, sheet IDs, or real sales. Railway still requires STAGING-only OAuth/service-account credentials to enable persistent writes.

## Current scope: numeric-only meter entry (2026-11-25)

Photo upload and camera support have been removed from the STAGING UI, API, and Google Sheets integration at the owner's request. Meter_Log now has ten columns: Submission_ID, Date, Nozzle, Fuel, Opening_L, Closing_L, Volume_L, Created_At, Source, Operator. The Google Sheets destination is hard-locked in code to the separate, approved STAGING ID. Railway's absence of Google credentials means numeric sample submissions are accepted in RAM only, and they are lost on redeploy or restart. No production data should be entered. When a dedicated, authorized STAGING-only Google Sheets OAuth or service account is available, the same form will save numeric readings without photos into Meter_Log. Never connect a production credential or sheet ID.

# BM FUEL — isolated staging API & full-screen PWA

**Current state:** The interface and API implementation are committed to source. GitHub Pages hosts the **static staging UI only**. It DOES NOT host the Node.js API. Until a separate HTTPS host is configured, the login remains inaccessible, and no "connected" status should be claimed.

Staging UI: https://sounalinz5-maker.github.io/BM_Feel_Management_Google_Sheets_Template/staging/

## Run on a developer machine (no real Sheets or Drive)

```powershell
$env:BM_STAGING_USERNAME='staging-admin'
$env:BM_STAGING_PASSWORD='<generate-a-strong-unique-staging-password>'
$env:BM_STAGING_ORIGIN='http://localhost:45000'
node staging-api/server.mjs
```

For local testing, start a static HTTP server on port 45000 to serve the repository and visit /staging/. Set API URL http://127.0.0.1:8787. HTTPS is mandatory for remote access on a phone.

### Production-like staging deployment

1. Deploy `staging-api/server.mjs` on an approved managed hosting service that supports Node.js, HTTPS, restricted access and secrets. Put `BM_STAGING_USERNAME` and `BM_STAGING_PASSWORD` in **the hosting service's secret/environment settings**, not public source. Set `BM_STAGING_ORIGIN=https://sounalinz5-maker.github.io`.
2. The app listens on `PORT` and `BM_STAGING_HOST` (default 127.0.0.1; change to 0.0.0.0 only inside protected container hosting). HTTPS termination must happen at the host/reverse proxy.
3. Open the static staging UI on Android Chrome or iPhone Safari and paste the staging API HTTPS base URL; health check must pass before a real staging login becomes available.
4. Test endpoint `GET /v1/health`, `POST /v1/login`, `GET /v1/me`, `GET /v1/dashboard`, `POST /v1/meters`, `GET /v1/meters`, `POST /v1/logout`.
5. Test browser CORS, denied origins, invalid credentials, lockouts, account roles, token expiry and mobile installation. Confirm no browser password persistence or tokens in URLs.
6. Get owner review before changing production. Deploying this in memory API must never be mistaken for a real financial ledger.

### Security limitations (by design)

- This API uses **fictional sample data only**, stores temporary sessions and meter writes **in server memory**, and loses them when restarted. No Google Sheets ID or Drive account is used.
- It is intended for **staging workflow tests**, not a ready production backend. Has basic login attempt throttling but not a distributed rate limiter or a production user database.
- **Never** reuse actual user/Owner passwords in staging.
- No camera/photo upload API is available here; uploads intentionally rejected. The earlier interface's photo/OCR can be kept in Demo until a real authenticated evidence API is designed.
- The GitHub Pages staging frontend is public; remote access to any private data depends entirely on backend authentication, not frontend hiding.
- Browser `sessionStorage` stores the **API origin only**, never passwords or bearer tokens. Session tokens are held in JS memory for this staging preview.
- The old Apps Script `google.script.run` is not a browser-accessible REST endpoint. Connecting actual Sheets/Drive requires a separately authenticated backend, Apps Script owner review, and end-to-end tests on a copy of the data.
- The previous iframe experiment is **not** a live integration. Do not weaken X-Frame-Options or enable unauthenticated Sheets writes to work around this.

### Tests

```bash
node --check staging-api/server.mjs
node --check staging/staging.mjs
node --test staging-api/server.test.mjs
```

No environment secrets are required to run tests; the test suite uses ephemeral test-only credentials.

## Deploy from GitHub to Railway

1. Install/connect the Railway app in ChatGPT or sign into Railway's dashboard. Linking this repository and confirming hosting/account billing requires the owner's action.
2. In Railway choose **New Project → Deploy from GitHub repo**. Select `sounalinz5-maker/BM_Feel_Management_Google_Sheets_Template` and keep **root directory** as `/` (not `/staging-api`, because the server imports `/app` fixtures).
3. Select **Add Variables before Deploy**, and configure these service secrets, **without copying real BM FUEL credentials**:
   - `BM_STAGING_USERNAME` — a new, unique staging user ID.
   - `BM_STAGING_PASSWORD` — a strong staging-only secret of at least 12 characters; set directly in Railway's private variables.
   - `BM_STAGING_ORIGIN` — `https://sounalinz5-maker.github.io`.
   Railway injects `PORT` automatically. The project root `package.json` supplies `npm start`, and the server binds to 0.0.0.0 when `PORT` is provided.
4. Deploy, configure a Railway-generated HTTPS public domain, then verify the domain plus `/v1/health` returns `{"ok":true,"mode":"sample-only"}` before trying any login.
5. Open `https://sounalinz5-maker.github.io/BM_Feel_Management_Google_Sheets_Template/staging/` and paste the HTTPS API base URL into the API field. Use only the new staging credentials.
6. After testing, do not confuse sample-only API data with production Sheets/Drive. Changes to production need separate authorization.

Local syntax and integration tests: `npm test`.

## Connecting an isolated Google Sheets and Drive **STAGING** account

**Not connected yet.** The photo submit button is disabled unless a separate staging spreadsheet and staging Drive folder have been verified by the backend. Never substitute production IDs, even temporarily.

1. In a **separate staging Google account**, create a blank spreadsheet named **`BM FUEL STAGING`** and a dedicated Drive folder named **`BM-FUEL-STAGING`**. Create a tab called **`Meter_Log`**; the backend initializes its column headers if row one is empty.
2. Obtain OAuth credentials using a dedicated staging Google Cloud OAuth client with the Sheets and Drive scopes, or a service account specifically granted access to **these two resources only**. Never use credentials or a broad-scoped service account already serving production. Do not upload the credentials JSON to GitHub or the ChatGPT conversation.
3. In the Railway service `bm-fuel-staging-api` → Variables (environment: `staging`), configure these **secret** values:
   - `BM_STAGING_GOOGLE_AUTH_JSON`: a complete `authorized_user` OAuth JSON containing refresh token/client ID/client secret **or** a service account JSON with private key. Keep this on the private Railway environment only.
   - `BM_STAGING_SHEET_ID`: ID of **only** the newly created STAGING spreadsheet.
   - `BM_STAGING_DRIVE_FOLDER_ID`: ID of **only** the newly created STAGING folder.
4. Trigger a staging deployment after variables are set. The API refuses to start if only some of the three variables exist. The authenticated `GET /v1/storage-status` verifies spreadsheet name, worksheet name, folder type/name and header structure before enabling the photo form.
5. Test one sample submission for each of the six nozzles, each with two distinct photographed meter readings. Open the staging spreadsheet and Drive folder **directly** to check that all six rows and twelve pictures exist.
6. Record the restart test: redeploy the Railway STAGING service and confirm all six rows remain in the STAGING spreadsheet. Confirm photo API retrieval is authorized and that folder files are private.
7. Only after these checks can the sample-only staging workflow be deemed persistent. A separate Owner authorization is required before any production use.

**Photo safeguards:** browser canvas encodes each picture as JPEG (max 650KB per photo), server validates image markers and size, and uploads stay server-side. Photo IDs are not returned to unauthenticated clients. The app prohibits photo submissions when Google staging storage is not configured; older numeric-only ephemeral API submissions remain for development compatibility and must never be used to track real sales. Google Drive upload and Sheet append are separate requests (not a distributed transaction); exceptional mid-request failures can require manual reconciliation in the staging folder.

The staging credential service account, if used, must have a suitable Drive upload quota (for some Google accounts a user OAuth token or Shared Drive is necessary). User consent and Google API enablement are required; connecting the Google Drive plugin to ChatGPT does not by itself confer API tokens on Railway.
