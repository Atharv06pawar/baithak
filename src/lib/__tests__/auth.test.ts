import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDB, getDB } from '@/lib/db';
import { createShop } from '@/lib/domain/shop';
import {
  verifyMasterPin,
  setMasterPin,
  getMasterAccount,
} from '@/lib/domain/auth';

const SHOP_ID = 'auth-test-shop';

beforeEach(async () => {
  const db = getDB();
  if (db.isOpen()) {
    await db.delete();
  }
  _resetDB();
  await getDB().open();
  await createShop({
    name: 'Sharma Paan House',
    ownerName: 'Ramesh Sharma',
    phone: '9820011223',
  });
});

describe('Single Master Account Authentication', () => {
  it('retrieves single master owner account details', async () => {
    const account = await getMasterAccount();
    expect(account).not.toBeNull();
    expect(account?.ownerName).toBe('Ramesh Sharma');
    expect(account?.shopName).toBe('Sharma Paan House');
    expect(account?.phone).toBe('9820011223');
    expect(account?.hasCustomPin).toBe(false);
  });

  it('accepts default master PIN (1234) before custom PIN is set', async () => {
    const account = await getMasterAccount();
    expect(account).not.toBeNull();

    const isDefaultValid = await verifyMasterPin(account!.shopId, '1234');
    expect(isDefaultValid).toBe(true);

    const isWrongValid = await verifyMasterPin(account!.shopId, '9999');
    expect(isWrongValid).toBe(false);
  });

  it('allows owner to set and verify custom 4-digit PIN', async () => {
    const account = await getMasterAccount();
    expect(account).not.toBeNull();

    // Set custom PIN 5678
    await setMasterPin(account!.shopId, '5678');

    const updatedAccount = await getMasterAccount();
    expect(updatedAccount?.hasCustomPin).toBe(true);

    // Old default PIN should now fail
    const isOldValid = await verifyMasterPin(account!.shopId, '1234');
    expect(isOldValid).toBe(false);

    // New PIN succeeds
    const isNewValid = await verifyMasterPin(account!.shopId, '5678');
    expect(isNewValid).toBe(true);
  });

  it('rejects PINs shorter than 4 digits', async () => {
    const account = await getMasterAccount();
    await expect(setMasterPin(account!.shopId, '12')).rejects.toThrow('at least 4 digits');
  });
});
