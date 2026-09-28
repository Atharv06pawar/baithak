/**
 * BaithakOS — Shop Domain Service
 *
 * Handles shop initialization and settings.
 */

import { getDB } from '@/lib/db';
import { getDeviceId } from '@/lib/device';
import { appendToOutbox } from '@/lib/sync/outbox';
import type { Shop, ShopSettings } from '@/lib/types';

interface CreateShopInput {
  name: string;
  ownerName: string;
  phone?: string;
  ownerEmail?: string;
  address?: string;
}

/**
 * Initialize a new shop in the local database.
 * Creates the shop, default settings, and records the device.
 */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  const db = getDB();

  // Validate
  if (!input.name?.trim()) throw new Error('Shop name is required');
  if (!input.ownerName?.trim()) throw new Error('Owner name is required');

  const shopId = crypto.randomUUID();
  const now = Date.now();

  const shop: Shop = {
    id: shopId,
    name: input.name.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone?.trim(),
    ownerEmail: input.ownerEmail?.trim(),
    address: input.address?.trim(),
    currencyCode: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: now,
    updatedAt: now,
  };

  const settings: ShopSettings = {
    id: shopId,
    shopId,
    openingCash: 0,
    lowStockThreshold: 5,
    defaultTaxRate: 0,
    paymentMethods: ['cash', 'upi'],
    updatedAt: now,
  };

  await db.transaction('rw', [db.shops, db.shop_settings, db.sync_outbox], async () => {
    await db.shops.add(shop);
    await db.shop_settings.add(settings);
    await appendToOutbox({
      db,
      shopId,
      entityType: 'shop',
      entityId: shopId,
      operation: 'create',
      payload: { shop, settings },
    });
  });

  // Register device
  await db.devices.put({
    id: getDeviceId(),
    shopId,
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    firstSeen: now,
    lastSeen: now,
  });

  return shop;
}

/** Get the current shop (returns first shop found — V1 is single-shop). */
export async function getShop(): Promise<Shop | undefined> {
  const db = getDB();
  return db.shops.toCollection().first();
}

/** Get shop settings. */
export async function getShopSettings(shopId: string): Promise<ShopSettings | undefined> {
  const db = getDB();
  return db.shop_settings.get(shopId);
}

/** Check if any shop exists in the local DB. */
export async function hasShop(): Promise<boolean> {
  const db = getDB();
  const count = await db.shops.count();
  return count > 0;
}

/** Update existing shop details (e.g. link owner email, phone, name). */
export async function updateShop(shopId: string, updates: Partial<Shop>): Promise<Shop> {
  const db = getDB();
  const existing = await db.shops.get(shopId);
  if (!existing) throw new Error('Shop not found');

  const updated: Shop = {
    ...existing,
    ...updates,
    id: shopId,
    updatedAt: Date.now(),
  };

  await db.shops.put(updated);
  return updated;
}

