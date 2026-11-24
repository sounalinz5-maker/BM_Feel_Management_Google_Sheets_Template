# BM FUEL PWA + existing Apps Script (iframe integration experiment)

The connected-test PWA shell is deployed at: https://sounalinz5-maker.github.io/BM_Feel_Management_Google_Sheets_Template/connected/
This does NOT automatically make Google Sheets accessible until the live Google Apps Script deployment opts in to framing. The current live deployment status has not been verified. Keep the production system untouched until staging passes.

## Why it cannot be enabled from GitHub alone
The downloaded BM FUEL V8.1 Apps Script source contains:
```js
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Login')
    .setTitle('BM FUEL MANAGEMENT')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
```
Google HtmlService DEFAULT restricts framing. The GitHub app cannot change headers on script.google.com and cannot directly invoke `google.script.run` across origins.

## Option: embed existing Apps Script, retaining its own Login, Sheets and Drive
Only if the Owner approves embedding and tests clickjacking risk, **in the latest live Apps Script source** change only:
```js
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
```
to:
```js
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
```
and in the existing `Login.html`, add before the closing `</body>`:
```html
<script>
if (window.parent !== window) {
  try { window.parent.postMessage({type:'BM_PWA_EMBED_READY'}, 'https://sounalinz5-maker.github.io'); } catch (_) {}
}
</script>
```
Then deploy a **new test deployment** (don't overwrite production), confirm that Owner/Staff login, camera popup, image proof, and Sheets writes work in the iframe on Android and iPhone. The new deployment URL would need to be updated in `connected/index.html` for staging (not production URL).

### Critical security limitation
`ALLOWALL` removes Google's framing restriction for **ALL websites**, not only GitHub Pages. This raises clickjacking risk, so do not enable it blindly on a live financial system. Before production, assess framing threat and add independent owner/session confirmation for state-changing actions, and ensure all scripts authenticate every request. If you cannot accept this risk, do not use embedding; implement an authenticated same-origin backend-for-frontend and supported OAuth/cookie flow instead.

Google sign-in may still fail inside iframe due to third-party-cookie restrictions. If the Apps Script deployment requires Google account sign-in, an iframe is not a guaranteed solution. A secure HTTPS API is the proper long-term architecture for an independent frontend.

No credentials or Sheets data are stored in the public repository.
