'use client';

import React, { useState, useEffect } from 'react';
import { exportShopBackup, restoreShopBackup, downloadBackupJson, type ShopBackupData } from '@/lib/backup';
import { syncEngine, type SyncEngineStatus } from '@/lib/sync/engine';
import { getDeviceId } from '@/lib/device';
import { getShopSettings } from '@/lib/domain/shop';
import { runSyntheticShopSimulation } from '@/lib/simulator';
import { toPaise, formatMoney } from '@/lib/money';
import { useShop } from '@/contexts/ShopContext';
import type { Shop, UUID } from '@/lib/types';

export default function SettingsBackupView({ shop }: { shop: Shop }) {
  const { refreshShop, changePin, lock, hasCustomPin } = useShop();
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());
  const [deviceId, setDeviceId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  useEffect(() => {
    setDeviceId(getDeviceId());
    const unsub = syncEngine.subscribe((st) => setSyncStatus(st));
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

  async function handleExport() {
    setIsExporting(true);
    try {
      const backup = await exportShopBackup(shop.id);
      downloadBackupJson(backup);
    } catch (err) {
      alert('Failed to export backup: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      'Restoring a backup will replace current local shop data with the backup file. Do you wish to continue?'
    );
    if (!confirmed) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as ShopBackupData;
        await restoreShopBackup(json);
        await refreshShop();
        alert('Shop backup restored successfully!');
      } catch (err) {
        alert('Failed to restore backup file: ' + (err instanceof Error ? err.message : 'Invalid JSON'));
      }
    };
    reader.readAsText(file);
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
        <div className="font-black text-xl text-gray-900">⚙️ Settings & Data Ownership</div>
        <div className="text-xs text-gray-500">
          Data export, backup restore, sync status, and shop diagnostics.
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

      {/* Sync Status Card */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="font-bold text-sm text-gray-900 flex items-center justify-between">
          <span>Synchronization Status</span>
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
          <div>Device ID: {deviceId || 'browser-profile'}</div>
          <div>Pending Outbox Events: {syncStatus.pendingCount}</div>
        </div>

        <button
          onClick={() => syncEngine.triggerSync()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs py-2 px-3 rounded-xl"
        >
          🔄 Force Sync Now
        </button>
      </div>

      {/* Data Ownership: Export / Restore */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div>
          <div className="font-bold text-sm text-gray-900">Complete Shop Backup & Export</div>
          <div className="text-xs text-gray-500 mt-0.5">
            You own 100% of your data. Download a complete JSON snapshot anytime or restore to another device.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-xl text-xs shadow text-center"
          >
            {isExporting ? 'Exporting…' : '📥 Download Backup File (.json)'}
          </button>

          <label className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl text-xs text-center cursor-pointer">
            📤 Restore from File (.json)
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
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
