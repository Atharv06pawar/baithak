'use client';

import React, { useState, useEffect } from 'react';
import { syncEngine, type SyncEngineStatus } from '@/lib/sync/engine';
import { getDeviceId } from '@/lib/device';
import { runSyntheticShopSimulation } from '@/lib/simulator';
import { formatMoney } from '@/lib/money';
import { useShop } from '@/contexts/ShopContext';
import {
  getCloudCredentials,
  saveCloudCredentials,
  testCloudConnection,
  cloudSyncPush,
  cloudSyncPull,
  isCloudConfigured,
} from '@/lib/cloud/supabase';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { Shop } from '@/lib/types';

export default function SettingsBackupView({ shop }: { shop: Shop }) {
  const { refreshShop, changePin, lock, hasCustomPin } = useShop();
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());
  const [deviceId, setDeviceId] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // PIN state
  const [newPin, setNewPin] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // Cloud DB state
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [cloudStatusMsg, setCloudStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isCloudRestoring, setIsCloudRestoring] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);

  // Intercept back button if cloud config modal is open
  useMobileBackHandler(showCloudConfig, () => setShowCloudConfig(false), 'settings_cloud_config');

  useEffect(() => {
    setDeviceId(getDeviceId());
    const unsub = syncEngine.subscribe((st) => setSyncStatus(st));

    // Load initial cloud credentials
    const creds = getCloudCredentials();
    if (creds) {
      setSupabaseUrl(creds.supabaseUrl);
      setSupabaseAnonKey(creds.supabaseAnonKey);
      setCloudConfigured(true);
    } else {
      setCloudConfigured(false);
    }

    return () => unsub();
  }, []);

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    if (newPin.length < 4) {
      alert('PIN must be at least 4 digits');
      return;
    }
    await changePin(newPin);
    setNewPin('');
    setIsChangingPin(false);
    setPinSuccessMessage('✓ Master PIN updated successfully!');
    setTimeout(() => setPinSuccessMessage(''), 3000);
  }

  async function handleSaveCloudConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setCloudStatusMsg({ text: 'Please enter both Supabase URL and Anon Key', type: 'error' });
      return;
    }
    saveCloudCredentials({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
    });
    setCloudConfigured(true);
    setCloudStatusMsg({ text: '✓ Cloud credentials saved locally!', type: 'success' });
    setTimeout(() => setCloudStatusMsg(null), 3000);
    setShowCloudConfig(false);
  }

  async function handleTestConnection() {
    setIsTestingConn(true);
    setCloudStatusMsg({ text: 'Connecting to Supabase…', type: 'info' });
    try {
      const res = await testCloudConnection();
      setCloudStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err) {
      setCloudStatusMsg({
        text: 'Connection failed: ' + (err instanceof Error ? err.message : 'Network error'),
        type: 'error',
      });
    } finally {
      setIsTestingConn(false);
    }
  }

  async function handleForceCloudSync() {
    if (!cloudConfigured) {
      setShowCloudConfig(true);
      setCloudStatusMsg({
        text: 'Please configure your free Supabase URL & Anon Key first.',
        type: 'info',
      });
      return;
    }

    setIsCloudSyncing(true);
    setCloudStatusMsg({ text: 'Uploading latest shop backup to online DB…', type: 'info' });
    try {
      const res = await cloudSyncPush(shop.id);
      setCloudStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err) {
      setCloudStatusMsg({
        text: 'Cloud sync failed: ' + (err instanceof Error ? err.message : 'Error'),
        type: 'error',
      });
    } finally {
      setIsCloudSyncing(false);
    }
  }

  async function handleRestoreFromCloud() {
    if (!cloudConfigured) {
      setShowCloudConfig(true);
      setCloudStatusMsg({
        text: 'Please configure your free Supabase URL & Anon Key first.',
        type: 'info',
      });
      return;
    }

    const confirmed = window.confirm(
      'Restoring from the online DB will replace your local offline shop data with the latest cloud backup. Continue?'
    );
    if (!confirmed) return;

    setIsCloudRestoring(true);
    setCloudStatusMsg({ text: 'Fetching latest backup from online DB…', type: 'info' });
    try {
      const res = await cloudSyncPull(shop.id);
      if (res.success) {
        await refreshShop();
        setCloudStatusMsg({ text: res.message, type: 'success' });
      } else {
        setCloudStatusMsg({ text: res.message, type: 'error' });
      }
    } catch (err) {
      setCloudStatusMsg({
        text: 'Restore failed: ' + (err instanceof Error ? err.message : 'Error'),
        type: 'error',
      });
    } finally {
      setIsCloudRestoring(false);
    }
  }

  async function handleRunSimulator() {
    const confirmed = window.confirm(
      'This will populate your shop with 100 authentic paan shop items, 5 suppliers, customers, and recent transactions for testing. Proceed?'
    );
    if (!confirmed) return;

    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await runSyntheticShopSimulation({
        shopId: shop.id,
        daysToSimulate: 7,
        salesPerDay: 15,
      });
      setSimulationResult(
        `✓ Simulated ${res.totalDays} days: ${res.productsCreated} products, ${res.suppliersCreated} suppliers, ${res.salesCreated} sales (${formatMoney(res.totalRevenue)} revenue) generated!`
      );
      await refreshShop();
    } catch (err) {
      alert('Simulator failed: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSimulating(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto p-4 space-y-5">
      {/* Header */}
      <div>
        <div className="font-black text-xl text-gray-900">⚙️ Settings & Online Cloud DB</div>
        <div className="text-xs text-gray-500">
          Single login account, offline-first storage with free Supabase cloud backup.
        </div>
      </div>

      {/* Single Owner Account & Security Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b pb-2.5">
          <div>
            <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <span>👤</span> Single Master Account
            </div>
            <div className="text-xs text-gray-500">
              Only one owner account per shop. Operates 100% offline.
            </div>
          </div>
          <button
            onClick={lock}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
          >
            <span>🔒</span> Lock Counter
          </button>
        </div>

        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Owner Name:</span>
            <span className="font-bold text-gray-900">{shop.ownerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mobile / Login ID:</span>
            <span className="font-bold text-gray-900">{shop.phone || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Master PIN:</span>
            <span className="font-bold text-blue-900">
              {hasCustomPin ? '● ● ● ● (Custom PIN Set)' : '1234 (Default PIN)'}
            </span>
          </div>
        </div>

        {pinSuccessMessage && (
          <div className="text-xs text-green-700 bg-green-50 p-2 rounded-xl border border-green-200 font-semibold">
            {pinSuccessMessage}
          </div>
        )}

        {isChangingPin ? (
          <form onSubmit={handleSavePin} className="pt-2 border-t border-gray-100 space-y-2">
            <div className="text-xs font-semibold text-gray-800">Set New 4-Digit Master PIN:</div>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="New 4-digit PIN"
                className="flex-1 border rounded-xl px-3 py-1.5 text-sm font-mono tracking-widest"
                autoFocus
              />
              <button
                type="submit"
                className="bg-blue-900 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow"
              >
                Save PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setNewPin('');
                }}
                className="border border-gray-300 text-gray-600 text-xs px-2.5 py-1.5 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsChangingPin(true)}
            className="text-xs text-blue-700 hover:text-blue-900 font-bold"
          >
            ✏️ Change Master PIN
          </button>
        )}
      </div>

      {/* Online Cloud DB Card (Supabase Free Tier) */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between border-b pb-2.5">
          <div>
            <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <span>☁️</span> Online Cloud Database (Supabase Free Tier)
            </div>
            <div className="text-xs text-gray-500">
              All transactions remain instantaneous and offline on your phone, with free cloud sync.
            </div>
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              cloudConfigured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {cloudConfigured ? '● Configured' : '○ Not Linked'}
          </span>
        </div>

        {/* Status Notification */}
        {cloudStatusMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold border ${
              cloudStatusMsg.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : cloudStatusMsg.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {cloudStatusMsg.text}
          </div>
        )}

        {/* Sync & Restore Actions (Replaces manual JSON file download) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={handleForceCloudSync}
            disabled={isCloudSyncing}
            className="bg-blue-900 hover:bg-blue-800 active:scale-98 text-white font-bold py-3 px-4 rounded-xl text-xs shadow flex items-center justify-center gap-2 transition-transform disabled:opacity-60"
          >
            <span>{isCloudSyncing ? '⏳' : '⚡'}</span>
            <span>{isCloudSyncing ? 'Updating Online DB…' : 'Force Sync (Update Online DB)'}</span>
          </button>

          <button
            onClick={handleRestoreFromCloud}
            disabled={isCloudRestoring}
            className="bg-white border-2 border-blue-900 hover:bg-blue-50 active:scale-98 text-blue-900 font-bold py-3 px-4 rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 transition-transform disabled:opacity-60"
          >
            <span>{isCloudRestoring ? '⏳' : '📥'}</span>
            <span>{isCloudRestoring ? 'Fetching Backup…' : 'Restore from Online DB'}</span>
          </button>
        </div>

        {/* Supabase Connection Setup Toggle */}
        <div className="pt-1">
          <button
            onClick={() => setShowCloudConfig(!showCloudConfig)}
            className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1"
          >
            <span>⚙️</span>
            <span>{showCloudConfig ? 'Hide Cloud DB Configuration' : 'Configure Supabase Credentials (Free Account)'}</span>
          </button>

          {showCloudConfig && (
            <form onSubmit={handleSaveCloudConfig} className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
              <div className="text-xs text-gray-600">
                You can create a 100% free project at{' '}
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-bold underline"
                >
                  supabase.com
                </a>
                . No credit card required. Paste your Project URL and Anon/Public Key below:
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full border rounded-xl px-3 py-2 text-xs font-mono bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Supabase Anon Key (Public)
                </label>
                <input
                  type="password"
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full border rounded-xl px-3 py-2 text-xs font-mono bg-white"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 space-y-1">
                <div className="font-bold">📋 Required Table Schema in Supabase:</div>
                <div>Run this 1-line script in your Supabase SQL Editor once:</div>
                <code className="block bg-amber-100/70 p-1.5 rounded text-[10px] font-mono break-all select-all">
                  CREATE TABLE IF NOT EXISTS shop_backups (shop_id text PRIMARY KEY, shop_name text, owner_name text, total_products int, total_sales int, backup_payload jsonb, updated_at timestamptz DEFAULT now());
                </code>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConn || !supabaseUrl || !supabaseAnonKey}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs px-3 py-2 rounded-xl disabled:opacity-50"
                >
                  {isTestingConn ? 'Testing…' : '🔍 Test Connection'}
                </button>
                <button
                  type="submit"
                  className="bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-4 py-2 rounded-xl shadow flex-1 text-center"
                >
                  Save Cloud Settings
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Local Sync Status Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="font-bold text-sm text-gray-900 flex items-center justify-between">
          <span>Local Device Outbox</span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              syncStatus.state === 'synced'
                ? 'bg-green-100 text-green-800'
                : syncStatus.state === 'syncing'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {syncStatus.label}
          </span>
        </div>

        <div className="text-xs text-gray-500 space-y-1 font-mono">
          <div>Device ID: {deviceId || 'mobile-browser'}</div>
          <div>Pending Local Outbox Events: {syncStatus.pendingCount}</div>
        </div>
      </div>

      {/* Synthetic Shop Simulator */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div>
          <div className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
            <span>🧪</span> Synthetic Paan Shop Simulator
          </div>
          <div className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Need test data? Populate your shop instantly with 100 real paan shop catalog items (Banarasi, Baba, Rajnigandha, Classic, Thums Up, Lays, Cadbury), 5 wholesale suppliers, and 7 days of simulated sales.
          </div>
        </div>

        {simulationResult && (
          <div className="bg-white/80 p-2.5 rounded-xl text-xs font-semibold text-green-800 border border-green-200">
            {simulationResult}
          </div>
        )}

        <button
          onClick={handleRunSimulator}
          disabled={isSimulating}
          className="bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow transition-transform disabled:opacity-50"
        >
          {isSimulating ? 'Generating 100 Items & Sales…' : '✨ Populate Shop with Realistic Data'}
        </button>
      </div>

      {/* Shop Info */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2 text-xs">
        <div className="font-bold text-sm text-gray-900">Shop Profile</div>
        <div className="flex justify-between py-1 border-b text-gray-600">
          <span>Shop Name:</span>
          <span className="font-bold text-gray-900">{shop.name}</span>
        </div>
        <div className="flex justify-between py-1 border-b text-gray-600">
          <span>Owner:</span>
          <span className="font-bold text-gray-900">{shop.ownerName}</span>
        </div>
        <div className="flex justify-between py-1 border-b text-gray-600">
          <span>Currency:</span>
          <span className="font-bold text-gray-900">INR (₹)</span>
        </div>
        <div className="flex justify-between py-1 text-gray-600">
          <span>Timezone:</span>
          <span className="font-bold text-gray-900">Asia/Kolkata</span>
        </div>
      </div>
    </div>
  );
}
