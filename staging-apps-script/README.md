# BM FUEL — Apps Script only STAGING prototype

This isolated branch adds a numeric meter-entry web app, not a full replacement for the existing dashboard/PWA. It never calls Railway, OCR, Google Picker, or a photo API. It writes only to the previously approved STAGING spreadsheet and validates its title and ten existing Meter_Log headers. No production files are edited.

## Deployment (owner only)
1. Open the approved STAGING spreadsheet, Extensions → Apps Script. Create a separate project if there is any doubt the existing project serves production.
2. Copy Code.gs and Index.html into the separate STAGING project. Do not overwrite a production project. Set timezone Asia/Vientiane.
3. Deploy → New deployment → Web app. Execute as **Me** and access **Only myself**. Do not select Anyone or enable public access. Authorize the staging Google account.
4. Open the new /exec URL while signed into the authorized account. Do not reuse the Railway PWA link.
5. Confirm connection, choose a test date not already in Meter_Log, enter six fictional pairs and check the sample-only box. Verify exactly six rows with unique IDs, Source=APPS_SCRIPT_STAGING_SAMPLE, correct volumes, and the same date in the sheet. Try the same date again and confirm no duplicate rows; reload and verify persistence. Never enter actual financial data.
6. Do not disable or delete Railway yet; owner must verify the new app and separately authorize any production migration or shutdown.

Google authentication is the access control for this owner-only prototype, not a staff login system. Multiuser access, existing dashboard, PWA installation and historical stock/sales integration require separate development and tests. Google quotas apply. A network failure can occur after the write; inspect Meter_Log before retrying. No real deployment or live write has been verified by this commit.
