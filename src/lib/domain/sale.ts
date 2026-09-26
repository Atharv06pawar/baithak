/**
 * BaithakOS — Sale Domain Service
 *
 * Core financial logic. Every sale is immutable once created.
 * Reversals create new records — they never overwrite.
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { decrementStock, incrementStock } from '@/lib/domain/product';
import { assertPaise, sumMoney, multiplyMoney, subtractMoney } from '@/lib/money';
import type { Sale, SaleItem, PaymentMethod, UUID } from '@/lib/types';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface SaleItemInput {
  productId: UUID;
  productName: string;
  quantity: number;
  unitPrice: number; // paise — snapshot at sale time
  discountAmount?: number; // paise
}

export interface CreateSaleInput {
  shopId: UUID;
  paymentMethod: PaymentMethod;
  items: SaleItemInput[];
  customerId?: UUID;
  discountAmount?: number; // paise — on the whole sale
  taxAmount?: number;      // paise
  cashReceived?: number;   // paise
  notes?: string;
  servedBy?: string;
}

// ─── Create Sale ──────────────────────────────────────────────────────────────

export async function createSale(input: CreateSaleInput): Promise<{ sale: Sale; items: SaleItem[] }> {
  // Validate
  if (!input.items || input.items.length === 0) {
    throw new Error('A sale must have at least one item');
  }
  if (!input.shopId) throw new Error('shopId is required');

  for (const item of input.items) {
    if (item.quantity <= 0) throw new Error(`Quantity must be > 0 for product ${item.productId}`);
    assertPaise(item.unitPrice, `unitPrice for ${item.productName}`);
    if (item.unitPrice < 0) throw new Error(`Unit price cannot be negative for ${item.productName}`);
  }

  const db = getDB();
  const now = Date.now();
  const saleId = crypto.randomUUID();

  // Build sale items
  const saleItems: SaleItem[] = input.items.map((item) => {
    const lineDiscount = item.discountAmount ?? 0;
    const lineTotal = subtractMoney(
      multiplyMoney(item.unitPrice, item.quantity),
      lineDiscount,
    );
    return {
      id: crypto.randomUUID(),
      saleId,
      shopId: input.shopId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: lineDiscount,
      lineTotal,
      createdAt: now,
    };
  });

  // Compute totals
  const subtotal = sumMoney(saleItems.map((i) => i.lineTotal));
  const discountAmount = input.discountAmount ?? 0;
  const taxAmount = input.taxAmount ?? 0;
  const total = subtotal - discountAmount + taxAmount;

  if (total < 0) throw new Error('Sale total cannot be negative');

  assertPaise(subtotal, 'subtotal');
  assertPaise(total, 'total');

  // Get next sale number (within shop, for display only)
  const saleCount = await db.sales.where('shopId').equals(input.shopId).count();
  const saleNumber = saleCount + 1;

  const changeGiven =
    input.cashReceived !== undefined
      ? Math.max(0, input.cashReceived - total)
      : undefined;

  const sale: Sale = {
    id: saleId,
    shopId: input.shopId,
    deviceId: getDeviceId(),
    saleNumber,
    status: 'completed',
    customerId: input.customerId,
    paymentMethod: input.paymentMethod,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    cashReceived: input.cashReceived,
    changeGiven,
    notes: input.notes,
    servedBy: input.servedBy,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic transaction: sale + items + stock update + outbox
  await db.transaction(
    'rw',
    [db.sales, db.sale_items, db.products, db.sync_outbox, db.audit_logs],
    async () => {
      await db.sales.add(sale);
      await db.sale_items.bulkAdd(saleItems);

      // Decrement stock for each item
      for (const item of input.items) {
        await decrementStock(db, item.productId, item.quantity);
      }

      // Sync outbox (one event per sale)
      await appendToOutbox({
        db,
        shopId: input.shopId,
        entityType: 'sale',
        entityId: saleId,
        operation: 'create',
        payload: { sale, saleItems },
      });

      // Audit log
      await db.audit_logs.add({
        id: crypto.randomUUID(),
        shopId: input.shopId,
        deviceId: getDeviceId(),
        entityType: 'sale',
        entityId: saleId,
        operation: 'create',
        payload: { saleId, total, itemCount: saleItems.length },
        createdAt: now,
      });
    },
  );

  return { sale, items: saleItems };
}

// ─── Reverse Sale ─────────────────────────────────────────────────────────────

export async function reverseSale(
  saleId: UUID,
  shopId: UUID,
  reason: string,
): Promise<Sale> {
  const db = getDB();
  const existing = await db.sales.get(saleId);
  if (!existing) throw new Error('Sale not found');
  if (existing.shopId !== shopId) throw new Error('Unauthorized');
  if (existing.status === 'reversed') throw new Error('Sale is already reversed');
  if (existing.status === 'voided') throw new Error('Sale is voided and cannot be reversed');

  const originalItems = await db.sale_items.where('saleId').equals(saleId).toArray();
  const now = Date.now();

  await db.transaction(
    'rw',
    [db.sales, db.products, db.sync_outbox, db.audit_logs],
    async () => {
      // Update original sale status
      await db.sales.update(saleId, {
        status: 'reversed',
        reversedAt: now,
        reversalReason: reason,
        updatedAt: now,
      });

      // Restore stock
      for (const item of originalItems) {
        await incrementStock(db, item.productId, item.quantity);
      }

      // Outbox
      await appendToOutbox({
        db,
        shopId,
        entityType: 'sale',
        entityId: saleId,
        operation: 'update',
        payload: { saleId, status: 'reversed', reversedAt: now, reversalReason: reason },
      });

      // Audit
      await db.audit_logs.add({
        id: crypto.randomUUID(),
        shopId,
        deviceId: getDeviceId(),
        entityType: 'sale',
        entityId: saleId,
        operation: 'reverse',
        payload: { saleId, reason },
        createdAt: now,
      });
    },
  );

  return (await db.sales.get(saleId))!;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSales(
  shopId: UUID,
  opts?: { limit?: number; status?: Sale['status'] },
): Promise<Sale[]> {
  const db = getDB();
  let query = db.sales.where('shopId').equals(shopId);
  const results = await query.reverse().sortBy('createdAt');
  let filtered = results;
  if (opts?.status) filtered = filtered.filter((s) => s.status === opts.status);
  if (opts?.limit) filtered = filtered.slice(0, opts.limit);
  return filtered;
}

export async function getSaleWithItems(
  saleId: UUID,
): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const db = getDB();
  const sale = await db.sales.get(saleId);
  if (!sale) return null;
  const items = await db.sale_items.where('saleId').equals(saleId).toArray();
  return { sale, items };
}

export async function getSalesToday(shopId: UUID): Promise<Sale[]> {
  const db = getDB();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const allSales = await db.sales.where('shopId').equals(shopId).toArray();
  return allSales.filter(
    (s) => s.status === 'completed' && s.createdAt >= startOfDay.getTime(),
  );
}
