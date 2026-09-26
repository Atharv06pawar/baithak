/**
 * Integration tests: Sale domain service
 * Uses fake-indexeddb via test-setup for an in-memory IndexedDB.
 *
 * The _resetDB() function resets the Dexie singleton so each test
 * gets a fresh database. fake-indexeddb/auto is loaded in test-setup.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDB, getDB } from '@/lib/db';
import { createProduct } from '@/lib/domain/product';
import { createSale, reverseSale } from '@/lib/domain/sale';

const SHOP_ID = 'test-shop-001';

beforeEach(async () => {
  _resetDB();
  // Open a fresh db
  await getDB().open();
});

describe('Product creation', () => {
  it('creates a product with correct fields', async () => {
    const product = await createProduct({
      shopId: SHOP_ID,
      name: 'Meetha Paan',
      sellingPrice: 2000,
      purchasePrice: 1200,
      stockQuantity: 50,
      minimumStock: 10,
      unit: 'piece',
    });

    expect(product.id).toBeTruthy();
    expect(product.name).toBe('Meetha Paan');
    expect(product.sellingPrice).toBe(2000);
    expect(product.purchasePrice).toBe(1200);
    expect(product.stockQuantity).toBe(50);
    expect(product.shopId).toBe(SHOP_ID);
    expect(product.active).toBe(true);
    expect(Number.isInteger(product.sellingPrice)).toBe(true);
  });

  it('rejects negative selling price', async () => {
    await expect(
      createProduct({
        shopId: SHOP_ID,
        name: 'Bad Product',
        sellingPrice: -100,
      }),
    ).rejects.toThrow();
  });

  it('rejects float selling price', async () => {
    await expect(
      createProduct({
        shopId: SHOP_ID,
        name: 'Float Product',
        sellingPrice: 80.5,
      }),
    ).rejects.toThrow();
  });

  it('creates sync outbox event', async () => {
    await createProduct({
      shopId: SHOP_ID,
      name: 'Test Product',
      sellingPrice: 1000,
    });
    const events = await getDB().sync_outbox.toArray();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some(e => e.entityType === 'product')).toBe(true);
    expect(events.every(e => e.status === 'pending')).toBe(true);
  });
});

describe('createSale', () => {
  let productId: string;

  beforeEach(async () => {
    const product = await createProduct({
      shopId: SHOP_ID,
      name: 'Meetha Paan',
      sellingPrice: 2000,
      stockQuantity: 50,
    });
    productId = product.id;
    // Clear outbox from product creation for clean assertions
    await getDB().sync_outbox.clear();
  });

  it('creates a sale with correct totals', async () => {
    const { sale, items } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [
        {
          productId,
          productName: 'Meetha Paan',
          quantity: 3,
          unitPrice: 2000,
        },
      ],
    });

    expect(sale.subtotal).toBe(6000); // 3 × ₹20
    expect(sale.total).toBe(6000);
    expect(sale.discountAmount).toBe(0);
    expect(sale.taxAmount).toBe(0);
    expect(sale.status).toBe('completed');
    expect(items).toHaveLength(1);
    expect(items[0].lineTotal).toBe(6000);
    expect(Number.isInteger(sale.total)).toBe(true);
  });

  it('decrements stock after sale', async () => {
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId, productName: 'Meetha Paan', quantity: 3, unitPrice: 2000 }],
    });

    const product = await getDB().products.get(productId);
    expect(product?.stockQuantity).toBe(47); // 50 - 3
  });

  it('writes sync outbox event atomically', async () => {
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId, productName: 'Meetha Paan', quantity: 1, unitPrice: 2000 }],
    });

    const events = await getDB().sync_outbox.toArray();
    expect(events.length).toBe(1);
    expect(events[0].entityType).toBe('sale');
    expect(events[0].status).toBe('pending');
  });

  it('calculates change given correctly', async () => {
    const { sale } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      cashReceived: 10000, // ₹100 given for ₹60 sale
      items: [{ productId, productName: 'Meetha Paan', quantity: 3, unitPrice: 2000 }],
    });
    expect(sale.changeGiven).toBe(4000); // ₹40 change
    expect(Number.isInteger(sale.changeGiven!)).toBe(true);
  });

  it('sale with discount calculates correctly', async () => {
    const { sale } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      discountAmount: 500, // ₹5 off
      items: [{ productId, productName: 'Meetha Paan', quantity: 3, unitPrice: 2000 }],
    });
    expect(sale.subtotal).toBe(6000);
    expect(sale.discountAmount).toBe(500);
    expect(sale.total).toBe(5500);
  });

  it('rejects sale with zero items', async () => {
    await expect(
      createSale({
        shopId: SHOP_ID,
        paymentMethod: 'cash',
        items: [],
      }),
    ).rejects.toThrow();
  });

  it('rejects sale with negative quantity', async () => {
    await expect(
      createSale({
        shopId: SHOP_ID,
        paymentMethod: 'cash',
        items: [{ productId, productName: 'Meetha Paan', quantity: -1, unitPrice: 2000 }],
      }),
    ).rejects.toThrow();
  });

  it('subtotal equals sum of line totals (invariant)', async () => {
    const product2 = await createProduct({
      shopId: SHOP_ID,
      name: 'Coke',
      sellingPrice: 4000,
      stockQuantity: 20,
    });

    const { sale, items } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'upi',
      items: [
        { productId, productName: 'Meetha Paan', quantity: 2, unitPrice: 2000 },
        { productId: product2.id, productName: 'Coke', quantity: 1, unitPrice: 4000 },
      ],
    });

    const expectedSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    expect(sale.subtotal).toBe(expectedSubtotal);
    expect(sale.subtotal).toBe(8000); // 2×₹20 + 1×₹40
  });
});

describe('reverseSale', () => {
  let productId: string;
  let saleId: string;

  beforeEach(async () => {
    const product = await createProduct({
      shopId: SHOP_ID,
      name: 'Sada Paan',
      sellingPrice: 1500,
      stockQuantity: 30,
    });
    productId = product.id;
    const { sale } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId, productName: 'Sada Paan', quantity: 5, unitPrice: 1500 }],
    });
    saleId = sale.id;
    await getDB().sync_outbox.clear();
  });

  it('marks sale as reversed', async () => {
    await reverseSale(saleId, SHOP_ID, 'Customer changed mind');
    const sale = await getDB().sales.get(saleId);
    expect(sale?.status).toBe('reversed');
    expect(sale?.reversedAt).toBeTruthy();
    expect(sale?.reversalReason).toBe('Customer changed mind');
  });

  it('restores stock on reversal', async () => {
    await reverseSale(saleId, SHOP_ID, 'Test');
    const product = await getDB().products.get(productId);
    // Stock was 30, sold 5 → 25, reversed → back to 30
    expect(product?.stockQuantity).toBe(30);
  });

  it('cannot reverse an already-reversed sale', async () => {
    await reverseSale(saleId, SHOP_ID, 'First reversal');
    await expect(
      reverseSale(saleId, SHOP_ID, 'Second reversal'),
    ).rejects.toThrow('already reversed');
  });

  it('creates outbox event for reversal', async () => {
    await reverseSale(saleId, SHOP_ID, 'Test');
    const events = await getDB().sync_outbox.toArray();
    expect(events.length).toBe(1);
    expect(events[0].operation).toBe('update');
  });
});

describe('Core invariant: stock reflects all operations', () => {
  it('stock correctly reflects sales and reversals', async () => {
    const product = await createProduct({
      shopId: SHOP_ID,
      name: 'Masala Paan',
      sellingPrice: 3000,
      stockQuantity: 100,
    });

    // Sell 10
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: product.id, productName: 'Masala Paan', quantity: 10, unitPrice: 3000 }],
    });

    // Sell 5
    const { sale } = await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: product.id, productName: 'Masala Paan', quantity: 5, unitPrice: 3000 }],
    });

    // Reverse the second sale (restores 5)
    await reverseSale(sale.id, SHOP_ID, 'Test reversal');

    const final = await getDB().products.get(product.id);
    // 100 - 10 - 5 + 5(reversal) = 90
    expect(final?.stockQuantity).toBe(90);
  });
});
