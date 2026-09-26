/**
 * BaithakOS — Product Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { assertPaise } from '@/lib/money';
import type { Product, UUID } from '@/lib/types';

interface CreateProductInput {
  shopId: UUID;
  name: string;
  sellingPrice: number; // paise
  purchasePrice?: number; // paise
  stockQuantity?: number;
  minimumStock?: number;
  unit?: string;
  categoryId?: UUID;
  supplierId?: UUID;
}

interface UpdateProductInput {
  name?: string;
  sellingPrice?: number;
  purchasePrice?: number;
  minimumStock?: number;
  categoryId?: UUID;
  supplierId?: UUID;
  active?: boolean;
}

function validateProduct(input: CreateProductInput): void {
  if (!input.name?.trim()) throw new Error('Product name is required');
  assertPaise(input.sellingPrice, 'sellingPrice');
  if (input.sellingPrice < 0) throw new Error('Selling price cannot be negative');
  if (input.purchasePrice !== undefined) {
    assertPaise(input.purchasePrice, 'purchasePrice');
    if (input.purchasePrice < 0) throw new Error('Purchase price cannot be negative');
  }
  if (input.stockQuantity !== undefined && input.stockQuantity < 0) {
    throw new Error('Stock quantity cannot be negative');
  }
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  validateProduct(input);
  const db = getDB();
  const now = Date.now();

  const product: Product = {
    id: crypto.randomUUID(),
    shopId: input.shopId,
    name: input.name.trim(),
    sellingPrice: input.sellingPrice,
    purchasePrice: input.purchasePrice ?? 0,
    stockQuantity: input.stockQuantity ?? 0,
    minimumStock: input.minimumStock ?? 5,
    unit: input.unit ?? 'piece',
    categoryId: input.categoryId,
    supplierId: input.supplierId,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.products, db.sync_outbox], async () => {
    await db.products.add(product);
    await appendToOutbox({
      db,
      shopId: input.shopId,
      entityType: 'product',
      entityId: product.id,
      operation: 'create',
      payload: { product },
    });
  });

  return product;
}

export async function updateProduct(
  productId: UUID,
  shopId: UUID,
  updates: UpdateProductInput,
): Promise<Product> {
  const db = getDB();
  const existing = await db.products.get(productId);
  if (!existing) throw new Error('Product not found');
  if (existing.shopId !== shopId) throw new Error('Unauthorized');

  if (updates.sellingPrice !== undefined) {
    assertPaise(updates.sellingPrice, 'sellingPrice');
    if (updates.sellingPrice < 0) throw new Error('Selling price cannot be negative');
  }

  const now = Date.now();
  const updated: Product = { ...existing, ...updates, updatedAt: now };

  await db.transaction('rw', [db.products, db.sync_outbox], async () => {
    await db.products.put(updated);
    await appendToOutbox({
      db,
      shopId,
      entityType: 'product',
      entityId: productId,
      operation: 'update',
      payload: { product: updated },
    });
  });

  return updated;
}

export async function getProducts(shopId: UUID): Promise<Product[]> {
  const db = getDB();
  return db.products
    .where('shopId').equals(shopId)
    .filter(p => p.active)
    .sortBy('name');
}

export async function getProduct(productId: UUID): Promise<Product | undefined> {
  const db = getDB();
  return db.products.get(productId);
}

export async function getLowStockProducts(shopId: UUID): Promise<Product[]> {
  const db = getDB();
  const products = await db.products
    .where('shopId').equals(shopId)
    .filter(p => p.active && p.stockQuantity <= p.minimumStock)
    .toArray();
  return products;
}

/** Atomically decrement stock — must be called inside a Dexie transaction. */
export async function decrementStock(
  db: ReturnType<typeof getDB>,
  productId: UUID,
  quantity: number,
): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  const newQty = product.stockQuantity - quantity;
  await db.products.update(productId, {
    stockQuantity: newQty,
    updatedAt: Date.now(),
  });
}

/** Atomically increment stock — must be called inside a Dexie transaction. */
export async function incrementStock(
  db: ReturnType<typeof getDB>,
  productId: UUID,
  quantity: number,
): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  await db.products.update(productId, {
    stockQuantity: product.stockQuantity + quantity,
    updatedAt: Date.now(),
  });
}
