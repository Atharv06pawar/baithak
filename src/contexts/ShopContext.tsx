'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getShop } from '@/lib/domain/shop';
import {
  isDeviceUnlocked,
  setDeviceUnlockedState,
  verifyMasterPin,
  setMasterPin,
  getMasterAccount,
} from '@/lib/domain/auth';
import type { Shop } from '@/lib/types';

interface ShopContextValue {
  shop: Shop | null;
  isLoading: boolean;
  isUnlocked: boolean;
  hasCustomPin: boolean;
  refreshShop: () => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  changePin: (newPin: string) => Promise<void>;
}

const ShopContext = createContext<ShopContextValue>({
  shop: null,
  isLoading: true,
  isUnlocked: false,
  hasCustomPin: false,
  refreshShop: async () => {},
  unlock: async () => false,
  lock: () => {},
  changePin: async () => {},
});

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasCustomPin, setHasCustomPin] = useState(false);

  const loadShop = useCallback(async () => {
    try {
      const found = await getShop();
      setShop(found ?? null);
      if (found) {
        const account = await getMasterAccount();
        setHasCustomPin(!!account?.hasCustomPin);
        // Check if device session is currently unlocked
        setIsUnlocked(isDeviceUnlocked());
      }
    } catch (err) {
      console.error('Failed to load shop:', err);
      setShop(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!shop) return false;
      const valid = await verifyMasterPin(shop.id, pin);
      if (valid) {
        setIsUnlocked(true);
        setDeviceUnlockedState(true);
        return true;
      }
      return false;
    },
    [shop]
  );

  const lock = useCallback(() => {
    setIsUnlocked(false);
    setDeviceUnlockedState(false);
  }, []);

  const changePin = useCallback(
    async (newPin: string) => {
      if (!shop) return;
      await setMasterPin(shop.id, newPin);
      setHasCustomPin(true);
    },
    [shop]
  );

  return (
    <ShopContext.Provider
      value={{
        shop,
        isLoading,
        isUnlocked,
        hasCustomPin,
        refreshShop: loadShop,
        unlock,
        lock,
        changePin,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
