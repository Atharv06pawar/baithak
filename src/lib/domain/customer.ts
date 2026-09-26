/**
 * BaithakOS — Customer & Udhaar Ledger Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { assertPaise, addMoney } from '@/lib/money';
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
