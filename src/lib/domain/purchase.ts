/**
 * BaithakOS — Purchase Domain Service
 *
 * Records supplier purchases and increases stock atomically.
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { incrementStock } from '@/lib/domain/product';
import { assertPaise, sumMoney, multiplyMoney } from '@/lib/money';
import type { Purchase, PurchaseItem, UUID } from '@/lib/types';

export interface PurchaseItemInput {
  productId: UUID;
  productName: string;
  quantity: number;
  unitCost: number; // paise
}

export interface CreatePurchaseInput {
  shopId: UUID;
  supplierId?: UUID;
  supplierName?: string;
  invoiceNumber?: string;
  purchaseDate?: number; // timestamp
  items: PurchaseItemInput[];
  notes?: string;
  recordedBy?: string;
}

export async function createPurchase(
  input: CreatePurchaseInput
): Promise<{ purchase: Purchase; items: PurchaseItem[] }> {
  if (!input.items || input.items.length === 0) {
    throw new Error('Purchase must contain at least one item');
  }
  if (!input.shopId) throw new Error('shopId is required');

  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new Error(`Quantity must be > 0 for product ${item.productName}`);
    }
    assertPaise(item.unitCost, `unitCost for ${item.productName}`);
    if (item.unitCost < 0) {
      throw new Error(`Unit cost cannot be negative for ${item.productName}`);
    }
  }

  const db = getDB();
  const now = Date.now();
  const purchaseId = crypto.randomUUID();

  const purchaseItems: PurchaseItem[] = input.items.map((item) => {
    const lineTotal = multiplyMoney(item.unitCost, item.quantity);
    return {
      id: crypto.randomUUID(),
      purchaseId,
      shopId: input.shopId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitCost: item.unitCost,
      lineTotal,
      createdAt: now,
    };
  });

  const subtotal = sumMoney(purchaseItems.map((i) => i.lineTotal));
  const total = subtotal;

  const purchase: Purchase = {
    id: purchaseId,
    shopId: input.shopId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    invoiceNumber: input.invoiceNumber?.trim(),
    purchaseDate: input.purchaseDate ?? now,
    status: 'completed',
    subtotal,
    total,
    notes: input.notes?.trim(),
    recordedBy: input.recordedBy,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic transaction
  await db.transaction(
    'rw',
    [db.purchases, db.purchase_items, db.products, db.sync_outbox, db.audit_logs],
    async () => {
      await db.purchases.add(purchase);
      await db.purchase_items.bulkAdd(purchaseItems);

      // Increment stock for each product and update purchasePrice
      for (const item of input.items) {
        await incrementStock(db, item.productId, item.quantity);
        // Also update product purchasePrice if non-zero
        if (item.unitCost > 0) {
          await db.products.update(item.productId, {
            purchasePrice: item.unitCost,
            updatedAt: now,
          });
        }
      }

      await appendToOutbox({
        db,
        shopId: input.shopId,
        entityType: 'purchase',
        entityId: purchaseId,
        operation: 'create',
        payload: { purchase, purchaseItems },
      });

      await db.audit_logs.add({
        id: crypto.randomUUID(),
        shopId: input.shopId,
        deviceId: getDeviceId(),
        entityType: 'purchase',
        entityId: purchaseId,
        operation: 'create',
        payload: { purchaseId, total, itemsCount: purchaseItems.length },
        createdAt: now,
      });
    }
  );

  return { purchase, items: purchaseItems };
}

export async function getPurchases(
  shopId: UUID,
  opts?: { limit?: number }
): Promise<Purchase[]> {
  const db = getDB();
  const results = await db.purchases
    .where('shopId')
    .equals(shopId)
    .reverse()
    .sortBy('purchaseDate');
  return opts?.limit ? results.slice(0, opts.limit) : results;
}

export async function getPurchaseWithItems(
  purchaseId: UUID
): Promise<{ purchase: Purchase; items: PurchaseItem[] } | null> {
  const db = getDB();
  const purchase = await db.purchases.get(purchaseId);
  if (!purchase) return null;
  const items = await db.purchase_items.where('purchaseId').equals(purchaseId).toArray();
  return { purchase, items };
}
