# BM FUEL Management — PWA Preview v2.0

## Status
A new installable full-screen interface prototype hosted on GitHub Pages at:
https://sounalinz5-maker.github.io/BM_Feel_Management_Google_Sheets_Template/app/

DEMO only. Do not enter real passwords or use sample values for accounting. The app stays on the GitHub origin and does not redirect automatically to Google Apps Script. Existing production Apps Script is linked separately.

## Available now
- Custom mobile login-design screen (production login deliberately disabled for safety).
- Owner-style dashboard with simulated LAK sales, diesel/gasoline volumes and chart Today/7/30 days, tank capacities 30,000/20,000 L, and six pump cards.
- Manual opening and closing meter entries to 3 decimals.
- Photo upload/capture for opening and closing readings, photo preview and optional browser free OCR with user consent (loads Tesseract.js from CDN). Photos held only in memory during demo. Nothing written to Google Sheets.
- Demo records only in memory, cleared by page reload.
- Navigation for stock, reports and settings.
- PWA manifest, 192/512 PNG icons, Service Worker and Android/iOS install guidance.

## Critical future backend work
Existing Google Apps Script source uses google.script.run, available only inside Google's HtmlService sandbox. Moving only the HTML files to GitHub will NOT make calls work. To use Sheets and Drive, a separately authenticated HTTPS API is required and must be tested against staging.

Apps Script ContentService responses commonly redirect to script.googleusercontent.com and are subject to browser CORS; the existing Apps Script URL must NOT be treated as a ready JSON API. A server-side proxy or separate authenticated cloud API may be necessary. Do not expose unauthenticated write endpoints, passwords, recovery codes, service-account keys, peppper or other secrets in this public repo. Implement authentication, role authorization, audit log, idempotency and token revocation. Never route demo actions to production until Sheets/Drive meter photo and save flows pass staging QA and Owner approves final deployment.

## Local testing
Run node --test app/tests/logic.test.mjs from repository root. For browser testing, serve the repository root over localhost and navigate to /app/. Use HTTPS or localhost for camera.

## Structure
- index.html / styles.css / app.mjs: mobile interface.
- logic.mjs / demo-data.mjs: pure helpers and deliberately fictional sample values.
- manifest.json / sw.js: PWA installation and local UI shell.
- config.json: disabled backend configuration.
