# BM FUEL iOS — test source project

This native iOS shell opens the existing Google Apps Script BM FUEL in a WKWebView without Safari/Chrome URL bar. It does not store credentials or fuel sales data.

- SwiftUI app and WKWebView.
- Google account sign-in links open in Safari; Google OAuth is prohibited in an embedded WebView. Safari login cookies may not flow back into the app.
- New browser windows are handled by a child WKWebView for the GitHub OCR camera, with camera consent for permitted domains.
- Camera input, postMessage from OCR, image uploading, Google Apps Script login and Google Sheets saves must be QA-tested on a physical iPhone with a staging copy of Sheets.
- The GitHub workflow only compiles an unsigned iOS Simulator app; it does not produce an installable IPA.

To install on an actual iPhone: open the project with Xcode on a Mac, select an Apple development team, code sign and build to a device. TestFlight/App Store distribution additionally requires Apple Developer Program and App Store Connect setup. Do not upload private signing credentials, Sheets IDs, passwords, or recovery codes into this public repository.

Alternative now: install the existing PWA launcher using Safari Share > Add to Home Screen at https://sounalinz5-maker.github.io/BM_Feel_Management_Google_Sheets_Template/mobile/ ; the real Apps Script UI will still open externally.
