# Mobile Curation

A web application for curating and managing Decentraland parcels and scene groups on mobile devices.

## Features

### Map View
- Interactive canvas-based map rendering of Decentraland's Genesis City
- Satellite tile images from the [genesis-city repository](https://github.com/decentraland/genesis-city)
- Pan and zoom controls with mouse/touch support
- Hover coordinates display
- Click-to-select parcels

### Scene Groups
- Create, view, edit, and delete groups of parcels
- Visual selection of parcels on the map
- Floating top bar for mode selection (View/Create/Edit/Delete)
- Persisted to backend API (mobile-bff)

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
├── components/
│   └── Navbar/               # Decentraland navbar with auth
├── config/
│   ├── env/
│   │   ├── dev.json          # Development config (MOBILE_BFF_URL, etc.)
│   │   └── prd.json          # Production config
│   └── index.ts              # Config loader
├── contexts/
│   └── auth/
│       ├── AuthProvider.tsx  # Auth context provider
│       ├── types.ts          # Auth types
│       ├── utils.ts          # Auth utilities
│       └── index.ts
├── features/
│   └── map/
│       ├── api/
│       │   └── sceneGroupsApi.ts  # Scene groups API client
│       ├── components/
│       │   ├── GroupsSidebar/     # Scene groups sidebar UI
│       │   ├── MapCanvas.tsx      # Canvas rendering
│       │   └── ...
│       ├── context/
│       │   ├── GroupsContext.tsx  # Scene groups state + API
│       │   ├── MapContext.tsx     # Map viewport state
│       │   └── useGroupsHooks.ts  # Custom hooks
│       ├── types/
│       │   └── index.ts           # Type definitions
│       └── utils/
│           └── groupUtils.ts      # Group utilities
├── hooks/
│   └── useAuthenticatedFetch.ts   # Authenticated fetch hook
├── pages/
│   └── MapPage.tsx                # Main map view
├── utils/
│   └── fetch.ts                   # signedFetch implementation
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

## Environment Variables

Set `VITE_REACT_APP_DCL_DEFAULT_ENV` to control the environment:
- `dev` - Development (uses decentraland.zone)
- `prd` - Production (uses decentraland.org)

---

## API Integration

Scene groups are persisted to the [mobile-bff](../mobile-bff) backend.

### Backend API (mobile-bff)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/backoffice/scene-groups` | List all scene groups |
| POST | `/backoffice/scene-groups` | Create a new scene group |
| PUT | `/backoffice/scene-groups/:id` | Update a scene group |
| DELETE | `/backoffice/scene-groups/:id` | Delete a scene group |

All backoffice endpoints require:
1. Signed requests via `signedFetch`
2. Wallet address in `ALLOWED_USERS` env var on the backend

### Frontend Implementation

- **API Client**: `src/features/map/api/sceneGroupsApi.ts`
- **State Management**: `src/features/map/context/GroupsContext.tsx`
- **Hooks**: `useGroupsState()`, `useGroupsDispatch()`, `useGroupsApi()`

Groups are loaded automatically when a user signs in.

### Configuration

Set `MOBILE_BFF_URL` in config files:
- `src/config/env/dev.json` - Development (localhost:3000)
- `src/config/env/prd.json` - Production

---

## Future Enhancements

- [ ] **Parcel metadata fetching** - Load parcel names/descriptions from Decentraland API
- [ ] **Scene preview** - Show scene thumbnails when hovering groups
- [ ] **Sharing** - Generate shareable links for scene groups
- [ ] **Offline mode** - Cache groups locally when offline
