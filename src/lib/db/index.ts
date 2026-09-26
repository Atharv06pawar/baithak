/**
 * BaithakOS — Dexie Database
 *
 * The single, authoritative local database instance.
 * All domain operations go through this.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Shop,
  ShopSettings,
  Category,
  Product,
  Supplier,
  Sale,
  SaleItem,
  Purchase,
  PurchaseItem,
  Expense,
  Customer,
  CustomerLedgerEntry,
  StockAdjustment,
  AuditLog,
  SyncOutboxEvent,
  SyncState,
  Device,
  DailySummary,
  AnalyticsSnapshot,
} from '@/lib/types';

export class BaithakDB extends Dexie {
  shops!: Table<Shop>;
  shop_settings!: Table<ShopSettings>;
  categories!: Table<Category>;
  products!: Table<Product>;
  suppliers!: Table<Supplier>;
  sales!: Table<Sale>;
  sale_items!: Table<SaleItem>;
  purchases!: Table<Purchase>;
  purchase_items!: Table<PurchaseItem>;
  expenses!: Table<Expense>;
  customers!: Table<Customer>;
  customer_ledger!: Table<CustomerLedgerEntry>;
  stock_adjustments!: Table<StockAdjustment>;
  audit_logs!: Table<AuditLog>;
  sync_outbox!: Table<SyncOutboxEvent>;
  sync_state!: Table<SyncState>;
  devices!: Table<Device>;
  daily_summaries!: Table<DailySummary>;
  analytics_snapshots!: Table<AnalyticsSnapshot>;

  constructor() {
    super('BaithakOS');

    this.version(1).stores({
      shops:               'id, name',
      shop_settings:       'id, shopId',
      categories:          'id, shopId, sortOrder',
      products:            'id, shopId, categoryId, supplierId, active, name',
      suppliers:           'id, shopId, active',
      sales:               'id, shopId, deviceId, status, createdAt, paymentMethod',
      sale_items:          'id, saleId, shopId, productId',
      purchases:           'id, shopId, supplierId, purchaseDate',
      purchase_items:      'id, purchaseId, shopId, productId',
      expenses:            'id, shopId, category, expenseDate',
      customers:           'id, shopId, phone, active',
      customer_ledger:     'id, shopId, customerId, createdAt',
      stock_adjustments:   'id, shopId, productId, createdAt',
      audit_logs:          'id, shopId, entityType, entityId, createdAt',
      sync_outbox:         'id, shopId, status, createdAt',
      sync_state:          'id, shopId',
      devices:             'id, shopId',
      daily_summaries:     'id, shopId, dateStr, status',
      analytics_snapshots: 'id, shopId, dateStr, snapshotType',
    });
  }
}

/**
 * Singleton DB instance.
 *
 * In tests, replace with an in-memory fake using fake-indexeddb:
 *   import { IDBFactory } from 'fake-indexeddb';
 *   const db = new BaithakDB();
 *   db.open({ indexedDB: new IDBFactory() });
 */
let _db: BaithakDB | null = null;

export function getDB(): BaithakDB {
  if (!_db) {
    _db = new BaithakDB();
  }
  return _db;
}

/** For testing only — resets the singleton */
export function _resetDB(): void {
  _db = null;
}
