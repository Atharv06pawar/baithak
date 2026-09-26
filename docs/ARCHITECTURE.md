# BaithakOS — Architecture

---

## 1. Guiding Principle

The local database is the **operational source of truth** on each device.

```
UI
 ↓
Domain Operation
 ↓
Local Database (Dexie / IndexedDB)
 ↓
UI updates immediately
 ↓
Sync Queue (outbox)
 ↓
Cloud (Firebase)
```

Never:
```
UI → Firebase → UI
```

This ensures offline operation and instant responsiveness.

---

## 2. System Overview

```
                    BAITHAKOS
                         │
             ┌───────────┴───────────┐
             │                       │
        LOCAL ENGINE            CLOUD ENGINE
             │                       │
        Dexie / IDB             Firebase
             │                       │
        Domain Logic          Authentication
             │                Cloud Persistence
             │                Backup
             │
             └──────────┬────────────┘
                        │
                  SYNC ENGINE
                        │
                INTELLIGENCE ENGINE
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    Analytics       Forecasting      AI Layer
        │               │               │
        └───────────────┼───────────────┘
                        │
                  OWNER INTERFACE
                    (Next.js)
```

---

## 3. Layer Descriptions

### 3.1 Owner Interface

**Technology:** Next.js 14+ App Router, React, TypeScript, Tailwind CSS

- PWA-enabled (manifest, service worker, offline caching)
- Mobile-first layout, minimum 44px touch targets
- No direct Firestore calls from UI components
- All state reads from local Dexie database (via domain services)
- Domain operations triggered by user actions

### 3.2 Domain / Local Engine

**Technology:** TypeScript modules, Dexie.js, IndexedDB

Responsibilities:
- Business rule enforcement (stock validation, financial integrity)
- All CRUD operations on local database
- Transaction integrity (atomic writes)
- Money handling (integer paise, never float)
- Writes events to `sync_outbox` after every mutation
- Reads for UI rendering

This layer is **testable independently of the UI and Firebase**.

### 3.3 Sync Engine

**Technology:** TypeScript service worker + background service

Responsibilities:
- Polls `sync_outbox` for pending events
- Uploads events to Firestore when online
- Marks events as `synced` on acknowledgement
- Handles idempotency (deduplication by `eventId`)
- Retries with exponential backoff
- Does not block UI

### 3.4 Cloud Engine

**Technology:** Firebase Authentication, Firestore, Firebase Storage (where needed)

Responsibilities:
- Identity (Firebase Auth — Google, phone, or anonymous)
- Cloud persistence (Firestore)
- Backup storage (Firebase Storage for exports)
- Security rules enforce shop isolation

### 3.5 Intelligence Engine

**Technology:** Pure TypeScript, computed from local database

Responsibilities:
- Product velocity (units/day)
- Stock coverage (days remaining)
- Reorder recommendations (deterministic formula)
- Dead stock detection
- Sales trend (compare vs. historical baseline)
- Cash reconciliation analysis
- Profit estimation

All intelligence outputs are **deterministic, verifiable, and explainable**.
AI layer (future) reads from intelligence engine outputs, not raw database.

---

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Local DB | Dexie.js (IndexedDB wrapper) |
| Auth | Firebase Authentication |
| Cloud DB | Firestore |
| Cloud Storage | Firebase Storage (backups only) |
| Hosting | Cloudflare Pages |
| Testing | Vitest, Testing Library, Playwright |
| Lint | ESLint, Prettier |

---

## 5. Offline Strategy

### Service Worker

- Caches application shell (HTML, JS, CSS, fonts)
- Implements stale-while-revalidate for assets
- Background sync registration for outbox flush

### Application

- All operational reads: local Dexie only
- All writes: local Dexie first, then outbox
- Sync status indicator (not frightening): `✓ All synced` or `Offline — saved locally`
- Firebase SDK offline persistence enabled (secondary backup)

### Failure Modes

| Scenario | Behavior |
|---|---|
| No internet | Full operation, data saved locally |
| Firebase outage | Full operation, sync when restored |
| Browser refresh | Data persists in IndexedDB |
| Browser crash | Committed transactions survive |
| Partial sync | Outbox retries from last unsynced event |

---

## 6. Module Dependency Rules

```
UI components
  → may use: Domain services, React hooks
  → must NOT use: Dexie directly, Firebase directly

Domain services
  → may use: Dexie, Money utilities, ID utilities
  → must NOT use: React, Firebase

Sync engine
  → may use: Dexie (sync_outbox), Firebase
  → must NOT use: React, Domain services (to avoid cycles)

Intelligence engine
  → may use: Dexie (read-only queries)
  → must NOT use: Firebase, React

AI layer (future)
  → may use: Intelligence engine outputs only
  → must NOT use: Raw Dexie, Firebase
```

---

## 7. Money Handling

All financial amounts stored and computed in **integer paise (1/100 rupee)**.

```typescript
// WRONG
const price = 80.50;  // float — never do this

// RIGHT
const price = 8050;   // paise

// Utility
import { formatMoney, addMoney, subtractMoney } from '@/lib/money';
```

See `src/lib/money.ts` and `docs/DATA_MODEL.md` for full specification.

---

## 8. ID Strategy

All entity IDs are:
- `crypto.randomUUID()` (v4 UUID, browser-native)
- Generated client-side at creation time
- Never auto-incremented integers (which conflict across devices)
- Stored as strings

---

## 9. PWA Configuration

- `manifest.json`: name, icons, theme, display=standalone
- Service worker: Workbox via `next-pwa` or custom
- Install prompt: shown contextually (not immediately)
- Update flow: silent in background, refresh prompt after update

---

## 10. Architectural Risks

See `docs/DECISIONS.md` for open decisions and risks.

Key risks:
1. IndexedDB storage limits (typically 1GB+ on modern devices — acceptable for V1)
2. Firestore free tier limits (50k reads, 20k writes/day — adequate for single shop)
3. Conflict resolution complexity if multi-device before sync design is complete
4. Service worker cache invalidation during app updates
5. Data migration when schema evolves (Dexie versioning strategy needed)
