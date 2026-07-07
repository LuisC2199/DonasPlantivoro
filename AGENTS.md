# AI Agent Guide for Donas El Plantívoro

## Project Overview
**Donas El Plantívoro** is a Spanish-language donut ordering platform for a bakery. The app enables customers to place orders with delivery dates and quantity selections, while admins manage orders, update payment status, and view statistics.

## Technology Stack
- **Frontend**: React 19 + Vite + React Router + Tailwind CSS
- **Backend**: Firebase (Google Auth, Firestore, Cloud Functions v2)
- **Language**: TypeScript (strict mode)
- **Build Commands**:
  - `npm run dev` – Start Vite dev server (port 3000)
  - `npm run build` – Build for production
  - `npm run preview` – Preview production build

## Architecture & Key Files

### Frontend Structure
- **[App.tsx](App.tsx)** – Main app entry point with routing
- **[api.ts](api.ts)** – Cloud Functions client (all backend calls via `httpsCallable`)
- **[types.ts](types.ts)** – Centralized TypeScript types (Order, User, etc.)
- **[constants.ts](constants.ts)** – Pricing, flavor configs, admin emails
- **[firebase.ts](firebase.ts)** – Firebase initialization & setup
- **[pages/](pages/)** – Page components (orders, admin stats, etc.)
- **[components/](components/)** – Reusable React components
- **[auth/](auth/)** – Google OAuth & role-based access control

### Backend Structure
- **[functions/src/index.ts](functions/src/index.ts)** – Cloud Functions (order CRUD, pricing, stats)
- **[firestore.rules](firestore.rules)** – Firestore security rules
- **[firebase.json](firebase.json)** – Firebase deployment config

## Key Patterns & Conventions

### Authentication & Authorization
- **Google OAuth only** – No email/password auth
- **Email allowlist** – Controlled via `VITE_ADMIN_EMAILS` env var (case-insensitive)
- **`RequireAdmin` wrapper** – Enforces admin role for protected routes in `[auth/RequireAdmin.tsx](auth/RequireAdmin.tsx)`
- **Auth context** – `AdminAuthProvider` manages user state, persists across page refresh

### Data & API
- **No direct Firestore access** from client – All mutations/queries go through Cloud Functions via `httpsCallable`
- **Server-side validation** – Prices calculated on server for security
- **Type safety** – All data shapes defined in `[types.ts](types.ts)`
- **Dates** – ISO strings (`YYYY-MM-DD` format), no timezone math, local midnight logic

### UI & Components
- **Brand Colors**:
  - Purple: `#40068B`
  - Green: `#28CD7E`
- **Tailwind CSS** – Utility-first styling
- **Reusable Components**: Button, Toast, QuantityStepper, ConfigPopup, EditOrderModal

### Pricing Model
- **Personal Orders**: Tiered by quantity (6–11+ donas = $160–$310)
- **Wholesale/POS**: Flat $20/doña
- **Special Pricing**: "Karen Donas" category with custom rates

### Order Rules
- **Minimum Notice**: Next-day delivery (bypassed for admins)
- **Blocked Days**: Sundays closed
- **Flavors**: 7 fixed varieties + 1 dynamic "Seasonal" (name & image configurable)
- **Pickup Points**: Named delivery locations
- **Date Ranges**: Configurable in admin settings

## Common Tasks & Where to Find Them

| Task | Location |
|------|----------|
| Add a new Cloud Function | [functions/src/index.ts](functions/src/index.ts) |
| Update pricing logic | [constants.ts](constants.ts), `functions/src/index.ts` |
| Add admin feature | [pages/AdminStats.tsx](pages/AdminStats.tsx), use `RequireAdmin` wrapper |
| Create new component | [components/](components/)` + export from component file |
| Update order types | [types.ts](types.ts) |
| Validate user input | [utils/validation.ts](utils/validation.ts) |
| Configure Firebase | [firebase.ts](firebase.ts), `firebase.json`, `.env` |

## Important Gotchas & Notes

1. **Spanish Throughout** – All field names, labels, and validation messages are in Spanish (es-MX locale)
2. **Environment Variables** – Frontend uses `import.meta.env.VITE_*`, backend uses `process.env.*`
3. **Date Format Strict** – Always ISO strings (`YYYY-MM-DD`), never use timezone-aware dates
4. **Emails Case-Insensitive** – Admin allowlist normalizes to lowercase for comparison
5. **No State Persistence** – Auth survives via Firebase SDK, orders fetched fresh each session
6. **Cloud Functions v2** – Uses `onRequest`, not v1 triggers
7. **XLSX Export** – Admin can export order stats as Excel; format configured in `[api.ts](api.ts)`
8. **Local Dev** – Firebase emulator runs on port 5001 (Cloud Functions)

## Testing & Deployment

- **Dev Mode** – Firebase emulator for Cloud Functions (auto-configured)
- **Production** – Deploy via Firebase Hosting + Cloud Functions
- **Env Config** – Use `.env` for local overrides (not checked in)

## Quick Reference: Key Commands & Files

| Action | Command/File |
|--------|--------------|
| Start dev server | `npm run dev` |
| Build for prod | `npm run build` |
| Deploy to Firebase | `firebase deploy` |
| View admin stats | [pages/AdminStats.tsx](pages/AdminStats.tsx) |
| Check pricing rules | [constants.ts](constants.ts) |
| View type definitions | [types.ts](types.ts) |
| Handle API calls | [api.ts](api.ts) |
