# BaithakOS — Data Model

---

## 1. Money Convention

All monetary values are stored as **integer paise** (smallest Indian currency unit, 1/100 of ₹1).

```
₹80.50 → 8050 (paise)
₹0.00  → 0
₹1,000 → 100000
```

**Never** use floating-point for money calculations.
All math goes through `src/lib/money.ts`.

---

## 2. ID Convention

- All IDs: `crypto.randomUUID()` — UUID v4 string
- Never auto-increment
- Client-generated at creation time

---

## 3. Timestamp Convention

- All timestamps: Unix milliseconds (`number`)
- Stored as integers in IndexedDB
- Firestore: Firestore Timestamp (converted on sync)

---

## 4. Schema

### 4.1 `shops`

```typescript
interface Shop {
  id: string;                // UUID
  name: string;              // "Sharma Paan House"
  ownerName: string;
  phone?: string;
  address?: string;
  gstin?: string;
  currencyCode: 'INR';
  timezone: string;          // "Asia/Kolkata"
  createdAt: number;         // ms timestamp
  updatedAt: number;
}
```

### 4.2 `shop_settings`

```typescript
interface ShopSettings {
  id: string;                // same as shopId
  shopId: string;
  openingCash: number;       // paise — opening cash drawer
  lowStockThreshold: number; // default minimum stock alert
  defaultTaxRate: number;    // paise per 100 paise (e.g., 500 = 5%)
  upiId?: string;
  receiptFooter?: string;
  paymentMethods: ('cash' | 'upi' | 'card')[];
  updatedAt: number;
}
```

### 4.3 `categories`

```typescript
interface Category {
  id: string;
  shopId: string;
  name: string;              // "Paan", "Tobacco", "Beverages"
  sortOrder: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 4.4 `products`

```typescript
interface Product {
  id: string;
  shopId: string;
  name: string;
  categoryId?: string;
  sellingPrice: number;      // paise
  purchasePrice: number;     // paise (0 if unknown)
  stockQuantity: number;     // current stock
  minimumStock: number;      // low-stock alert threshold
  unit: string;              // "piece", "packet", "kg", "g", "ml", "bottle"
  supplierId?: string;
  barcode?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

**Future extensions (do not implement in V1):**
- `priceHistory: PriceHistoryEntry[]`
- `aliases: string[]`
- `multipleSuppliers: string[]`

### 4.5 `suppliers`

```typescript
interface Supplier {
  id: string;
  shopId: string;
  name: string;
  contactName?: string;
  phone?: string;
  address?: string;
  leadTimeDays: number;      // for reorder calculation
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 4.6 `sales`

```typescript
interface Sale {
  id: string;
  shopId: string;
  deviceId: string;
  saleNumber: number;        // sequential per shop per day (display only)
  status: 'completed' | 'reversed' | 'voided';
  customerId?: string;       // if udhaar sale
  paymentMethod: 'cash' | 'upi' | 'udhaar' | 'mixed';
  subtotal: number;          // paise — sum of items
  discountAmount: number;    // paise
  taxAmount: number;         // paise
  total: number;             // paise — subtotal - discount + tax
  cashReceived?: number;     // paise
  changeGiven?: number;      // paise
  notes?: string;
  servedBy?: string;         // actor/user
  createdAt: number;
  updatedAt: number;
  // Audit
  reversedAt?: number;
  reversedBy?: string;
  reversalReason?: string;
  reversalSaleId?: string;   // ID of the reversal event
}
```

**Append-only semantics:** Sales are never deleted. Reversals create a new event.

### 4.7 `sale_items`

```typescript
interface SaleItem {
  id: string;
  saleId: string;
  shopId: string;
  productId: string;
  productName: string;       // snapshot at time of sale
  quantity: number;
  unitPrice: number;         // paise — price per unit at time of sale
  discountAmount: number;    // paise on this line
  lineTotal: number;         // paise — (qty * unitPrice) - discount
  createdAt: number;
}
```

### 4.8 `purchases`

```typescript
interface Purchase {
  id: string;
  shopId: string;
  supplierId?: string;
  supplierName?: string;     // snapshot
  invoiceNumber?: string;
  purchaseDate: number;      // ms timestamp
  status: 'completed' | 'cancelled';
  subtotal: number;          // paise
  total: number;             // paise
  notes?: string;
  recordedBy?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 4.9 `purchase_items`

```typescript
interface PurchaseItem {
  id: string;
  purchaseId: string;
  shopId: string;
  productId: string;
  productName: string;       // snapshot
  quantity: number;
  unitCost: number;          // paise per unit
  lineTotal: number;         // paise
  createdAt: number;
}
```

### 4.10 `expenses`

```typescript
interface Expense {
  id: string;
  shopId: string;
  category: ExpenseCategory;
  amount: number;            // paise
  description?: string;
  paymentMethod: 'cash' | 'upi' | 'bank_transfer';
  expenseDate: number;       // ms timestamp
  receiptRef?: string;       // Firebase Storage path
  recordedBy?: string;
  createdAt: number;
  updatedAt: number;
}

type ExpenseCategory =
  | 'rent'
  | 'electricity'
  | 'staff'
  | 'transportation'
  | 'maintenance'
  | 'purchase'       // supplier payments
  | 'miscellaneous';
```

### 4.11 `customers`

```typescript
interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 4.12 `customer_ledger`

```typescript
interface CustomerLedgerEntry {
  id: string;
  shopId: string;
  customerId: string;
  type: 'sale' | 'payment' | 'adjustment';
  saleId?: string;           // reference if type === 'sale'
  amount: number;            // paise — positive = debt added, negative = payment
  runningBalance: number;    // paise — balance after this entry
  note?: string;
  recordedBy?: string;
  createdAt: number;
}
```

### 4.13 `stock_adjustments`

```typescript
interface StockAdjustment {
  id: string;
  shopId: string;
  productId: string;
  productName: string;       // snapshot
  adjustmentType: 'addition' | 'removal' | 'correction' | 'damage' | 'expiry';
  quantityBefore: number;
  quantityChange: number;    // positive = addition, negative = removal
  quantityAfter: number;
  reason?: string;
  recordedBy?: string;
  createdAt: number;
}
```

### 4.14 `audit_logs`

```typescript
interface AuditLog {
  id: string;
  shopId: string;
  deviceId: string;
  entityType: string;        // 'sale', 'product', 'expense', etc.
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'reverse';
  actorId?: string;
  payload: Record<string, unknown>; // what changed
  createdAt: number;
}
```

### 4.15 `sync_outbox`

```typescript
interface SyncOutboxEvent {
  id: string;                // eventId — UUID, used for idempotency
  shopId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  payload: Record<string, unknown>;
  status: 'pending' | 'uploading' | 'synced' | 'failed';
  retryCount: number;
  lastAttempt?: number;
  error?: string;
  createdAt: number;
}
```

### 4.16 `sync_state`

```typescript
interface SyncState {
  id: string;                // shopId
  shopId: string;
  lastSyncedAt?: number;
  lastSyncedEventId?: string;
  deviceId: string;
  status: 'idle' | 'syncing' | 'error' | 'offline';
  errorMessage?: string;
  updatedAt: number;
}
```

### 4.17 `devices`

```typescript
interface Device {
  id: string;                // UUID, generated once, stored in localStorage
  shopId: string;
  deviceName?: string;       // "Counter phone", "Owner tablet"
  platform: string;          // navigator.platform
  firstSeen: number;
  lastSeen: number;
}
```

### 4.18 `daily_summaries`

```typescript
interface DailySummary {
  id: string;                // `${shopId}_${dateStr}` e.g. "shop123_2025-01-15"
  shopId: string;
  dateStr: string;           // "2025-01-15" (YYYY-MM-DD, local timezone)
  openingCash: number;       // paise
  closingCash?: number;      // paise — declared by owner
  expectedCash?: number;     // paise — computed
  cashDifference?: number;   // paise — expected - declared
  totalSales: number;        // paise
  totalTransactions: number;
  cashSales: number;         // paise
  upiSales: number;          // paise
  udhaarAdded: number;       // paise
  udhaarCollected: number;   // paise
  totalExpenses: number;     // paise
  totalRefunds: number;      // paise
  grossProfit: number;       // paise — estimated
  status: 'open' | 'closed';
  closedAt?: number;
  closedBy?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 4.19 `analytics_snapshots`

```typescript
interface AnalyticsSnapshot {
  id: string;                // `${shopId}_${dateStr}_${snapshotType}`
  shopId: string;
  dateStr: string;
  snapshotType: 'daily' | 'weekly' | 'monthly';
  data: Record<string, unknown>; // flexible analytics payload
  computedAt: number;
  createdAt: number;
}
```

---

## 5. Core Invariants

These must be verified by automated tests continuously:

```
opening_stock
+ total_purchase_quantity
- total_sold_quantity
+/- total_adjustments
= current_stock_quantity
```

```
sale.total
= sale.subtotal - sale.discountAmount + sale.taxAmount
```

```
sale.subtotal
= SUM(sale_items.lineTotal)
```

```
daily_revenue
= SUM(sales.total WHERE status = 'completed' AND date = today)
```

```
expected_cash
= opening_cash
+ SUM(cash_sales)
- SUM(cash_refunds)
- SUM(cash_expenses)
```

```
customer_ledger_entry.runningBalance
= previous_running_balance + entry.amount
```

---

## 6. Dexie Schema Definition (abbreviated)

```typescript
// src/lib/db/schema.ts
const db = new Dexie('BaithakOS');
db.version(1).stores({
  shops:              'id, name',
  shop_settings:      'id, shopId',
  categories:         'id, shopId, sortOrder',
  products:           'id, shopId, categoryId, supplierId, active, name',
  suppliers:          'id, shopId, active',
  sales:              'id, shopId, deviceId, status, createdAt, paymentMethod',
  sale_items:         'id, saleId, shopId, productId',
  purchases:          'id, shopId, supplierId, purchaseDate',
  purchase_items:     'id, purchaseId, shopId, productId',
  expenses:           'id, shopId, category, expenseDate',
  customers:          'id, shopId, phone, active',
  customer_ledger:    'id, shopId, customerId, createdAt',
  stock_adjustments:  'id, shopId, productId, createdAt',
  audit_logs:         'id, shopId, entityType, entityId, createdAt',
  sync_outbox:        'id, shopId, status, createdAt',
  sync_state:         'id, shopId',
  devices:            'id, shopId',
  daily_summaries:    'id, shopId, dateStr, status',
  analytics_snapshots:'id, shopId, dateStr, snapshotType',
});
```
