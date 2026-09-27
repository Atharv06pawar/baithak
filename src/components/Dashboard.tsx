'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Shop } from '@/lib/types';
import POSScreen from '@/components/POSScreen';
import SaleHistory from '@/components/SaleHistory';
import InventoryScreen from '@/components/InventoryScreen';
import BusinessScreen from '@/components/BusinessScreen';
import ActionCenterView from '@/components/ActionCenterView';
import AskBaithakView from '@/components/AskBaithakView';
import SettingsBackupView from '@/components/SettingsBackupView';
import { syncEngine, type SyncEngineStatus } from '@/lib/sync/engine';
import { useShop } from '@/contexts/ShopContext';

export type MainTab =
  | 'pos'
  | 'history'
  | 'stock'
  | 'business'
  | 'action_center'
  | 'ai'
  | 'settings';

export default function Dashboard({ shop }: { shop: Shop }) {
  const { lock } = useShop();
  const [activeTab, setActiveTab] = useState<MainTab>('pos');
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());

  useEffect(() => {
    // Start background sync listener
    syncEngine.start();
    const unsub = syncEngine.subscribe((st) => setSyncStatus(st));
    return () => {
      unsub();
      syncEngine.stop();
    };
  }, []);

  // Hardware Back Button: Tab Navigation History
  const navigateTab = useCallback((newTab: MainTab) => {
    if (newTab === activeTab) return;
    if (typeof window !== 'undefined') {
      window.history.pushState({ baithak_tab: newTab }, '');
    }
    setActiveTab(newTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Set initial baseline history state
    window.history.replaceState({ baithak_tab: 'pos' }, '');

    const handlePopState = (e: PopStateEvent) => {
      // If modal event, let modal hook handle it
      if (e.state && e.state.baithak_modal) return;

      if (e.state && e.state.baithak_tab) {
        setActiveTab(e.state.baithak_tab);
      } else {
        // Return to default POS tab rather than exiting the application
        setActiveTab('pos');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] w-full bg-gray-50 overflow-hidden fixed inset-0">
      {/* Top Header - Strictly shrink-0 pinned at top */}
      <header className="shrink-0 bg-blue-900 text-white px-4 py-2.5 flex items-center justify-between shadow-md z-20">
        <div>
          <div className="font-black text-base tracking-wide flex items-center gap-2">
            <span>बैठक</span>
            <span className="font-semibold text-sm opacity-90 truncate max-w-[160px] sm:max-w-xs">
              {shop.name}
            </span>
          </div>
          <div className="text-blue-200 text-[11px]">{shop.ownerName} • Shop OS</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Status Badge */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-100 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                syncStatus.state === 'synced'
                  ? 'bg-green-400 animate-pulse'
                  : syncStatus.state === 'syncing'
                  ? 'bg-amber-300 animate-ping'
                  : 'bg-gray-400'
              }`}
            />
            <span className="truncate max-w-[110px]">{syncStatus.label}</span>
          </div>

          {/* Quick Lock Button */}
          <button
            onClick={lock}
            title="Lock Counter"
            className="bg-white/10 hover:bg-white/20 active:scale-95 text-blue-100 text-xs px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1 transition-transform"
          >
            <span>🔒</span>
            <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </header>

      {/* Main Tab Panels - flex-1 min-h-0 so child views scroll within themselves */}
      <main className="flex-1 overflow-hidden relative min-h-0 flex flex-col">
        {activeTab === 'pos' && <POSScreen shopId={shop.id} />}
        {activeTab === 'history' && <SaleHistory shopId={shop.id} />}
        {activeTab === 'stock' && <InventoryScreen shopId={shop.id} />}
        {activeTab === 'business' && <BusinessScreen shopId={shop.id} />}
        {activeTab === 'action_center' && <ActionCenterView shopId={shop.id} />}
        {activeTab === 'ai' && <AskBaithakView shopId={shop.id} />}
        {activeTab === 'settings' && <SettingsBackupView shop={shop} />}
      </main>

      {/* Bottom Counter Bar Navigation - Strictly shrink-0 pinned to bottom of phone screen */}
      <nav className="shrink-0 bg-white border-t border-gray-200 flex justify-around shadow-lg select-none safe-bottom pb-1 z-30">
        {(
          [
            { id: 'pos' as MainTab, label: 'POS', icon: '🛒' },
            { id: 'history' as MainTab, label: 'Sales', icon: '📋' },
            { id: 'stock' as MainTab, label: 'Stock', icon: '📦' },
            { id: 'business' as MainTab, label: 'Khata', icon: '📝' },
            { id: 'action_center' as MainTab, label: 'Alerts', icon: '⚡' },
            { id: 'ai' as MainTab, label: 'Ask AI', icon: '🤖' },
            { id: 'settings' as MainTab, label: 'Backup', icon: '⚙️' },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => navigateTab(tab.id)}
              className={`flex-1 py-1.5 px-0.5 flex flex-col items-center justify-center gap-0.5 min-h-[52px] transition-all ${
                isActive
                  ? 'text-blue-900 border-t-2 border-blue-900 bg-blue-50/50 font-bold -mt-px'
                  : 'text-gray-400 hover:text-gray-700 active:scale-95'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
