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
│   ├── Navbar/           # Decentraland navbar with auth
│   └── ...
├── config/
│   ├── env/
│   │   ├── dev.json      # Development config
│   │   └── prd.json      # Production config
│   └── index.ts          # Config loader
├── contexts/
│   └── auth/
│       ├── AuthProvider.tsx  # Auth context provider
│       ├── types.ts          # Auth types
│       ├── utils.ts          # Auth utilities
│       └── index.ts
├── hooks/
│   └── useAuthenticatedFetch.ts  # Authenticated fetch hook
├── pages/
│   └── MapPage/          # Main map view
├── utils/
│   └── fetch.ts          # signedFetch implementation
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

## TODO: API Integration

The following tasks are needed to integrate this app with a backend API for persisting scene groups and other data:

### Backend API Requirements

- [ ] **Define API endpoints** for scene group CRUD operations:
  - `GET /api/scene-groups` - List user's scene groups
  - `POST /api/scene-groups` - Create a new scene group
  - `GET /api/scene-groups/:id` - Get a specific scene group
  - `PUT /api/scene-groups/:id` - Update a scene group
  - `DELETE /api/scene-groups/:id` - Delete a scene group

- [ ] **Authentication middleware** - Verify signed requests using `@dcl/crypto` on the server

- [ ] **Database schema** for scene groups:
  - `id` - Unique identifier
  - `name` - Group name
  - `parcels` - Array of parcel coordinates `{x, y}`
  - `owner` - Wallet address of the owner
  - `createdAt` / `updatedAt` - Timestamps

### Frontend Integration

- [ ] **Create API service layer** (`src/services/api.ts`):
  - Use `useAuthenticatedFetch` for all API calls
  - Handle loading, error, and success states
  - Add retry logic for failed requests

- [ ] **Scene Groups state management**:
  - Create `useSceneGroups` hook for fetching and caching groups
  - Implement optimistic updates for better UX
  - Add sync status indicators

- [ ] **Connect MapPage to API**:
  - Load scene groups on mount
  - Save new groups to API when created
  - Update/delete groups via API
  - Handle offline mode gracefully

- [ ] **Error handling UI**:
  - Toast notifications for success/error states
  - Retry buttons for failed operations
  - Loading skeletons while fetching

### Additional Features

- [ ] **Parcel metadata fetching** - Load parcel names/descriptions from Decentraland API
- [ ] **Scene preview** - Show scene thumbnails when hovering groups
- [ ] **Sharing** - Generate shareable links for scene groups
- [ ] **Collaboration** - Allow multiple users to edit a group

### Testing

- [ ] **Unit tests** for API service functions
- [ ] **Integration tests** for auth flow
- [ ] **E2E tests** for scene group CRUD operations
