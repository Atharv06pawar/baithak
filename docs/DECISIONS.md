# BaithakOS — Architectural Decisions

This document records significant decisions, their rationale, and alternatives considered.

---

## Decision 001 — Local-first architecture

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Use IndexedDB (via Dexie) as the primary operational data store. Firebase/Firestore is a sync target, not the primary source of truth.

**Rationale:** Internet connectivity in Indian tier-2/3 markets is unreliable. The owner must never be blocked from completing a sale due to internet issues. Local-first guarantees responsiveness and offline capability.

**Alternatives considered:**
- Firestore-first: Rejected because it fails when offline.
- PouchDB + CouchDB: Considered, rejected due to hosting cost (CouchDB requires a server).
- SQLite (WASM): Considered; Dexie/IndexedDB is more mature in browser contexts and has excellent TypeScript support.

---

## Decision 002 — Money as integer paise

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** All monetary values stored and computed as integer paise (1/100 rupee). No floating-point arithmetic anywhere in the financial domain.

**Rationale:** Floating-point arithmetic produces incorrect results for currency (e.g., 0.1 + 0.2 ≠ 0.3 in IEEE 754). Financial software must be exact.

**Alternatives considered:**
- `decimal.js` / `big.js`: Viable alternative, but adds a dependency. Integer paise is simpler, faster, and requires no library.
- Store as string: Rejected — requires parsing for every computation.

---

## Decision 003 — Outbox pattern for sync

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Every domain mutation writes an event to `sync_outbox` atomically. A background sync engine drains the outbox when online.

**Rationale:** Guarantees that no committed local operation is ever lost. The outbox survives browser crashes, navigation, and connectivity loss.

**Alternatives considered:**
- Direct Firestore writes with local fallback: Rejected — race conditions and no guaranteed delivery.
- Firebase offline persistence only: Rejected — Firebase's own offline mode is opaque and not fully controllable.

---

## Decision 004 — UUID client-side IDs

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** All entity IDs are UUID v4 generated client-side using `crypto.randomUUID()`.

**Rationale:** Auto-increment integers require a server to guarantee uniqueness across devices. UUIDs are collision-resistant and work offline.

**Alternatives considered:**
- Firestore auto-IDs: Viable but requires Firestore to be available at creation time.
- ULID: Good alternative (sortable), considered for future if sorting by ID becomes important.

---

## Decision 005 — Next.js App Router

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Use Next.js 14 with App Router and TypeScript.

**Rationale:** Specified in the product requirements. React Server Components provide good performance. TypeScript ensures type safety across the codebase.

**Alternatives considered:**
- Vite + React SPA: Simpler for a fully client-rendered PWA. May revisit if Next.js server features add complexity without value.
- Remix: Good offline story but less community tooling for PWA.

---

## Decision 006 — Tailwind CSS

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Use Tailwind CSS for styling.

**Rationale:** Specified in the product requirements. Fast iteration, consistent design system, excellent mobile-first utilities.

---

## Decision 007 — Vitest for testing

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Use Vitest for unit and integration tests, Playwright for E2E.

**Rationale:** Vitest is fast, compatible with TypeScript and ESM, integrates well with Vite/Next.js build tooling. Playwright provides reliable cross-browser E2E testing with good offline simulation support.

**Alternatives considered:**
- Jest: Slower, more complex ESM config. Vitest is the modern successor.
- Cypress: Good E2E tool but slower startup; Playwright's offline support is superior.

---

## Decision 008 — Cloudflare Pages for hosting

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Deploy to Cloudflare Pages (free tier).

**Rationale:** Specified in the product requirements. Generous free tier, global CDN, supports Next.js via `@cloudflare/next-on-pages`, no credit card required.

**Alternatives considered:**
- Vercel: Excellent Next.js support but free tier has usage limits that could incur cost.
- Firebase Hosting: Viable, tight integration with Firebase Auth/Firestore, but adds coupling.
- Netlify: Good option, similar to Cloudflare Pages.

---

## Decision 009 — Delta-based stock model

**Date:** 2025-01-01
**Status:** Accepted

**Decision:** Stock quantity is derived from sum of all deltas (purchases, sales, adjustments), not a single mutable integer.

**Rationale:** In multi-device scenarios, if both devices write `SET stock = 50`, one write wins and the other's operation is lost. Delta-based model (`ADD +100`, `SUBTRACT -3`) is commutative and safe.

**Alternatives considered:**
- Mutable stock count with last-write-wins: Rejected due to multi-device conflict risk.
- CRDT-based merge: Considered for future; overkill for V1 single-device scenario.

**Note:** For V1 (single device), a mutable stock count with full audit history is acceptable as a simpler implementation. The delta-derivation must be verified by invariant tests. Multi-device delta semantics implemented in Phase 5.

---

## Open Decisions

| ID | Question | Impact | Decision Needed By |
|---|---|---|---|
| OD-001 | Service worker strategy: `next-pwa` or custom Workbox? | Medium | Phase 1 |
| OD-002 | Firebase Auth: enable anonymous auth for trial mode? | Low | Phase 5 |
| OD-003 | Receipt printing: browser print dialog vs. thermal printer? | Medium | Phase 2 |
| OD-004 | LLM for Ask Baithak: Gemini API free tier vs. self-hosted? | Medium | Phase 7 |
| OD-005 | Hindi language support: full i18n or Hinglish-only UI? | Medium | Phase 2 |
| OD-006 | Barcode scanning: camera-based (QuaggaJS) or dedicated scanner? | Low | Phase 3 |
