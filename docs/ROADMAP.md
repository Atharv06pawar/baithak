# BaithakOS — Implementation Roadmap

---

## Phase 0 — Discovery ✅

**Goal:** Architecture, data model, sync protocol, security plan, test strategy.

Deliverables:
- [x] `docs/PRODUCT.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATA_MODEL.md`
- [x] `docs/SYNC_PROTOCOL.md`
- [x] `docs/SECURITY.md`
- [x] `docs/TEST_PLAN.md`
- [x] `docs/UX_PRINCIPLES.md`
- [x] `docs/DECISIONS.md`
- [x] `docs/ROADMAP.md`
- [x] Risk identification

---

## Phase 1 — Vertical Slice 🔄

**Goal:** One complete, verified, offline-working flow.

```
Shop setup
 ↓
Create product
 ↓
Sell product
 ↓
Inventory decreases
 ↓
Sale appears in history
 ↓
Refresh browser
 ↓
Data remains correct
```

Deliverables:
- [ ] Next.js 14 project with TypeScript, Tailwind
- [ ] Dexie schema (all tables defined)
- [ ] Money utility (`src/lib/money.ts`) with tests
- [ ] Shop initialization (local-only, no auth yet)
- [ ] Product domain service
- [ ] Sale domain service
- [ ] POS screen (minimal: product list, cart, complete sale)
- [ ] Sale history screen
- [ ] Sync outbox infrastructure
- [ ] Vitest unit tests for money + domain
- [ ] E2E test: create sale, refresh, verify persistence
- [ ] `npm run build` passes
- [ ] PWA manifest and service worker (basic)

**Exit criterion:** The vertical slice flow works reliably with persistence after refresh.

---

## Phase 2 — Complete POS

**Goal:** Production-quality billing workflow.

```
Fast product search
Product quick buttons
Cart with quantity editing
Cash / UPI payment
Discount support
Receipt
Sale history + detail
Sale reversal
```

Deliverables:
- [ ] Product search (fuzzy, fast)
- [ ] Quick-button grid (top products by velocity)
- [ ] Quantity editing in cart
- [ ] Cash received / change calculation
- [ ] UPI payment flow
- [ ] Receipt screen (printable)
- [ ] Sale history with filters
- [ ] Sale reversal with reason
- [ ] 2–5 second target transaction time
- [ ] Performance test with 50,000 historical sales

**Exit criterion:** 100 test sales, zero errors, under 5 seconds each.

---

## Phase 3 — Inventory + Purchases

**Goal:** Inventory is always accurate and visible.

Deliverables:
- [ ] Product management screen
- [ ] Stock level display
- [ ] Purchase recording
- [ ] Supplier management
- [ ] Stock adjustment (manual correction)
- [ ] Low-stock alerts
- [ ] Stock movement history
- [ ] Stock coverage display
- [ ] Dead stock identification

**Exit criterion:** Stock invariant verified by automated test after 10,000 simulated operations.

---

## Phase 4 — Business Operations

**Goal:** Owner can manage the full business day.

Deliverables:
- [ ] Expense recording (quick entry)
- [ ] Expense categories
- [ ] Udhaar management (per customer)
- [ ] Customer ledger history
- [ ] Cash reconciliation (expected vs. declared)
- [ ] Daily closing workflow
- [ ] Day summary report
- [ ] Weekly / monthly summary

**Exit criterion:** Daily close produces correct numbers verified against raw transaction data.

---

## Phase 5 — Backup + Cloud

**Goal:** Data is safe, sync is reliable.

Deliverables:
- [ ] Firebase Authentication integration
- [ ] Firestore sync (outbox → cloud)
- [ ] Firestore security rules (tested)
- [ ] Full data export (JSON)
- [ ] Full data restore (from JSON)
- [ ] Export → delete → restore → verify flow
- [ ] Offline sync test (disconnect, transact, reconnect, verify)
- [ ] Duplicate event idempotency test
- [ ] Cloudflare Pages deployment

**Exit criterion:** Restore from export produces byte-identical business state.

---

## Phase 6 — Intelligence

**Goal:** Actionable insights, honestly computed.

Deliverables:
- [ ] Product velocity (units/day by period)
- [ ] Stock coverage (days remaining per product)
- [ ] Reorder recommendations (with explanation)
- [ ] Dead stock detection
- [ ] Sales trend (vs. historical baseline)
- [ ] Profit estimation (with cost caveats)
- [ ] Action center (severity-ranked alerts)
- [ ] Dashboard (today's summary + alerts)
- [ ] Basic forecasting (weighted moving average)
- [ ] All predictions labeled with confidence

**Exit criterion:** Each intelligence output verified against hand-calculated expected values using simulator data.

---

## Phase 7 — AI (Ask Baithak)

**Goal:** Natural language interface to verified analytics.

Deliverables:
- [ ] Intelligence engine outputs as structured context
- [ ] LLM integration (free tier: Gemini API)
- [ ] "Ask Baithak" UI
- [ ] Verified: LLM cannot answer financial questions without querying analytics engine
- [ ] Graceful "I don't have enough data" responses
- [ ] Voice input (optional)

**Exit criterion:** AI answers are 100% consistent with deterministic analytics for a set of benchmark questions.

---

## Phase 8 — Real Shop Pilot

**Goal:** Deploy to actual paan shop. Verify against real operations.

Deliverables:
- [ ] Shop owner onboarding flow
- [ ] Product catalog import
- [ ] Staff training guide
- [ ] Parallel run (paper + BaithakOS) for 2 weeks
- [ ] Discrepancy investigation and resolution
- [ ] Final sign-off from shop owner

**Exit criterion:** Shop owner says "I trust this with my shop."

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| IndexedDB storage limit hit | Low | Medium | Monitor DB size in diagnostics; compress payloads |
| Firestore free tier exceeded | Low | Medium | Aggressive local caching; read from local DB only |
| Schema migration breaks existing data | Medium | High | Dexie versioning with migration scripts; test before deploy |
| Service worker cache stale after update | Medium | Medium | Version cache names; force update on new deploy |
| Multi-device stock conflict | Medium | High | Delta-based stock model (not absolute writes) |
| Owner loses device (phone) | Low | High | Automatic cloud sync means restore is straightforward |
| Clock skew between devices | Low | Medium | Use server timestamp on Firestore writes as canonical |
| Owner cannot understand error | Low | High | All errors surfaced as user-safe messages only |
