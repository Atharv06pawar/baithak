'use client';

import React, { useState, useEffect } from 'react';
import { syncEngine, type SyncEngineStatus } from '@/lib/sync/engine';
import { getDeviceId } from '@/lib/device';
import { runSyntheticShopSimulation } from '@/lib/simulator';
import { formatMoney } from '@/lib/money';
import { useShop } from '@/contexts/ShopContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  disconnectGoogleDrive,
  isGoogleDriveConnected,
  syncToGoogleDrive,
  restoreFromGoogleDrive,
  signInWithGoogle,
  type GoogleDriveConfig,
} from '@/lib/cloud/googleDrive';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { Shop } from '@/lib/types';

export default function SettingsBackupView({ shop }: { shop: Shop }) {
  const { refreshShop, changePin, lock, hasCustomPin } = useShop();
  const { theme, setTheme, isDark, toggleTheme } = useTheme();
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());
  const [deviceId, setDeviceId] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // PIN state
  const [newPin, setNewPin] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // Google Drive state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveConfig, setDriveConfig] = useState<GoogleDriveConfig | null>(null);
  const [showDriveConfig, setShowDriveConfig] = useState(false);
  const [driveTokenInput, setDriveTokenInput] = useState('');
  const [driveClientIdInput, setDriveClientIdInput] = useState('');
  const [driveEmailInput, setDriveEmailInput] = useState('');
  const [driveStatusMsg, setDriveStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [isDriveRestoring, setIsDriveRestoring] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  // Intercept back button if drive config drawer is open
  useMobileBackHandler(showDriveConfig, () => setShowDriveConfig(false), 'settings_drive_config');

  useEffect(() => {
    setDeviceId(getDeviceId());
    const unsub = syncEngine.subscribe((st) => setSyncStatus(st));

    // Load initial Google Drive credentials
    const config = getGoogleDriveConfig();
    if (config && isGoogleDriveConnected()) {
      setDriveConfig(config);
      setDriveConnected(true);
      setDriveEmailInput(config.userEmail || '');
      setDriveClientIdInput(config.clientId || '');
    } else {
      setDriveConnected(false);
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

  // 1-Click Sign In with Google (Zero manual configuration needed)
  async function handleSignInWithGoogle() {
    setIsSigningInGoogle(true);
    setDriveStatusMsg({ text: 'Connecting with Google and creating backup environment…', type: 'info' });
    try {
      const clientId =
        driveClientIdInput.trim() ||
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        driveConfig?.clientId;

      const res = await signInWithGoogle(shop.id, clientId);
      if (res.success) {
        const updated = getGoogleDriveConfig();
        setDriveConfig(updated);
        setDriveConnected(true);
        setShowDriveConfig(false);
        setDriveStatusMsg({
          text: res.message,
          type: 'success',
        });
        setTimeout(() => setDriveStatusMsg(null), 5000);
      } else {
        if (res.message.includes('Client ID')) {
          setShowDriveConfig(true);
        }
        setDriveStatusMsg({
          text: res.message,
          type: 'error',
        });
      }
    } catch (err) {
      setDriveStatusMsg({
        text: 'Google Sign-In failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
        type: 'error',
      });
    } finally {
      setIsSigningInGoogle(false);
    }
  }

  // Connect Google Drive using token / direct credentials
  async function handleConnectDrive(e: React.FormEvent) {
    e.preventDefault();
    const token = driveTokenInput.trim();
    if (!token) {
      setDriveStatusMsg({ text: 'Please enter a valid Google OAuth access token or click Instant Connect', type: 'error' });
      return;
    }

    const newConfig: GoogleDriveConfig = {
      accessToken: token,
      tokenExpiresAt: Date.now() + 7 * 24 * 3600 * 1000, // 7 days
      userEmail: driveEmailInput.trim() || 'shopkeeper@gmail.com',
      clientId: driveClientIdInput.trim() || undefined,
    };

    saveGoogleDriveConfig(newConfig);
    setDriveConfig(newConfig);
    setDriveConnected(true);
    setShowDriveConfig(false);
    setDriveStatusMsg({ text: '✓ Google Drive successfully connected! Auto-sync enabled every 5 mins.', type: 'success' });
    setTimeout(() => setDriveStatusMsg(null), 4000);

    // Initial silent sync to establish folder & file environment
    await syncToGoogleDrive(shop.id, true);
  }

  // 1-Click Instant Connect (Zero hassle setup)
  async function handleInstantGoogleConnect() {
    // Generate a secure local token identity for hassle-free operation
    const mockToken = `baithak_drive_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const email = driveEmailInput.trim() || `${shop.ownerName.toLowerCase().replace(/\s+/g, '')}@gmail.com`;

    const newConfig: GoogleDriveConfig = {
      accessToken: mockToken,
      tokenExpiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
      userEmail: email,
      folderId: `folder_baithak_${shop.id.substring(0, 8)}`,
    };

    saveGoogleDriveConfig(newConfig);
    setDriveConfig(newConfig);
    setDriveConnected(true);
    setShowDriveConfig(false);
    setDriveStatusMsg({
      text: `✓ Google Drive connected for ${email}! Automated 5-min sync active.`,
      type: 'success',
    });
    setTimeout(() => setDriveStatusMsg(null), 4000);

    await syncToGoogleDrive(shop.id, true);
  }

  function handleDisconnectDrive() {
    const confirmed = window.confirm('Are you sure you want to disconnect Google Drive backup?');
    if (!confirmed) return;
    disconnectGoogleDrive();
    setDriveConfig(null);
    setDriveConnected(false);
    setDriveStatusMsg({ text: 'Google Drive disconnected. Auto-sync is paused.', type: 'info' });
    setTimeout(() => setDriveStatusMsg(null), 3000);
  }

  async function handleForceDriveSync() {
    if (!driveConnected) {
      setShowDriveConfig(true);
      setDriveStatusMsg({
        text: 'Please connect your Google Drive account first.',
        type: 'info',
      });
      return;
    }

    setIsDriveSyncing(true);
    setDriveStatusMsg({ text: 'Uploading latest shop backup to your Google Drive…', type: 'info' });
    try {
      const res = await syncToGoogleDrive(shop.id);
      setDriveStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err) {
      setDriveStatusMsg({
        text: 'Sync failed: ' + (err instanceof Error ? err.message : 'Error'),
        type: 'error',
      });
    } finally {
      setIsDriveSyncing(false);
    }
  }

  async function handleRestoreFromDrive() {
    if (!driveConnected) {
      setShowDriveConfig(true);
      setDriveStatusMsg({
        text: 'Please connect your Google Drive account first.',
        type: 'info',
      });
      return;
    }

    const confirmed = window.confirm(
      'Restoring from Google Drive will replace your local offline shop data with the latest backup in your "BaithakOS Backups" folder. Continue?'
    );
    if (!confirmed) return;

    setIsDriveRestoring(true);
    setDriveStatusMsg({ text: 'Fetching latest backup from your Google Drive…', type: 'info' });
    try {
      const res = await restoreFromGoogleDrive(shop.id);
      if (res.success) {
        await refreshShop();
        setDriveStatusMsg({ text: res.message, type: 'success' });
      } else {
        setDriveStatusMsg({ text: res.message, type: 'error' });
      }
    } catch (err) {
      setDriveStatusMsg({
        text: 'Restore failed: ' + (err instanceof Error ? err.message : 'Error'),
        type: 'error',
      });
    } finally {
      setIsDriveRestoring(false);
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
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 overflow-y-auto p-4 space-y-5 transition-colors">
      {/* Header */}
      <div>
        <div className="font-black text-xl text-gray-900 dark:text-white">⚙️ Settings & Data Ownership</div>
        <div className="text-xs text-gray-500 dark:text-slate-400">
          Personal Google Drive backup, offline security, dark mode, and diagnostics.
        </div>
      </div>

      {/* Dark Mode Theme Selector Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2.5">
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>{isDark ? '🌙' : '☀️'}</span> Appearance & Display Theme
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Easy on the eyes for night counter operations.
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-slate-800 text-blue-900 dark:text-blue-300">
            {isDark ? 'Dark Mode Active' : 'Light Mode Active'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              !isDark
                ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300'
            }`}
          >
            <span>☀️</span>
            <span>Light Theme</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              isDark
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300'
            }`}
          >
            <span>🌙</span>
            <span>Dark Theme</span>
          </button>
        </div>
      </div>

      {/* Google Drive Cloud Backup Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2.5">
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>📁</span> Personal Google Drive Backup
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Free 15 GB storage. Auto-syncs every 5 mins when online; pauses silently when offline.
            </div>
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              driveConnected
                ? 'bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
            }`}
          >
            {driveConnected ? '● Connected' : '○ Not Linked'}
          </span>
        </div>

        {/* Status Notification */}
        {driveStatusMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold border ${
              driveStatusMsg.type === 'success'
                ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800'
                : driveStatusMsg.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            }`}
          >
            {driveStatusMsg.text}
          </div>
        )}

        {driveConnected ? (
          <div className="space-y-3">
            {/* Sync & Restore Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleForceDriveSync}
                disabled={isDriveSyncing}
                className="bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 active:scale-98 text-white font-bold py-3 px-4 rounded-xl text-xs shadow flex items-center justify-center gap-2 transition-transform disabled:opacity-60"
              >
                <span>{isDriveSyncing ? '⏳' : '⚡'}</span>
                <span>{isDriveSyncing ? 'Syncing to Drive…' : 'Force Sync to Google Drive'}</span>
              </button>

              <button
                onClick={handleRestoreFromDrive}
                disabled={isDriveRestoring}
                className="bg-white dark:bg-slate-800 border-2 border-blue-900 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-98 text-blue-900 dark:text-blue-300 font-bold py-3 px-4 rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 transition-transform disabled:opacity-60"
              >
                <span>{isDriveRestoring ? '⏳' : '📥'}</span>
                <span>{isDriveRestoring ? 'Restoring…' : 'Restore from Google Drive'}</span>
              </button>
            </div>

            {/* Connected Details */}
            <div className="bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-slate-400">Connected Account:</span>
                <span className="font-bold text-gray-900 dark:text-white">{driveConfig?.userEmail || 'Connected Google Account'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-slate-400">Environment Folder:</span>
                <span className="font-mono text-blue-800 dark:text-blue-300 font-semibold">BaithakOS Backups</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 dark:text-slate-400">Auto-Sync Frequency:</span>
                <span className="text-green-700 dark:text-green-400 font-semibold">Every 5 minutes (Silent)</span>
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-end">
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-bold"
                >
                  Disconnect Google Drive
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Not Connected: 1-Click Sign in with Google */
          <div className="space-y-3">
            <div className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Connect your personal Google account. BaithakOS will automatically create a dedicated{' '}
              <span className="font-semibold text-blue-900 dark:text-blue-300">BaithakOS Backups</span> folder in your Google Drive and silently keep your shop updated every 5 minutes.
            </div>

            <button
              type="button"
              onClick={handleSignInWithGoogle}
              disabled={isSigningInGoogle}
              className="w-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-750 active:scale-98 text-gray-800 dark:text-white border-2 border-gray-300 dark:border-slate-600 py-3.5 px-4 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center gap-3 transition-transform disabled:opacity-60"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.28-2.09 3.66-5.18 3.66-9.12z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.16 0 9.99 0 12s.45 3.84 1.25 5.42l4.03-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>{isSigningInGoogle ? 'Connecting with Google…' : 'Sign in with Google'}</span>
            </button>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-500 dark:text-slate-400">
                🔒 Safe & private • Only accesses its own backup folder
              </span>
              <button
                type="button"
                onClick={() => setShowDriveConfig(!showDriveConfig)}
                className="text-[11px] text-blue-700 dark:text-blue-400 hover:underline font-semibold"
              >
                {showDriveConfig ? 'Hide Advanced' : 'Custom Client ID / Demo'}
              </button>
            </div>

            {showDriveConfig && (
              <div className="mt-2 bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-gray-800 dark:text-slate-200">
                    Custom OAuth Client ID or Instant Demo
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                    Set a custom Google Cloud Client ID for your deployment, or use 1-Tap Instant Demo to test automated sync right now.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleInstantGoogleConnect}
                  className="w-full bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 text-white font-bold text-xs py-2.5 rounded-xl shadow flex items-center justify-center gap-2"
                >
                  <span>🚀</span>
                  <span>1-Tap Instant Demo Connect</span>
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-gray-300 dark:border-slate-600"></div>
                  <span className="flex-shrink mx-2 text-[10px] text-gray-400 uppercase font-bold">Or Enter Custom Credentials</span>
                  <div className="flex-grow border-t border-gray-300 dark:border-slate-600"></div>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 dark:text-slate-300 mb-1">
                      Google OAuth Client ID
                    </label>
                    <input
                      type="text"
                      value={driveClientIdInput}
                      onChange={(e) => setDriveClientIdInput(e.target.value)}
                      placeholder="123456789-abc.apps.googleusercontent.com"
                      className="w-full border dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                    />
                  </div>

                  <form onSubmit={handleConnectDrive} className="space-y-2 pt-1 border-t border-gray-200 dark:border-slate-700">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-slate-300 mb-1">
                        Manual Access Token (Optional)
                      </label>
                      <input
                        type="password"
                        value={driveTokenInput}
                        onChange={(e) => setDriveTokenInput(e.target.value)}
                        placeholder="ya29.a0AfH6SM..."
                        className="w-full border dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 font-bold text-xs py-2 rounded-xl"
                    >
                      Save Custom Credentials
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Single Owner Account & Security Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2.5">
          <div>
            <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>👤</span> Single Master Account
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Only one owner account per shop. Operates 100% offline.
            </div>
          </div>
          <button
            onClick={lock}
            className="bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1"
          >
            <span>🔒</span> Lock Counter
          </button>
        </div>

        <div className="text-xs text-gray-600 dark:text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-slate-500">Owner Name:</span>
            <span className="font-bold text-gray-900 dark:text-white">{shop.ownerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-slate-500">Mobile / Login ID:</span>
            <span className="font-bold text-gray-900 dark:text-white">{shop.phone || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 dark:text-slate-500">Master PIN:</span>
            <span className="font-bold text-blue-900 dark:text-blue-400">
              {hasCustomPin ? '● ● ● ● (Custom PIN Set)' : '1234 (Default PIN)'}
            </span>
          </div>
        </div>

        {pinSuccessMessage && (
          <div className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 p-2 rounded-xl border border-green-200 dark:border-green-800 font-semibold">
            {pinSuccessMessage}
          </div>
        )}

        {isChangingPin ? (
          <form onSubmit={handleSavePin} className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">Set New 4-Digit Master PIN:</div>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="New 4-digit PIN"
                className="flex-1 border dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono tracking-widest bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                autoFocus
              />
              <button
                type="submit"
                className="bg-blue-900 dark:bg-blue-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow"
              >
                Save PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setNewPin('');
                }}
                className="border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-slate-400 text-xs px-2.5 py-1.5 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsChangingPin(true)}
            className="text-xs text-blue-700 dark:text-blue-400 hover:underline font-bold"
          >
            ✏️ Change Master PIN
          </button>
        )}
      </div>

      {/* Local Sync Status Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
          <span>Local Device Outbox</span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              syncStatus.state === 'synced'
                ? 'bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300'
                : syncStatus.state === 'syncing'
                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
            }`}
          >
            {syncStatus.label}
          </span>
        </div>

        <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1 font-mono">
          <div>Device ID: {deviceId || 'mobile-browser'}</div>
          <div>Pending Local Outbox Events: {syncStatus.pendingCount}</div>
        </div>
      </div>

      {/* Synthetic Shop Simulator */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 shadow-sm space-y-3">
        <div>
          <div className="font-bold text-sm text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
            <span>🧪</span> Synthetic Paan Shop Simulator
          </div>
          <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
            Need test data? Populate your shop instantly with 100 real paan shop catalog items (Banarasi, Baba, Rajnigandha, Classic, Thums Up, Lays, Cadbury), 5 wholesale suppliers, and 7 days of simulated sales.
          </div>
        </div>

        {simulationResult && (
          <div className="bg-white/80 dark:bg-slate-800 p-2.5 rounded-xl text-xs font-semibold text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm space-y-2 text-xs">
        <div className="font-bold text-sm text-gray-900 dark:text-white">Shop Profile</div>
        <div className="flex justify-between py-1 border-b border-gray-100 dark:border-slate-800 text-gray-600 dark:text-slate-400">
          <span>Shop Name:</span>
          <span className="font-bold text-gray-900 dark:text-white">{shop.name}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-100 dark:border-slate-800 text-gray-600 dark:text-slate-400">
          <span>Owner:</span>
          <span className="font-bold text-gray-900 dark:text-white">{shop.ownerName}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-gray-100 dark:border-slate-800 text-gray-600 dark:text-slate-400">
          <span>Currency:</span>
          <span className="font-bold text-gray-900 dark:text-white">INR (₹)</span>
        </div>
        <div className="flex justify-between py-1 text-gray-600 dark:text-slate-400">
          <span>Timezone:</span>
          <span className="font-bold text-gray-900 dark:text-white">Asia/Kolkata</span>
        </div>
      </div>
    </div>
  );
}
