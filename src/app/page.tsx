'use client';

import { useShop } from '@/contexts/ShopContext';
import ShopSetup from '@/components/ShopSetup';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const { shop, isLoading } = useShop();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-900 mb-2">बैठक</div>
          <div className="text-gray-500 text-sm">Loading your shop...</div>
        </div>
      </div>
    );
  }

  if (!shop) {
    return <ShopSetup />;
  }

  return <Dashboard shop={shop} />;
}
