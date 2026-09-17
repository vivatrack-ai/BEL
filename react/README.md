# Evenuefy — Co-Exhibitor Portal (React)

React (Vite) conversion of the Co-Exhibitor / Space Requirement / Passes / Aircraft Registration
prototype. **UI is identical** to the vanilla build — the same `styles.css` and markup are used.

## Run

Requires Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (deployable to any static host)
```

Routes (HashRouter — works from any folder/sub-path):

| Portal | URL |
|---|---|
| Exhibitor | `/#/exhibitor/co-exhibitors` (default) |
| Admin | `/#/admin/dashboard` |

## Project structure

```
src/
  lib.js                  constants (event, rate chart, filters) + formatters
  services/api.js         ★ ALL data access — the only file to change for real APIs
  store/exhibitorStore.js state snapshot + actions (calls api, refreshes) + derived math
  data/report-data.js     seeded report data (Stall Inquiry XLSX) for the admin portal
  components/ui.jsx       Toasts, Modal, Field, Pill, Tile (same classNames as vanilla)
  exhibitor/              Co-Exhibitors, Allocate Stall, Space Requirement, Passes, Aircraft (4-form wizard)
  admin/                  Requirement Dashboard, Space Requirements (+bulk email), Aircraft Approvals (+detail)
  styles.css              copied verbatim from the vanilla build — do not restyle
```

## Wiring real APIs

Every function in `src/services/api.js` is `async` and carries a suggested endpoint in a
comment. Replace the localStorage body with an HTTP call — nothing else changes:

```js
/* POST /api/co-exhibitors */
async addCoExhibitor(data) {
  const res = await fetch('/api/co-exhibitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

Key mappings:

| api.js function | Suggested endpoint |
|---|---|
| `exhibitorApi.getState` | `GET /api/exhibitor/portal-state` (or one GET per resource) |
| `addCoExhibitor / deleteCoExhibitor` | `POST / DELETE /api/co-exhibitors` |
| `saveAllocation / removeAllocation` | `POST·PUT / DELETE /api/stall-allocations` |
| `assignQuota / removeQuota` | `POST / DELETE /api/pass-quotas` |
| `addPass / sendInvite` | `POST /api/passes` · `POST /api/pass-invites` |
| `saveSpaceRequirements` | `PUT /api/space-requirements` (bulk upsert; unique per setup type) |
| `payCart / removeCartItem` | `POST /api/cart/checkout` (payment gateway) · `DELETE /api/cart/:id` |
| `createAircraft / updateAircraft / deleteAircraft` | `POST · PUT · DELETE /api/aircraft-applications` |
| `saveAircraftForm(id, 'air7a'…)` | `PUT /api/aircraft-applications/:id/{air7a,air4,air7b}` |
| `submitAircraftIfComplete` | `POST /api/aircraft-applications/:id/submit` |
| `saveDraft / clearDraft` | `PUT / DELETE /api/aircraft-drafts/:key` |
| `adminApi.getRequirements` | `GET /api/admin/space-requirements` |
| `adminApi.sendBulkEmail` | `POST /api/admin/bulk-email` |
| `adminApi.getAircraftApplications` | `GET /api/admin/aircraft-applications` |
| `adminApi.approveAircraft / rejectAircraft` | `POST /api/admin/aircraft-applications/:id/{approve,reject}` |

Business rules already enforced in the UI (mirror them server-side): stall allocation ≤ booked
area and Subsidiary-only; pass quotas from Separate (paid) co-exhibitors' balance; Chalet has
floors, no sqm; one space requirement per setup type; aircraft fee from the Static Display
tonnage rate chart (INR for India, USD otherwise); payment only after committee approval.
