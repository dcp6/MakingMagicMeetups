# Deploy Backend (Render Free)

This project is configured to deploy the API from:

- `making-magic-meetups/server/index.js`

using the root blueprint:

- `/Users/danpowell/Documents/new.project/render.yaml`

## Steps

1. In Render, create a **Blueprint** and connect this GitHub repo.
2. Approve the `makingmagicmeetups-api` service from `render.yaml`.
3. After deploy, copy the API URL (example: `https://makingmagicmeetups.onrender.com`).
4. If Render gives a different hostname than expected, set:
   - GitHub repo variable `VITE_API_BASE_URL` to your Render API URL.
   - Then redeploy GitHub Pages.

## Verify

- Health: `GET https://<your-render-url>/api/health`
- Subscribe: `POST https://<your-render-url>/api/users` JSON `{ "email": "you@example.com" }`

## Seed Production Accounts

From the Render Shell for `makingmagicmeetups-api` (service root `making-magic-meetups`), run:

- `npm run seed:prod-accounts`

This inserts 5 fake accounts (passwords max 10 characters) with `INSERT OR IGNORE`, so reruns are safe.

## Notes

- `GET /api/users` is admin-protected and requires `ADMIN_API_KEY` header.
- `FRONTEND_ORIGIN` is set to `https://dcp6.github.io` in `render.yaml`.
- `DATA_DIR` is set to `/var/data` for the API service.
- For true persistence across deploys/restarts, attach a Render persistent disk mounted at `/var/data`.
