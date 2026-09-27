/**
 * BaithakOS — Single Account Authentication & Master PIN Service
 *
 * Designed for neighborhood retail shops:
 * - Exactly one master owner account per shop.
 * - 4-digit PIN or password for counter lock/unlock.
 * - 100% offline — verified locally in IndexedDB / localStorage.
 * - Device stays unlocked during active counter operations.
 */

import { getDB } from '@/lib/db';
import { getShop, getShopSettings } from '@/lib/domain/shop';
import type { UUID } from '@/lib/types';

const SESSION_KEY = 'baithak_device_unlocked';
const DEFAULT_FALLBACK_PIN = '1234';

export interface MasterAccount {
  shopId: UUID;
  shopName: string;
  ownerName: string;
  phone: string;
  hasCustomPin: boolean;
}

/** Simple hash helper for local PIN storage */
function hashPin(pin: string, salt: string = 'baithak_salt'): string {
  // Simple deterministic hash suitable for offline local credential check
  let hash = 0;
  const str = salt + pin + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return String(hash);
}

/** Check if current device is currently unlocked */
export function isDeviceUnlocked(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(SESSION_KEY) === 'true';
}

/** Set device unlocked state */
export function setDeviceUnlockedState(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  if (unlocked) {
    localStorage.setItem(SESSION_KEY, 'true');
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

/** Get the single master owner account details */
export async function getMasterAccount(): Promise<MasterAccount | null> {
  const shop = await getShop();
  if (!shop) return null;

  const settings = await getShopSettings(shop.id);
  const storedHash = (settings as any)?.masterPinHash;

  return {
    shopId: shop.id,
    shopName: shop.name,
    ownerName: shop.ownerName,
    phone: shop.phone || '',
    hasCustomPin: !!storedHash,
  };
}

/** Set or change the Master PIN */
export async function setMasterPin(shopId: UUID, newPin: string): Promise<void> {
  if (!newPin || newPin.length < 4) {
    throw new Error('PIN must be at least 4 digits');
  }

  const db = getDB();
  const hash = hashPin(newPin);

  await db.shop_settings.update(shopId, {
    masterPinHash: hash,
    updatedAt: Date.now(),
  } as any);
}

/** Verify Master PIN against stored hash or fallback default */
export async function verifyMasterPin(shopId: UUID, enteredPin: string): Promise<boolean> {
  const settings = await getShopSettings(shopId);
  const storedHash = (settings as any)?.masterPinHash;

  if (storedHash) {
    const enteredHash = hashPin(enteredPin);
    return storedHash === enteredHash;
  }

  // If no custom PIN set yet, default PIN is '1234'
  return enteredPin === DEFAULT_FALLBACK_PIN;
}
