/**
 * BaithakOS — Supplier Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import type { Supplier, UUID } from '@/lib/types';

export interface CreateSupplierInput {
  shopId: UUID;
  name: string;
  contactName?: string;
  phone?: string;
  address?: string;
  leadTimeDays?: number;
  notes?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  leadTimeDays?: number;
  notes?: string;
  active?: boolean;
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  if (!input.name?.trim()) throw new Error('Supplier name is required');
  if (!input.shopId) throw new Error('shopId is required');

  const db = getDB();
  const now = Date.now();
  const supplier: Supplier = {
    id: crypto.randomUUID(),
    shopId: input.shopId,
    name: input.name.trim(),
    contactName: input.contactName?.trim(),
    phone: input.phone?.trim(),
    address: input.address?.trim(),
    leadTimeDays: Math.max(1, input.leadTimeDays ?? 2),
    notes: input.notes?.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.suppliers, db.sync_outbox], async () => {
    await db.suppliers.add(supplier);
    await appendToOutbox({
      db,
      shopId: input.shopId,
      entityType: 'supplier',
      entityId: supplier.id,
      operation: 'create',
      payload: { supplier },
    });
  });

  return supplier;
}

export async function getSuppliers(shopId: UUID): Promise<Supplier[]> {
  const db = getDB();
  return db.suppliers
    .where('shopId')
    .equals(shopId)
    .filter((s) => s.active)
    .sortBy('name');
}

export async function getSupplier(supplierId: UUID): Promise<Supplier | undefined> {
  const db = getDB();
  return db.suppliers.get(supplierId);
}

export async function updateSupplier(
  supplierId: UUID,
  shopId: UUID,
  updates: UpdateSupplierInput
): Promise<Supplier> {
  const db = getDB();
  const existing = await db.suppliers.get(supplierId);
  if (!existing) throw new Error('Supplier not found');
  if (existing.shopId !== shopId) throw new Error('Unauthorized');

  const now = Date.now();
  const updated: Supplier = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  await db.transaction('rw', [db.suppliers, db.sync_outbox], async () => {
    await db.suppliers.put(updated);
    await appendToOutbox({
      db,
      shopId,
      entityType: 'supplier',
      entityId: supplierId,
      operation: 'update',
      payload: { supplier: updated },
    });
  });

  return updated;
}
