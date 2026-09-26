'use client';

import React, { useState } from 'react';
import type { Shop } from '@/lib/types';
import POSScreen from '@/components/POSScreen';
import SaleHistory from '@/components/SaleHistory';
import ProductManager from '@/components/ProductManager';

type Tab = 'pos' | 'history' | 'inventory';

export default function Dashboard({ shop }: { shop: Shop }) {
  const [activeTab, setActiveTab] = useState<Tab>('pos');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <div className="font-bold text-lg leading-tight">{shop.name}</div>
          <div className="text-blue-200 text-xs">{shop.ownerName}</div>
        </div>
        <div className="text-blue-200 text-xs text-right">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />
          Saved locally
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'pos' && <POSScreen shopId={shop.id} />}
        {activeTab === 'history' && <SaleHistory shopId={shop.id} />}
        {activeTab === 'inventory' && <ProductManager shopId={shop.id} />}
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 flex">
        {(
          [
            { id: 'pos' as Tab, label: 'POS', icon: '🛒' },
            { id: 'history' as Tab, label: 'Sales', icon: '📋' },
            { id: 'inventory' as Tab, label: 'Products', icon: '📦' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors min-h-[60px] ${
              activeTab === tab.id
                ? 'text-blue-900 border-t-2 border-blue-900 -mt-px'
                : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
