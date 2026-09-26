# BaithakOS — Sync Protocol

---

## 1. Design Philosophy

**The local database is the primary source of truth.**

Synchronization is a background concern. It must:
- Never block the user interface
- Never lose a committed local operation
- Handle offline periods of arbitrary length
- Be idempotent (safe to replay)
- Resolve conflicts safely

---

## 2. Outbox Pattern

Every domain mutation generates a `SyncOutboxEvent` **atomically** with the local write.

```typescript
// Pseudocode for a sale creation
await db.transaction('rw', [db.sales, db.sale_items, db.sync_outbox], async () => {
  await db.sales.add(sale);
  await db.sale_items.bulkAdd(saleItems);
  await db.sync_outbox.add({
    id: crypto.randomUUID(),
    entityType: 'sale',
    entityId: sale.id,
    operation: 'create',
    payload: { sale, saleItems },
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  });
});
```

If the Dexie transaction fails, neither the sale nor the outbox event is written.
If the transaction succeeds, both are committed atomically.

---

## 3. Sync Flow

```
[Online check]
       │
       ▼
[Read pending events from sync_outbox, ordered by createdAt ASC]
       │
       ▼
[For each event:]
       │
       ├── Mark status = 'uploading'
       │
       ▼
[Write event to Firestore: shops/{shopId}/sync_events/{eventId}]
       │
       ├── Success:
       │     Mark local event status = 'synced'
       │
       └── Failure:
             increment retryCount
             Mark status = 'pending'
             Apply exponential backoff
             Skip to next event
```

---

## 4. Idempotency

Each event has a globally unique `id` (UUID v4).

On Firestore write, use `setDoc` with the `eventId` as the document ID:

```typescript
await setDoc(
  doc(db, `shops/${shopId}/sync_events/${event.id}`),
  event,
  { merge: false }
);
```

If the same event arrives twice (e.g., app crashed after write but before marking synced):
- Firestore silently accepts the identical document (same content, same ID)
- The local outbox marks the event as synced
- **One business operation results**

Cloud functions reading the event stream must check if the event has already been applied (by event ID) before acting.

---

## 5. Sync Engine Lifecycle

The sync engine is a singleton service started at application boot.

```typescript
class SyncEngine {
  private isOnline: boolean;
  private isSyncing: boolean;

  start(): void;         // begin monitoring
  stop(): void;          // cleanup
  flush(): Promise<void>; // attempt immediate sync
  status(): SyncStatus;  // for UI indicator
}
```

It listens to:
- `window.addEventListener('online', ...)` → trigger flush
- `window.addEventListener('offline', ...)` → update status
- Dexie live query on `sync_outbox WHERE status = 'pending'` → trigger flush

---

## 6. Retry Strategy

| Attempt | Delay |
|---|---|
| 1 | immediate |
| 2 | 5 seconds |
| 3 | 30 seconds |
| 4 | 2 minutes |
| 5+ | 10 minutes (cap) |

Events with `retryCount >= 10` are marked `failed` and reported in the developer diagnostics panel. They do not block other events.

---

## 7. Sync Status UI

The UI displays a non-alarming sync indicator:

| State | Display |
|---|---|
| All synced | `✓ All data saved` |
| Syncing | `Syncing...` (subtle) |
| Offline | `Offline — changes saved locally` |
| Error | `Sync issue — contact support` (only if persistent failure) |

**Never show technical error messages to the shop owner.**

---

## 8. Conflict Strategy

### 8.1 Sales

Sales are append-only. Concurrent creation on two devices produces two separate sales — this is correct behavior. Sale IDs are UUIDs, so no conflict.

Reversals reference the original sale ID. If both devices reverse the same sale:
- The second reversal must be rejected (check `sale.status === 'reversed'` before applying)
- The cloud function validates this and marks the second event as `conflict_rejected`

### 8.2 Products / Inventory

Last-write-wins using `updatedAt` timestamp, with one exception:

**Stock quantity** uses increment semantics, not absolute overwrites:

```
Instead of: SET stock = 50
Use:        ADD delta = +20 (a purchase recorded on device A)
            ADD delta = -3  (a sale on device B)
```

Stock adjustments are additive events. The current stock is always `SUM(all deltas from creation)`.

This is critical for multi-device correctness.

### 8.3 Expenses / Purchases / Customers

- Expenses: append-only (each is a new document)
- Purchases: append-only
- Customers: last-write-wins on `updatedAt`
- Customer ledger: append-only (each entry is a new document)

### 8.4 Settings / Shop

Last-write-wins on `updatedAt`.

---

## 9. Conflict Documentation Table

| Entity | Concurrent Write? | Strategy | User Review? |
|---|---|---|---|
| Sale (create) | Yes (normal) | Append — no conflict | No |
| Sale (reverse) | Possible | Validate state; reject duplicate reversal | No |
| Product price | Yes | Last write wins (`updatedAt`) | No |
| Stock quantity | Yes | Delta-based, additive events | No |
| Expense | Yes (different IDs) | Append — no conflict | No |
| Customer info | Yes | Last write wins | No |
| Customer ledger | Yes (different IDs) | Append — no conflict | No |
| Daily summary | Yes | Last write wins (single device should close) | Review if 2-device |
| Shop settings | Rare | Last write wins | No |

---

## 10. Full Data Recovery

If a device loses its IndexedDB (browser storage cleared, new device):

1. User logs in with Firebase Auth
2. App detects empty local DB
3. App triggers **full cloud restore**:
   - Downloads all Firestore documents for `shopId`
   - Rebuilds local Dexie database
   - Verifies core invariants post-restore
4. App becomes operational

This must be tested with:
```
Export → delete local DB → restore → compare → verify invariants
```

---

## 11. Firestore Structure

```
shops/
  {shopId}/
    (shop document)
    products/
      {productId}/
    sales/
      {saleId}/
    sale_items/
      {itemId}/
    purchases/
      {purchaseId}/
    purchase_items/
      {itemId}/
    expenses/
      {expenseId}/
    customers/
      {customerId}/
    customer_ledger/
      {entryId}/
    stock_adjustments/
      {adjustmentId}/
    sync_events/
      {eventId}/        ← outbox events for idempotency tracking
    daily_summaries/
      {summaryId}/
```

---

## 12. Firestore Security Rules

See `docs/SECURITY.md` for full rules.

Key invariant: **no client can read or write documents for a shop they are not authenticated to.**
