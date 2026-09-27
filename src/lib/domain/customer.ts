/**
 * BaithakOS — Customer & Udhaar Ledger Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { assertPaise, addMoney, formatMoney } from '@/lib/money';
import type { Customer, CustomerLedgerEntry, LedgerEntryType, UUID } from '@/lib/types';

export interface CreateCustomerInput {
  shopId: UUID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface CustomerWithBalance extends Customer {
  currentBalance: number; // paise, positive means customer owes shop (udhaar)
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  if (!input.name?.trim()) throw new Error('Customer name is required');
  if (!input.shopId) throw new Error('shopId is required');

  const db = getDB();
  const now = Date.now();
  const customer: Customer = {
    id: crypto.randomUUID(),
    shopId: input.shopId,
    name: input.name.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    notes: input.notes?.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.customers, db.sync_outbox], async () => {
    await db.customers.add(customer);
    await appendToOutbox({
      db,
      shopId: input.shopId,
      entityType: 'customer',
      entityId: customer.id,
      operation: 'create',
      payload: { customer },
    });
  });

  return customer;
}

export async function getCustomers(shopId: UUID): Promise<CustomerWithBalance[]> {
  const db = getDB();
  const customers = await db.customers
    .where('shopId')
    .equals(shopId)
    .filter((c) => c.active)
    .sortBy('name');

  const customerIds = customers.map((c) => c.id);
  const ledgerEntries = await db.customer_ledger
    .where('shopId')
    .equals(shopId)
    .toArray();

  const balanceMap = new Map<string, number>();
  for (const entry of ledgerEntries) {
    const prev = balanceMap.get(entry.customerId) ?? 0;
    balanceMap.set(entry.customerId, prev + entry.amount);
  }

  return customers.map((c) => ({
    ...c,
    currentBalance: balanceMap.get(c.id) ?? 0,
  }));
}

export async function getCustomerLedger(
  shopId: UUID,
  customerId: UUID
): Promise<CustomerLedgerEntry[]> {
  const db = getDB();
  return db.customer_ledger
    .where('shopId')
    .equals(shopId)
    .filter((e) => e.customerId === customerId)
    .sortBy('createdAt');
}

export interface RecordLedgerEntryInput {
  shopId: UUID;
  customerId: UUID;
  type: LedgerEntryType;
  amount: number; // positive = added debt (e.g. udhaar sale), negative = payment received
  saleId?: UUID;
  note?: string;
  recordedBy?: string;
}

export async function recordLedgerEntry(
  input: RecordLedgerEntryInput
): Promise<CustomerLedgerEntry> {
  if (!input.shopId) throw new Error('shopId is required');
  if (!input.customerId) throw new Error('customerId is required');
  assertPaise(input.amount, 'amount');

  const db = getDB();
  const now = Date.now();

  const history = await getCustomerLedger(input.shopId, input.customerId);
  const lastBalance = history.length > 0 ? history[history.length - 1].runningBalance : 0;
  const runningBalance = addMoney(lastBalance, input.amount);

  const entry: CustomerLedgerEntry = {
    id: crypto.randomUUID(),
    shopId: input.shopId,
    customerId: input.customerId,
    type: input.type,
    saleId: input.saleId,
    amount: input.amount,
    runningBalance,
    note: input.note?.trim(),
    recordedBy: input.recordedBy,
    createdAt: now,
  };

  await db.transaction('rw', [db.customer_ledger, db.sync_outbox, db.audit_logs], async () => {
    await db.customer_ledger.add(entry);

    await appendToOutbox({
      db,
      shopId: input.shopId,
      entityType: 'customer_ledger',
      entityId: entry.id,
      operation: 'create',
      payload: { entry },
    });

    await db.audit_logs.add({
      id: crypto.randomUUID(),
      shopId: input.shopId,
      deviceId: getDeviceId(),
      entityType: 'customer_ledger',
      entityId: entry.id,
      operation: 'create',
      payload: { customerId: input.customerId, type: input.type, amount: input.amount, runningBalance },
      createdAt: now,
    });
  });

  return entry;
}

/** Record customer payment (clears debt) */
export async function recordCustomerPayment(
  shopId: UUID,
  customerId: UUID,
  amountPaidPaise: number,
  note?: string
): Promise<CustomerLedgerEntry> {
  if (amountPaidPaise <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  // Payments are recorded as negative amount in the customer ledger
  return recordLedgerEntry({
    shopId,
    customerId,
    type: 'payment',
    amount: -amountPaidPaise,
    note: note || 'Payment received',
  });
}

/** Update customer phone number for WhatsApp receipts */
export async function updateCustomerPhone(
  shopId: UUID,
  customerId: UUID,
  phone: string
): Promise<Customer> {
  const db = getDB();
  const customer = await db.customers.get(customerId);
  if (!customer) throw new Error('Customer not found');
  if (customer.shopId !== shopId) throw new Error('Unauthorized');

  const updated: Customer = {
    ...customer,
    phone: phone.trim(),
    updatedAt: Date.now(),
  };

  await db.transaction('rw', [db.customers, db.sync_outbox], async () => {
    await db.customers.put(updated);
    await appendToOutbox({
      db,
      shopId,
      entityType: 'customer',
      entityId: customerId,
      operation: 'update',
      payload: { customer: updated },
    });
  });

  return updated;
}

/** Build WhatsApp wa.me URL with 91 country code prefix */
export function buildWhatsAppUrl(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const fullPhone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}

export interface UdhaarReceiptMessageInput {
  customerName: string;
  shopName: string;
  billNumber: number;
  date?: Date;
  items?: { name: string; quantity: number; lineTotal: number }[];
  purchaseAmount: number; // paise
  previousBalance: number; // paise
  newBalance: number; // paise
}

/**
 * Format complete Udhaar purchase WhatsApp receipt showing:
 * - Shop name & Bill number
 * - Purchased items list
 * - New bill amount
 * - Previous balance
 * - Total new balance
 */
export function formatUdhaarReceiptMessage(input: UdhaarReceiptMessageInput): string {
  const dateStr = (input.date || new Date()).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const lines = [
    `🧾 *${input.shopName} — Udhaar Parchee*`,
    `--------------------------------`,
    `👤 *Grahak:* ${input.customerName}`,
    `📅 *Date:* ${dateStr}`,
    `🔢 *Bill No:* #${input.billNumber}`,
  ];

  if (input.items && input.items.length > 0) {
    lines.push(`\n🛒 *Kharide Gaye Items:*`);
    for (const item of input.items) {
      lines.push(`• ${item.name} × ${item.quantity} = ${formatMoney(item.lineTotal)}`);
    }
  }

  lines.push(
    `--------------------------------`,
    `➕ *Is Bill Ka Udhaar:* ${formatMoney(input.purchaseAmount)}`,
    `📋 *Pichla Baaki (Previous):* ${formatMoney(input.previousBalance)}`,
    `🔴 *Kul Naya Baaki (Total Due):* ${formatMoney(input.newBalance)}`,
    `--------------------------------`,
    `Dhanyawad! Kripya samay par chukta karein. 🙏`
  );

  return lines.join('\n');
}

export interface PaymentReceiptMessageInput {
  customerName: string;
  shopName: string;
  date?: Date;
  amountPaid: number; // paise
  previousBalance: number; // paise
  remainingBalance: number; // paise
}

/**
 * Format payment received WhatsApp receipt showing:
 * - Paid amount
 * - Previous due
 * - Remaining due
 */
export function formatPaymentReceiptMessage(input: PaymentReceiptMessageInput): string {
  const dateStr = (input.date || new Date()).toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return [
    `💳 *${input.shopName} — Payment Receipt*`,
    `--------------------------------`,
    `👤 *Grahak:* ${input.customerName}`,
    `📅 *Date:* ${dateStr}`,
    `--------------------------------`,
    `✅ *Jama Rashi (Paid):* ${formatMoney(input.amountPaid)}`,
    `📋 *Pichla Baaki (Previous Due):* ${formatMoney(input.previousBalance)}`,
    `🟢 *Bacha Hua Baaki (Remaining):* ${formatMoney(input.remainingBalance)}`,
    `--------------------------------`,
    `Aapka payment safaltapoorvak prapt hua. Dhanyawad! 🙏`,
  ].join('\n');
}
