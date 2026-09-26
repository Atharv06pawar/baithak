'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getShop, hasShop } from '@/lib/domain/shop';
import type { Shop } from '@/lib/types';

interface ShopContextValue {
  shop: Shop | null;
  isLoading: boolean;
  refreshShop: () => Promise<void>;
}

const ShopContext = createContext<ShopContextValue>({
  shop: null,
  isLoading: true,
  refreshShop: async () => {},
});

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadShop = useCallback(async () => {
    try {
      const found = await getShop();
      setShop(found ?? null);
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

  return (
    <ShopContext.Provider value={{ shop, isLoading, refreshShop: loadShop }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
