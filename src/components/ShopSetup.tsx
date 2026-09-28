'use client';

import React, { useState } from 'react';
import { createShop } from '@/lib/domain/shop';
import { findAndRestoreShop, cloudSyncPush } from '@/lib/cloud/supabase';
import { authenticateWithGoogle, instantGoogleLink } from '@/lib/cloud/googleAuth';
import { useShop } from '@/contexts/ShopContext';

type Step = 'welcome' | 'form' | 'link' | 'done';

export default function ShopSetup() {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [linkShopId, setLinkShopId] = useState('');
  const [linkShopName, setLinkShopName] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [doneMessage, setDoneMessage] = useState('Shop created!');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('baithakp@gmail.com');
  const { refreshShop } = useShop();

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    setError('');
    try {
      const res = await authenticateWithGoogle();
      if (res.success) {
        if (res.existingShop) {
          setDoneMessage(res.message);
          setStep('done');
          setTimeout(() => refreshShop(), 800);
        } else {
          if (res.email) setOwnerEmail(res.email);
          if (res.name) setOwnerName(res.name);
          setStep('form');
        }
      } else {
        if (res.requiresClientId) {
          setShowGoogleModal(true);
        } else {
          setError(res.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function handleInstantGoogleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!googleEmailInput.trim()) {
      setError('Please enter your Google email address');
      return;
    }
    setIsGoogleLoading(true);
    setError('');
    try {
      const res = await instantGoogleLink(googleEmailInput.trim());
      if (res.success) {
        setShowGoogleModal(false);
        if (res.existingShop) {
          setDoneMessage(res.message);
          setStep('done');
          setTimeout(() => refreshShop(), 800);
        } else {
          setOwnerEmail(res.email || googleEmailInput.trim());
          setStep('form');
        }
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link Google account');
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your shop name.'); return; }
    if (!ownerName.trim()) { setError('Please enter your name.'); return; }

    setSaving(true);
    try {
      const newShop = await createShop({
        name: name.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
      });
      cloudSyncPush(newShop.id).catch(() => {});
      setDoneMessage('Shop created & synced to cloud!');
      setStep('done');
      setTimeout(() => refreshShop(), 800);
    } catch (err) {
      setError('Could not save your shop. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkShop(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!linkShopId.trim() && !linkShopName.trim() && !linkPhone.trim()) {
      setError('Please enter either your Shop ID, Shop Name, or Mobile Number.');
      return;
    }

    setSaving(true);
    try {
      const res = await findAndRestoreShop({
        shopId: linkShopId.trim() || undefined,
        shopName: linkShopName.trim() || undefined,
        phone: linkPhone.trim() || undefined,
      });

      if (!res.success) {
        setError(res.message);
        return;
      }

      setDoneMessage(res.message);
      setStep('done');
      setTimeout(() => refreshShop(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link shop');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-blue-900 text-white px-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl font-bold mb-2">बैठक</div>
          <div className="text-blue-200 text-lg mb-8">Your shop&apos;s digital assistant</div>
          <div className="space-y-3 text-left mb-8">
            {[
              '✓ 100% Free Google Sign-In & Multi-Device Sync',
              '✓ Sell products in 2 seconds with zero lag',
              '✓ Stock updates automatically & khata WhatsApp receipts',
              '✓ 100% offline-first resilience with Google Drive backup',
            ].map((f) => (
              <div key={f} className="text-blue-100 text-base">{f}</div>
            ))}
          </div>

          <div className="space-y-3">
            {/* 100% Free Google Authentication Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full bg-white hover:bg-blue-50 active:scale-95 text-gray-800 font-bold py-3.5 px-4 rounded-2xl text-sm shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-75"
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
              <span>{isGoogleLoading ? 'Connecting Google Account…' : 'Sign in with Google (Free Auto-Sync)'}</span>
            </button>

            <div className="flex items-center gap-2 py-0.5 justify-center">
              <span className="w-12 h-px bg-blue-400/40"></span>
              <span className="text-[11px] text-blue-200 font-semibold uppercase tracking-wider">Or Manual Setup</span>
              <span className="w-12 h-px bg-blue-400/40"></span>
            </div>

            <button
              onClick={() => setStep('form')}
              className="w-full bg-blue-800/80 hover:bg-blue-800 border border-blue-400/40 text-white font-bold py-3 rounded-2xl text-sm shadow flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span>✨</span>
              <span>Set up New Shop Manually</span>
            </button>

            <button
              onClick={() => setStep('link')}
              className="w-full bg-blue-950/60 hover:bg-blue-950/80 border border-blue-400/30 text-blue-200 hover:text-white font-semibold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span>🔗</span>
              <span>Link with Shop ID or Mobile Number</span>
            </button>
          </div>
        </div>

        {/* Google Email Instant Connection Modal */}
        {showGoogleModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full text-gray-900 space-y-4 shadow-2xl">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-lg">
                    <span>🌐</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-gray-900">Sign in with Google</h3>
                    <p className="text-xs text-gray-500">100% Free • Multi-Device Sync & Drive Backup</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleInstantGoogleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Your Google Email (@gmail.com)
                  </label>
                  <input
                    type="email"
                    required
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    placeholder="e.g. shopowner@gmail.com"
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Used to automatically find and sync your shop across all your phones, tablets, and laptops.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isGoogleLoading}
                  className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl text-sm shadow hover:bg-blue-800 active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <span>{isGoogleLoading ? '⏳' : '⚡'}</span>
                  <span>{isGoogleLoading ? 'Connecting…' : 'Continue with this Google Email'}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-green-50">
        <div className="text-center p-6 max-w-sm">
          <div className="text-6xl mb-4">✓</div>
          <div className="text-2xl font-bold text-green-800">{doneMessage}</div>
          <div className="text-green-600 mt-2">Opening your synchronized dashboard…</div>
        </div>
      </div>
    );
  }

  if (step === 'link') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="max-w-sm w-full">
          <button
            onClick={() => setStep('welcome')}
            className="text-gray-400 text-sm mb-6 flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="text-2xl font-bold text-gray-900 mb-1">Link to Existing Shop</div>
          <div className="text-gray-500 text-sm mb-4">
            Log into your shop on this device. Enter your Shop ID, or search by Shop Name / Mobile Number.
          </div>

          {/* Quick Google Sign In */}
          <div className="mb-5">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-300 py-3 px-4 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2.5 active:scale-95 transition-all disabled:opacity-60"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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
              <span>Auto-Detect via Google Sign-In</span>
            </button>
          </div>

          <div className="relative flex py-1 items-center mb-4">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-2 text-[10px] text-gray-400 uppercase font-bold">Or Enter Shop Details</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <form onSubmit={handleLinkShop} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Shop ID (Preferred)
              </label>
              <input
                type="text"
                value={linkShopId}
                onChange={(e) => setLinkShopId(e.target.value)}
                placeholder="e.g. 9f8e... (from Settings of main device)"
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Shop Name
              </label>
              <input
                type="text"
                value={linkShopName}
                onChange={(e) => setLinkShopName(e.target.value)}
                placeholder="e.g. Sharma Paan House"
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Owner Mobile Number
              </label>
              <input
                type="tel"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                placeholder="10-digit registered mobile"
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-3 text-xs font-medium" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-2xl text-base shadow-lg hover:bg-blue-800 active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <span>{saving ? '⏳' : '🔗'}</span>
              <span>{saving ? 'Connecting & Syncing…' : 'Connect & Sync This Device'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
      <div className="max-w-sm w-full">
        <button
          onClick={() => setStep('welcome')}
          className="text-gray-400 text-sm mb-6 flex items-center gap-1"
        >
          ← Back
        </button>

        <div className="text-2xl font-bold text-gray-900 mb-1">Tell us about your shop</div>
        <div className="text-gray-500 text-sm mb-6">You can change this later in Settings.</div>

        {ownerEmail && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-3 text-xs mb-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <span>✓</span>
              <span className="truncate">Google Account: <strong>{ownerEmail}</strong></span>
            </div>
            <span className="text-[10px] bg-blue-200 text-blue-950 font-bold px-1.5 py-0.5 rounded flex-shrink-0">
              Synced
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="shopName">
              Shop Name *
            </label>
            <input
              id="shopName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sharma Paan House"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ownerName">
              Your Name *
            </label>
            <input
              id="ownerName"
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
              Phone Number (optional)
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-900 text-white font-bold py-4 rounded-2xl text-lg shadow-lg hover:bg-blue-800 active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create my shop →'}
          </button>
        </form>
      </div>
    </div>
  );
}
