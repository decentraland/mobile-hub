
# Mobile Curation

A web application for curating Decentraland scenes for the mobile apps.

## Features

### Places
- One search across every place in Genesis City and every World: by name, world (`name.dcl.eth`) or parcel (`x,y`), read through mobile-bff's `/destinations` proxy of the Places API
- Every tag listed with how many places carry it; filter by one tag at a time, or by "No iOS status" to find places nobody has decided on
- Per-place controls for the tags the apps read:
  - **iOS**: Allowed (`allowed_ios`) or Banned (`banned_ios`), exclusive
  - **★ Featured** (`featured`): the Discover featured carousel; `ftue` fills the first-time user one
- Any other tag added or removed per place
- Bulk actions on selected places (allow, ban, clear iOS, feature, add or remove a tag), each confirmed first
- Export CSV of the places shown (filter by `allowed_ios` for the iOS list)
- Tags are stored as mobile-bff places (`/backoffice/places`); the first tag on a place creates its record

### Authentication
- Decentraland SSO integration via `@dcl/single-sign-on-client`
- Wallet connection using `decentraland-connect`
- Navbar with Sign In/Sign Out and avatar display
- `signedFetch` for authenticated API requests with cryptographic signatures
- `useAuthenticatedFetch` hook for easy authenticated requests

## Tech Stack

- **React 18** with TypeScript
- **Vite** for development and build
- **decentraland-connect** for wallet connections
- **@dcl/crypto** for request signing
- **react-router-dom** for routing

## Project Structure

```
src/
├── components/               # Navbar, AppTabs
├── config/env/               # dev.json / prd.json (MOBILE_BFF_URL, etc.)
├── contexts/auth/            # Auth context provider
├── features/
│   ├── places/               # mobile-bff places + tags API
│   ├── scenes/               # Places tab: Places API search, matching, tag rules, CSV
│   └── ...                   # one folder per tab (flags, campaigns, push, ...)
├── hooks/useAuthenticatedFetch.ts
├── pages/                    # One page per tab (PlacesPage, PushPage, ...)
├── utils/fetch.ts            # signedFetch implementation
└── App.tsx
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## NPM Package

This project is published to npm as `@dcl-regenesislabs/mobile-hub`. The built static files can be installed and served by any backend.

### Publishing

The build outputs to `dist/` which includes:
- All static assets (JS, CSS, images)
- `package.json` (copied from `public/package.json`)
- `README.md` (copied during prebuild)

```bash
# Build and publish
npm run build
cd dist
npm publish
```

### Serving from a Subpath

The frontend supports being served from any URL path (e.g., `/hub/`, `/app/`, or root `/`).

This is achieved via `window.__BASE_PATH__`:
1. `index.html` contains `<script>window.__BASE_PATH__ = "";</script>`
2. The serving backend can rewrite this to the actual base path (e.g., `"/hub"`)
3. React Router uses this as its `basename` prop

See [mobile-bff](https://github.com/decentraland/mobile-bff) for an example of serving this package with path rewriting.

## Environment Variables

Set `VITE_REACT_APP_DCL_DEFAULT_ENV` to control the environment:
- `dev` - Development (uses decentraland.zone)
- `prd` - Production (uses decentraland.org)

`VITE_CREATOR_FUND_API_URL` points a source build at a local [creators-data](https://github.com/decentraland/creators-data) for the Creator Fund tab (for example `http://localhost:8788`); a release build ignores it.

## Creator Fund

The **Creator Fund** tab is the backoffice for creators-data's `/v3/creator-fund/admin/*`: cycles, terms, news, enrolled creators (with CSV export, suspension and exclusion), place exclusions per cycle snapshot, and a sweep on demand. The tab appears only when `GET /admin/me` answers 200 for the signed-in wallet, which the service decides from its own admin list; anyone else gets a 403 and no tab. Every write asks for confirmation, is signed with `hashPayload` over the body, and is recorded by the service with the admin's wallet.

On localhost the dev identity signs the requests, so that wallet (`0xf39F…2266`) has to be on the local service's admin list.

creators-data has a single deployment, `creators-data.decentraland.zone`, so the production hub is the one that talks to it (`prd.json`) and the dev hub leaves `CREATOR_FUND_API_URL` empty, which hides the tab and sends nothing. A source build with `VITE_CREATOR_FUND_API_URL` set still gets the tab.

---

## API Integration

Place tags are persisted to the [mobile-bff](../mobile-bff) backend.

### Backend API (mobile-bff)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/destinations?search=…` | Search Genesis City and Worlds (Places API proxy) |
| GET | `/backoffice/places` | List every place with tags |
| POST | `/backoffice/places` | Create the record for a place's first tag |
| PUT | `/backoffice/places/:id` | Replace a place's tags |
| GET | `/tags` | Known tag names |

All backoffice endpoints require:
1. Signed requests via `signedFetch`
2. Wallet address in `ALLOWED_USERS` env var on the backend

### Configuration

Set `MOBILE_BFF_URL` in config files:
- `src/config/env/dev.json` - Development
- `src/config/env/prd.json` - Production
