/**
 * BaithakOS — Stock Adjustment Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import type { StockAdjustment, AdjustmentType, UUID } from '@/lib/types';

export interface CreateStockAdjustmentInput {
  shopId: UUID;
  productId: UUID;
  productName: string;
  adjustmentType: AdjustmentType;
  quantityChange: number; // positive = add, negative = remove
  reason?: string;
  recordedBy?: string;
}

export async function createStockAdjustment(
  input: CreateStockAdjustmentInput
): Promise<StockAdjustment> {
  if (!input.shopId) throw new Error('shopId is required');
  if (!input.productId) throw new Error('productId is required');
  if (input.quantityChange === 0) throw new Error('quantityChange cannot be 0');

  const db = getDB();
  const product = await db.products.get(input.productId);
  if (!product) throw new Error(`Product ${input.productId} not found`);

  const quantityBefore = product.stockQuantity;
  const quantityAfter = quantityBefore + input.quantityChange;

  if (quantityAfter < 0) {
    throw new Error(
      `Cannot reduce stock by ${Math.abs(input.quantityChange)}. Current stock is ${quantityBefore}.`
    );
  }

  const now = Date.now();
  const adjustment: StockAdjustment = {
    id: crypto.randomUUID(),
    shopId: input.shopId,
    productId: input.productId,
    productName: input.productName || product.name,
    adjustmentType: input.adjustmentType,
    quantityBefore,
    quantityChange: input.quantityChange,
    quantityAfter,
    reason: input.reason?.trim(),
    recordedBy: input.recordedBy,
    createdAt: now,
  };

  await db.transaction(
    'rw',
    [db.stock_adjustments, db.products, db.sync_outbox, db.audit_logs],
    async () => {
      await db.stock_adjustments.add(adjustment);
      await db.products.update(input.productId, {
        stockQuantity: quantityAfter,
        updatedAt: now,
      });

      await appendToOutbox({
        db,
        shopId: input.shopId,
        entityType: 'stock_adjustment',
        entityId: adjustment.id,
        operation: 'create',
        payload: { adjustment },
      });

      await db.audit_logs.add({
        id: crypto.randomUUID(),
        shopId: input.shopId,
        deviceId: getDeviceId(),
        entityType: 'stock_adjustment',
        entityId: adjustment.id,
        operation: 'create',
        payload: {
          productId: input.productId,
          adjustmentType: input.adjustmentType,
          quantityChange: input.quantityChange,
          quantityAfter,
        },
        createdAt: now,
      });
    }
  );

  return adjustment;
}

export async function getStockAdjustments(
  shopId: UUID,
  productId?: UUID
): Promise<StockAdjustment[]> {
  const db = getDB();
  if (productId) {
    return db.stock_adjustments
      .where('shopId')
      .equals(shopId)
      .filter((a) => a.productId === productId)
      .reverse()
      .sortBy('createdAt');
  }
  return db.stock_adjustments
    .where('shopId')
    .equals(shopId)
    .reverse()
    .sortBy('createdAt');
}
