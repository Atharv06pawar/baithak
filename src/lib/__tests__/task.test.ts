import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, _resetDB } from '@/lib/db';
import {
  getOperationalTasks,
  toggleTaskStatus,
  updateTaskStatus,
  formatWhatsAppUrl,
} from '@/lib/domain/task';
import type { Product, Customer, Supplier, Shop, UUID } from '@/lib/types';

describe('Operational Tasks & In-App Notification Hub', () => {
  let db: ReturnType<typeof getDB>;
  const shopId: UUID = 'shop-task-test-1';

  beforeEach(async () => {
    const existingDb = getDB();
    if (existingDb.isOpen()) {
      await existingDb.delete();
    }
    _resetDB();
    db = getDB();
    await db.open();

    // Seed shop
    await db.shops.add({
      id: shopId,
      name: 'Baithak Test Shop',
      ownerName: 'Ramesh Patel',
      phone: '9876543210',
      currencyCode: 'INR',
      timezone: 'Asia/Kolkata',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('formats WhatsApp URL correctly with Indian phone numbers', () => {
    const url1 = formatWhatsAppUrl('9876543210', 'Namaste test');
    expect(url1).toBe('https://wa.me/919876543210?text=Namaste%20test');

    const url2 = formatWhatsAppUrl('+91 98765 43210', 'Hello');
    expect(url2).toBe('https://wa.me/919876543210?text=Hello');

    const url3 = formatWhatsAppUrl(undefined, 'Hello');
    expect(url3).toBeNull();
  });

  it('generates low-stock tasks for products below minimum threshold', async () => {
    const supplierId = 'sup-1';
    await db.suppliers.add({
      id: supplierId,
      shopId,
      name: 'Sharma Distributors',
      phone: '9988776655',
      leadTimeDays: 2,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await db.products.add({
      id: 'prod-1',
      shopId,
      name: 'Classic Milds',
      sellingPrice: 1800,
      purchasePrice: 1500,
      stockQuantity: 2, // below min 5
      minimumStock: 5,
      unit: 'packet',
      supplierId,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const tasks = await getOperationalTasks(shopId);
    const lowStockTask = tasks.find((t) => t.id === 'low_stock_prod-1');

    expect(lowStockTask).toBeDefined();
    expect(lowStockTask?.type).toBe('low_stock');
    expect(lowStockTask?.status).toBe('pending');
    expect(lowStockTask?.recipientName).toBe('Sharma Distributors');
    expect(lowStockTask?.recipientPhone).toBe('9988776655');
    expect(lowStockTask?.suggestedMessage).toContain('Classic Milds');
  });

  it('generates khata collection tasks for customers with outstanding balance', async () => {
    const custId = 'cust-1';
    await db.customers.add({
      id: custId,
      shopId,
      name: 'Suresh Kumar',
      phone: '9123456789',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add ledger entry giving customer 250 rupees balance
    await db.customer_ledger.add({
      id: 'led-1',
      shopId,
      customerId: custId,
      type: 'sale',
      amount: 25000, // ₹250.00
      balanceAfter: 25000,
      notes: 'Sale on credit',
      createdAt: Date.now(),
    });

    const tasks = await getOperationalTasks(shopId);
    const khataTask = tasks.find((t) => t.id === `khata_${custId}`);

    expect(khataTask).toBeDefined();
    expect(khataTask?.type).toBe('khata_collection');
    expect(khataTask?.recipientName).toBe('Suresh Kumar');
    expect(khataTask?.recipientPhone).toBe('9123456789');
    expect(khataTask?.suggestedMessage).toContain('₹250.00');
  });

  it('toggles task status between pending and completed', async () => {
    await db.products.add({
      id: 'prod-2',
      shopId,
      name: 'Rajnigandha 100g',
      sellingPrice: 10000,
      purchasePrice: 8500,
      stockQuantity: 1,
      minimumStock: 5,
      unit: 'tin',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const tasks = await getOperationalTasks(shopId);
    const taskId = 'low_stock_prod-2';

    // Toggle to completed
    const updated = await toggleTaskStatus(taskId, shopId);
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeDefined();

    // Toggle back to pending
    const reopened = await toggleTaskStatus(taskId, shopId);
    expect(reopened.status).toBe('pending');
    expect(reopened.completedAt).toBeUndefined();
  });
});
