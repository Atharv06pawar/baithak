/**
 * BaithakOS — Type Definitions
 *
 * All entities. All money fields are Paise (integer).
 */

import type { Paise } from './money';

// ─── Identity ───────────────────────────────────────────────────────────────

export type UUID = string;
export type Timestamp = number; // Unix milliseconds
export type DateStr = string;   // "YYYY-MM-DD"

// ─── Shop ───────────────────────────────────────────────────────────────────

export interface Shop {
  id: UUID;
  name: string;
  ownerName: string;
  phone?: string;
  address?: string;
  gstin?: string;
  currencyCode: 'INR';
  timezone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShopSettings {
  id: UUID; // same as shopId
  shopId: UUID;
  openingCash: Paise;
  lowStockThreshold: number;
  defaultTaxRate: number; // percent × 100 (e.g. 500 = 5%)
  upiId?: string;
  receiptFooter?: string;
  paymentMethods: PaymentMethod[];
  updatedAt: Timestamp;
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface Category {
  id: UUID;
  shopId: UUID;
  name: string;
  sortOrder: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: UUID;
  shopId: UUID;
  name: string;
  categoryId?: UUID;
  sellingPrice: Paise;
  purchasePrice: Paise;
  stockQuantity: number;
  minimumStock: number;
  unit: string; // "piece" | "packet" | "kg" | "g" | "ml" | "bottle"
  supplierId?: UUID;
  barcode?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: UUID;
  shopId: UUID;
  name: string;
  contactName?: string;
  phone?: string;
  address?: string;
  leadTimeDays: number;
  notes?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'upi' | 'udhaar' | 'mixed';
export type SaleStatus = 'completed' | 'reversed' | 'voided';

export interface Sale {
  id: UUID;
  shopId: UUID;
  deviceId: UUID;
  saleNumber: number;
  status: SaleStatus;
  customerId?: UUID;
  paymentMethod: PaymentMethod;
  subtotal: Paise;
  discountAmount: Paise;
  taxAmount: Paise;
  total: Paise;
  cashReceived?: Paise;
  changeGiven?: Paise;
  notes?: string;
  servedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Reversal
  reversedAt?: Timestamp;
  reversedBy?: string;
  reversalReason?: string;
  reversalSaleId?: UUID;
}

export interface SaleItem {
  id: UUID;
  saleId: UUID;
  shopId: UUID;
  productId: UUID;
  productName: string; // snapshot at sale time
  quantity: number;
  unitPrice: Paise;   // snapshot at sale time
  discountAmount: Paise;
  lineTotal: Paise;   // (qty × unitPrice) − discount
  createdAt: Timestamp;
}

// ─── Purchases ────────────────────────────────────────────────────────────────

export interface Purchase {
  id: UUID;
  shopId: UUID;
  supplierId?: UUID;
  supplierName?: string;
  invoiceNumber?: string;
  purchaseDate: Timestamp;
  status: 'completed' | 'cancelled';
  subtotal: Paise;
  total: Paise;
  notes?: string;
  recordedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PurchaseItem {
  id: UUID;
  purchaseId: UUID;
  shopId: UUID;
  productId: UUID;
  productName: string;
  quantity: number;
  unitCost: Paise;
  lineTotal: Paise;
  createdAt: Timestamp;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'rent'
  | 'electricity'
  | 'staff'
  | 'transportation'
  | 'maintenance'
  | 'purchase'
  | 'miscellaneous';

export interface Expense {
  id: UUID;
  shopId: UUID;
  category: ExpenseCategory;
  amount: Paise;
  description?: string;
  paymentMethod: 'cash' | 'upi' | 'bank_transfer';
  expenseDate: Timestamp;
  receiptRef?: string;
  recordedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Customers & Udhaar ──────────────────────────────────────────────────────

export interface Customer {
  id: UUID;
  shopId: UUID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LedgerEntryType = 'sale' | 'payment' | 'adjustment';

export interface CustomerLedgerEntry {
  id: UUID;
  shopId: UUID;
  customerId: UUID;
  type: LedgerEntryType;
  saleId?: UUID;
  amount: Paise; // positive = debt, negative = payment
  runningBalance: Paise;
  note?: string;
  recordedBy?: string;
  createdAt: Timestamp;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export type AdjustmentType = 'addition' | 'removal' | 'correction' | 'damage' | 'expiry';

export interface StockAdjustment {
  id: UUID;
  shopId: UUID;
  productId: UUID;
  productName: string;
  adjustmentType: AdjustmentType;
  quantityBefore: number;
  quantityChange: number; // positive = add, negative = remove
  quantityAfter: number;
  reason?: string;
  recordedBy?: string;
  createdAt: Timestamp;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export type AuditOperation = 'create' | 'update' | 'delete' | 'reverse';

export interface AuditLog {
  id: UUID;
  shopId: UUID;
  deviceId: UUID;
  entityType: string;
  entityId: UUID;
  operation: AuditOperation;
  actorId?: string;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'uploading' | 'synced' | 'failed';

export interface SyncOutboxEvent {
  id: UUID; // eventId — used for idempotency
  shopId: UUID;
  deviceId: UUID;
  entityType: string;
  entityId: UUID;
  operation: 'create' | 'update' | 'delete';
  timestamp: Timestamp;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retryCount: number;
  lastAttempt?: Timestamp;
  error?: string;
  createdAt: Timestamp;
}

export interface SyncState {
  id: UUID; // shopId
  shopId: UUID;
  lastSyncedAt?: Timestamp;
  lastSyncedEventId?: UUID;
  deviceId: UUID;
  status: 'idle' | 'syncing' | 'error' | 'offline';
  errorMessage?: string;
  updatedAt: Timestamp;
}

export interface Device {
  id: UUID;
  shopId: UUID;
  deviceName?: string;
  platform: string;
  firstSeen: Timestamp;
  lastSeen: Timestamp;
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export interface DailySummary {
  id: string; // `${shopId}_${dateStr}`
  shopId: UUID;
  dateStr: DateStr;
  openingCash: Paise;
  closingCash?: Paise;
  expectedCash?: Paise;
  cashDifference?: Paise;
  totalSales: Paise;
  totalTransactions: number;
  cashSales: Paise;
  upiSales: Paise;
  udhaarAdded: Paise;
  udhaarCollected: Paise;
  totalExpenses: Paise;
  totalRefunds: Paise;
  grossProfit: Paise;
  status: 'open' | 'closed';
  closedAt?: Timestamp;
  closedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AnalyticsSnapshot {
  id: string;
  shopId: UUID;
  dateStr: DateStr;
  snapshotType: 'daily' | 'weekly' | 'monthly';
  data: Record<string, unknown>;
  computedAt: Timestamp;
  createdAt: Timestamp;
}
