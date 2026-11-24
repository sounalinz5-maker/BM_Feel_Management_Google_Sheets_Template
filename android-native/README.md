# BM FUEL Android application (TEST ONLY)
This Android project embeds the user's existing Apps Script web app in a fullscreen WebView, with no Chrome address bar.

Requirements: Android 10 or later (API 29+), internet. No credentials or Sheets data in code.
Supports photo file chooser and camera permission. Attempts nested WebView popups for GitHub camera OCR.
Google account OAuth is not allowed in embedded WebView; Google sign-in pages are opened externally.

GitHub Actions workflow builds test APK as an Actions artifact.
**Not verified on a physical Android phone**, not a signed production release. Do not use for live fuel sales until login, camera/OCR popup, attachment and Google Sheets saves are tested end-to-end.
No server-side Google credentials are stored in this public GitHub repository.
