# BaithakOS — Test Plan

---

## 1. Testing Philosophy

Tests verify that **real shop operations produce correct results**.

We test:
1. Money calculations (exact, integer, never float)
2. Inventory invariants (stock always balances)
3. Business flows (sale → stock decreases → ledger updated)
4. Offline operation (works without internet)
5. Failure recovery (browser crash, sync failure, corruption)
6. Security boundaries (unauthorized access rejected)

We do NOT test:
- Implementation details that don't affect behavior
- UI rendering beyond integration flows
- Firebase's own behavior

---

## 2. Test Layers

### Layer 1: Unit Tests (Vitest)

Location: `src/**/__tests__/unit/`
Run: `npm test`

Coverage targets:
- `src/lib/money.ts` → 100%
- `src/lib/domain/*.ts` → 90%+
- `src/lib/intelligence/*.ts` → 90%+

### Layer 2: Integration Tests (Vitest + Dexie fake)

Location: `src/**/__tests__/integration/`
Run: `npm run test:integration`

Use Dexie's in-memory adapter (or fake-indexeddb).
Test complete domain flows without UI.

### Layer 3: Browser / E2E Tests (Playwright)

Location: `tests/e2e/`
Run: `npm run test:e2e`

Tests critical user journeys in a real browser.

### Layer 4: Offline Tests (Playwright)

Location: `tests/e2e/offline/`
Requires: Playwright service worker interception

---

## 3. Required Unit Tests

### 3.1 Money Utilities (`src/lib/money.test.ts`)

```
- formatMoney(8050) === '₹80.50'
- formatMoney(0) === '₹0.00'
- formatMoney(100000) === '₹1,000.00'
- addMoney(100, 200) === 300
- subtractMoney(500, 200) === 300
- subtractMoney(200, 500) === -300 (negative allowed for change)
- multiplyMoney(1000, 3) === 3000
- applyDiscount(10000, 10) === 9000 (10% off ₹100.00)
- applyDiscount(10000, 0) === 10000
- applyDiscount(10000, 100) === 0
- NEVER produces a float in intermediate steps
```

### 3.2 Sale Domain (`src/lib/domain/sale.test.ts`)

```
- createSale: subtotal = SUM(lineTotal for each item)
- createSale: total = subtotal - discount + tax
- createSale: each lineTotal = qty * unitPrice - lineDiscount
- reverseSale: original sale status becomes 'reversed'
- reverseSale: stock is restored for each item
- reverseSale: cannot reverse an already-reversed sale
- reverseSale: creates audit log entry
- completeSale: stock is decremented for each item
- completeSale: rejects if insufficient stock (with configurable warning)
- completeSale: creates sync outbox event atomically
```

### 3.3 Inventory (`src/lib/domain/inventory.test.ts`)

```
- purchase adds stock
- sale reduces stock
- manual adjustment changes stock
- currentStock = openingStock + purchases - sales +/- adjustments
- lowStockAlert triggered when quantity <= minimumStock
- stockCoverage = stockQuantity / avgDailySales
```

### 3.4 Customer Ledger (`src/lib/domain/ledger.test.ts`)

```
- udhaar sale: ledger entry created with positive amount
- payment: ledger entry created with negative amount
- runningBalance is correct after each entry
- runningBalance history is never modified (append-only)
- outstanding = SUM(all entry amounts for customer)
```

### 3.5 Cash Reconciliation (`src/lib/domain/reconciliation.test.ts`)

```
- expectedCash = openingCash + cashSales - cashRefunds - cashExpenses
- mismatch = expectedCash - declaredCash
- zero mismatch when all transactions are correctly recorded
- mismatch reason: correctly identifies missing cash sale
- mismatch reason: correctly identifies wrong payment method
```

### 3.6 Sync Outbox (`src/lib/sync/outbox.test.ts`)

```
- domain write creates outbox event atomically
- if domain write fails, no outbox event is created
- if outbox write fails, domain write is rolled back
- flushing sends pending events in createdAt order
- successful send marks event as 'synced'
- failed send increments retryCount
- retryCount >= 10 marks event as 'failed'
- idempotent: sending same event twice → same Firestore document
- offline: flush skips silently when no internet
```

---

## 4. Required Integration Tests

### 4.1 Vertical Slice: Create Product → Sell → Verify Stock

```
1. Create shop (in-memory Dexie)
2. Create product: Meetha Paan, ₹20, stock=50
3. Create sale: 3x Meetha Paan
4. Assert: sale.total = 6000 paise (₹60)
5. Assert: product.stockQuantity = 47
6. Assert: audit_log has entry for sale
7. Assert: sync_outbox has pending event for sale
```

### 4.2 Purchase → Stock Update

```
1. Product: stockQuantity = 10
2. Record purchase: 100 units at ₹15 each
3. Assert: product.stockQuantity = 110
4. Assert: purchase is in database
5. Assert: sync_outbox has events for purchase and stock update
```

### 4.3 Udhaar Sale → Payment → Balance

```
1. Create customer: Rahul
2. Create udhaar sale: ₹80
3. Assert: ledger entry amount = 8000, balance = 8000
4. Create udhaar sale: ₹40
5. Assert: ledger entry amount = 4000, balance = 12000
6. Record payment: ₹100
7. Assert: ledger entry amount = -10000, balance = 2000
```

### 4.4 Daily Close

```
1. Record 10 sales (mixed cash/UPI)
2. Record 2 expenses
3. Open daily close workflow
4. Verify expectedCash calculation
5. Enter declaredCash
6. Assert: cashDifference = correct
7. Assert: summary can be saved
```

---

## 5. E2E Tests (Playwright)

### 5.1 Full Sale Flow

```
1. Open app
2. Navigate to POS
3. Add product to cart
4. Set quantity to 3
5. Click Complete Sale
6. Verify: success screen shown
7. Verify: cart is cleared
8. Navigate to sale history
9. Verify: sale appears with correct total
```

### 5.2 Refresh Persistence

```
1. Complete a sale
2. Hard refresh browser (Ctrl+F5)
3. Navigate to sale history
4. Verify: sale is still present with correct data
```

### 5.3 Offline Sale

```
1. Intercept network (Playwright service worker / context)
2. Complete a sale (should work)
3. Navigate to history (should show sale)
4. Restore network
5. Verify: sync outbox events are sent
6. Verify: sale status shows as synced
```

---

## 6. Failure Tests

| Scenario | Expected Behavior | Test Type |
|---|---|---|
| Internet disconnect during sale | Sale saved locally, synced when reconnected | E2E offline |
| Browser refresh during sale creation | Sale not saved (uncommitted) | E2E |
| Browser refresh after sale committed | Sale persists | E2E |
| Duplicate sync event | One business operation results | Unit |
| Firebase unavailable | App continues, sync queued | E2E offline |
| Partial sync (crash mid-flush) | Outbox retries from last unsynced | Unit |
| Device clock wrong by 1 day | Operations still correct, analyst flags anomaly | Unit |
| Invalid product quantity (negative) | Rejected with clear error | Unit + E2E |
| Invalid price (float) | Rejected before storage | Unit |
| Unauthorized shop access | Firestore rules reject | Security test |
| Sell product with zero stock | Warning shown, requires confirmation | Unit + E2E |

---

## 7. Core Invariant Verification

The following invariants must be verified by automated tests after every data mutation sequence:

```typescript
// Stock invariant
async function verifyStockInvariant(productId: string, shopId: string) {
  const product = await db.products.get(productId);
  const purchases = await db.purchase_items
    .where({ shopId, productId }).toArray();
  const sales = await db.sale_items
    .where({ shopId, productId }).toArray();
  const adjustments = await db.stock_adjustments
    .where({ shopId, productId }).toArray();

  const expected =
    SUM(purchases.map(p => p.quantity)) -
    SUM(completedSales.map(s => s.quantity)) +
    SUM(adjustments.map(a => a.quantityChange));

  assert(product.stockQuantity === expected);
}
```

---

## 8. Synthetic Shop Simulator

Location: `src/testing/simulator/`

Generates realistic test data:
- 365 days of history
- 100 products (paan, tobacco, beverages, snacks)
- 50,000+ transactions
- Multiple suppliers
- Weekday/weekend patterns
- Random stockouts
- Seasonality (festival spikes)
- Udhaar customers with payment histories
- Returns / reversals
- Expense records

Used for:
- Performance testing (app must remain fast with full dataset)
- Intelligence algorithm verification
- Analytics accuracy testing
- Data migration testing

---

## 9. CI/CD

```yaml
# On every PR:
- npm run lint
- npm run type-check
- npm run test         # unit + integration
- npm run build        # production build must succeed

# On merge to main:
- All above
- npm run test:e2e     # Playwright
- Deploy to staging (Cloudflare Pages preview)
```
