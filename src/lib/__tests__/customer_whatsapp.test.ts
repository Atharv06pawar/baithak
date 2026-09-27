import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, _resetDB } from '@/lib/db';
import {
  createCustomer,
  updateCustomerPhone,
  buildWhatsAppUrl,
  formatUdhaarReceiptMessage,
  formatPaymentReceiptMessage,
} from '@/lib/domain/customer';
import type { UUID } from '@/lib/types';

describe('Customer Registration & WhatsApp Khata Receipts', () => {
  let db: ReturnType<typeof getDB>;
  const shopId: UUID = 'shop-whatsapp-test-1';

  beforeEach(async () => {
    const existingDb = getDB();
    if (existingDb.isOpen()) {
      await existingDb.delete();
    }
    _resetDB();
    db = getDB();
    await db.open();

    await db.shops.add({
      id: shopId,
      name: 'Baithak Paan Corner',
      ownerName: 'Ramesh Patel',
      phone: '9876543210',
      currencyCode: 'INR',
      timezone: 'Asia/Kolkata',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('builds WhatsApp wa.me URLs with proper Indian country code formatting', () => {
    const url1 = buildWhatsAppUrl('9876543210', 'Namaste test');
    expect(url1).toBe('https://wa.me/919876543210?text=Namaste%20test');

    const url2 = buildWhatsAppUrl('+91 98765 43210', 'Udhaar receipt');
    expect(url2).toBe('https://wa.me/919876543210?text=Udhaar%20receipt');

    const url3 = buildWhatsAppUrl(undefined, 'Hello');
    expect(url3).toBeNull();
  });

  it('formats Udhaar purchase WhatsApp receipt with previous and new balance', () => {
    const message = formatUdhaarReceiptMessage({
      customerName: 'Suresh Kumar',
      shopName: 'Baithak Paan Corner',
      billNumber: 105,
      date: new Date('2026-09-28T01:00:00Z'),
      items: [
        { name: 'Banarasi Meetha Paan', quantity: 2, lineTotal: 6000 },
        { name: 'Thums Up Can', quantity: 1, lineTotal: 4000 },
      ],
      purchaseAmount: 10000, // ₹100.00
      previousBalance: 5000,  // ₹50.00
      newBalance: 15000,      // ₹150.00
    });

    expect(message).toContain('Baithak Paan Corner — Udhaar Parchee');
    expect(message).toContain('Suresh Kumar');
    expect(message).toContain('#105');
    expect(message).toContain('Banarasi Meetha Paan × 2');
    expect(message).toContain('Thums Up Can × 1');
    expect(message).toContain('*Is Bill Ka Udhaar:* ₹100.00');
    expect(message).toContain('*Pichla Baaki (Previous):* ₹50.00');
    expect(message).toContain('*Kul Naya Baaki (Total Due):* ₹150.00');
  });

  it('formats payment received WhatsApp receipt with previous and remaining balance', () => {
    const message = formatPaymentReceiptMessage({
      customerName: 'Suresh Kumar',
      shopName: 'Baithak Paan Corner',
      date: new Date('2026-09-28T01:30:00Z'),
      amountPaid: 10000,        // ₹100.00
      previousBalance: 15000,   // ₹150.00
      remainingBalance: 5000,   // ₹50.00
    });

    expect(message).toContain('Baithak Paan Corner — Payment Receipt');
    expect(message).toContain('Suresh Kumar');
    expect(message).toContain('*Jama Rashi (Paid):* ₹100.00');
    expect(message).toContain('*Pichla Baaki (Previous Due):* ₹150.00');
    expect(message).toContain('*Bacha Hua Baaki (Remaining):* ₹50.00');
  });

  it('creates customer with phone and allows updating phone number', async () => {
    const customer = await createCustomer({
      shopId,
      name: 'Anil Sharma',
      phone: '9812345678',
    });

    expect(customer.name).toBe('Anil Sharma');
    expect(customer.phone).toBe('9812345678');

    const updated = await updateCustomerPhone(shopId, customer.id, '9899999999');
    expect(updated.phone).toBe('9899999999');

    const fetched = await db.customers.get(customer.id);
    expect(fetched?.phone).toBe('9899999999');
  });
});
