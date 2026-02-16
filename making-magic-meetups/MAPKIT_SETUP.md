# Apple MapKit JS Setup (Preferred Store)

This project replaced the "Preferred Store" feature from Google Places with Apple MapKit JS.

## What Was Implemented

- Frontend loads MapKit JS:
  - `index.html` includes Apple MapKit JS script tag.
- Backend issues MapKit JS authorization tokens:
  - `GET /api/mapkit/token` returns `{ ok: true, token }` (JWT, ES256).
- Settings page store search uses MapKit JS:
  - Uses `mapkit.Search()` in the browser.
  - Selected store is saved to the user via `PATCH /api/me/preferred-store`.

Git commit: `28242b6` ("feat: replace preferred store with Apple MapKit JS").

## Render Environment Variables (API Service)

Required:

- `MAPKIT_TEAM_ID`
  - Your Apple Developer Team ID (10 characters).
- `MAPKIT_KEY_ID`
  - The Key ID for the MapKit JS key you create in Apple Developer.
- One of the following private key inputs:
  - `MAPKIT_PRIVATE_KEY`
    - Paste the full `.p8` private key.
    - If Render does not accept multi-line values, replace newlines with `\n`.
  - `MAPKIT_PRIVATE_KEY_BASE64`
    - Base64-encoded `.p8` content (decoded server-side).
  - `MAPKIT_PRIVATE_KEY_PATH`
    - Path on the server filesystem (usually not used on Render).

Recommended:

- `MAPKIT_ORIGIN`
  - Set to `https://www.makingmagicmeetups.com` (must match the origin used by the frontend).
- `MAPKIT_TOKEN_TTL_SECONDS`
  - Default is `3600` (1 hour).

## Verification Checklist

After adding env vars and redeploying the Render API service:

1. Verify the token endpoint:
   - Visit `https://<your-api-host>/api/mapkit/token`
   - Expected: `{ "ok": true, "token": "..." }`

2. Verify store search UI:
   - Go to `https://www.makingmagicmeetups.com/#/settings`
   - Search a store name/city.
   - Click "Set Preferred".

If store search shows a message about token not configured, check:

- Render env vars exist on the *API* service (not the static web).
- `MAPKIT_ORIGIN` matches exactly the site origin.
- The `.p8` key and key id/team id are correct.

