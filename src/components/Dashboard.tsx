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
import NotificationCenterModal from '@/components/NotificationCenterModal';
import { syncEngine, type SyncEngineStatus } from '@/lib/sync/engine';
import { getOperationalTasks } from '@/lib/domain/task';
import { googleDriveAutoSync } from '@/lib/cloud/googleDrive';
import { supabaseAutoSync } from '@/lib/cloud/supabase';
import { useShop } from '@/contexts/ShopContext';
import { useTheme } from '@/contexts/ThemeContext';

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
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<MainTab>('pos');
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0);

  // Multi-Device Cloud Sync: keeps all phones & devices synchronized
  useEffect(() => {
    supabaseAutoSync.start(shop.id);
    googleDriveAutoSync.start(shop.id);
    return () => {
      supabaseAutoSync.stop();
      googleDriveAutoSync.stop();
    };
  }, [shop.id]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const tasks = await getOperationalTasks(shop.id);
      const pending = tasks.filter((t) => t.status === 'pending').length;
      setPendingNotificationCount(pending);
    } catch {
      // non-blocking
    }
  }, [shop.id]);

  useEffect(() => {
    // Start background sync listener & task counter
    syncEngine.start();
    const unsub = syncEngine.subscribe((st) => setSyncStatus(st));
    refreshPendingCount();

    return () => {
      unsub();
      syncEngine.stop();
    };
  }, [refreshPendingCount]);

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
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] w-full bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 overflow-hidden fixed inset-0">
      {/* Top Header - Strictly shrink-0 pinned at top */}
      <header className="shrink-0 bg-blue-900 dark:bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between shadow-md z-20 border-b border-blue-950 dark:border-slate-800">
        <div>
          <div className="font-black text-base tracking-wide flex items-center gap-2">
            <span>बैठक</span>
            <span className="font-semibold text-sm opacity-90 truncate max-w-[160px] sm:max-w-xs">
              {shop.name}
            </span>
          </div>
          <div className="text-blue-200 dark:text-slate-400 text-[11px]">{shop.ownerName} • Shop OS</div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="bg-white/10 hover:bg-white/20 active:scale-95 text-blue-100 dark:text-slate-200 text-xs px-2.5 py-1.5 rounded-full border border-white/10 flex items-center gap-1 transition-transform"
          >
            <span className="text-xs leading-none">{isDark ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline text-[11px] font-medium">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          {/* In-App Operational Notification Bell */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            title="Shop Tasks & Notifications"
            className="relative bg-white/10 hover:bg-white/20 active:scale-95 text-blue-100 dark:text-slate-200 text-xs px-2.5 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 transition-transform"
          >
            <span className="text-sm leading-none">🔔</span>
            {pendingNotificationCount > 0 ? (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full leading-tight min-w-[16px] text-center shadow-xs">
                {pendingNotificationCount}
              </span>
            ) : (
              <span className="hidden sm:inline text-[11px] text-blue-200 dark:text-slate-300">Tasks</span>
            )}
          </button>

          {/* Sync Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-blue-100 dark:text-slate-200 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
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
            className="bg-white/10 hover:bg-white/20 active:scale-95 text-blue-100 dark:text-slate-200 text-xs px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1 transition-transform"
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

      {/* In-App Operational Task & Notification Hub */}
      <NotificationCenterModal
        isOpen={isNotificationOpen}
        onClose={() => {
          setIsNotificationOpen(false);
          refreshPendingCount();
        }}
        shopId={shop.id}
        onNavigateTab={(tab) => {
          if (tab === 'inventory') navigateTab('stock');
          else if (tab === 'business') navigateTab('business');
          else if (tab === 'pos') navigateTab('pos');
        }}
      />

      {/* Bottom Counter Bar Navigation - Strictly shrink-0 pinned to bottom of phone screen */}
      <nav className="shrink-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex justify-around shadow-lg select-none safe-bottom pb-1 z-30">
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
                  ? 'text-blue-900 dark:text-blue-400 border-t-2 border-blue-900 dark:border-blue-400 bg-blue-50/50 dark:bg-slate-800/60 font-bold -mt-px'
                  : 'text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 active:scale-95'
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
