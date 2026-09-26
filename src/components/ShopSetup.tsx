'use client';

import React, { useState } from 'react';
import { createShop } from '@/lib/domain/shop';
import { useShop } from '@/contexts/ShopContext';

type Step = 'welcome' | 'form' | 'done';

export default function ShopSetup() {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { refreshShop } = useShop();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your shop name.'); return; }
    if (!ownerName.trim()) { setError('Please enter your name.'); return; }

    setSaving(true);
    try {
      await createShop({ name: name.trim(), ownerName: ownerName.trim(), phone: phone.trim() });
      setStep('done');
      setTimeout(() => refreshShop(), 800);
    } catch (err) {
      setError('Could not save your shop. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-blue-900 text-white px-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-6xl font-bold mb-2">बैठक</div>
          <div className="text-blue-200 text-lg mb-8">Your shop's digital assistant</div>
          <div className="space-y-3 text-left mb-10">
            {[
              '✓ Sell products in 2 seconds',
              '✓ Stock updates automatically',
              '✓ Works offline, always',
              '✓ Free, forever',
            ].map((f) => (
              <div key={f} className="text-blue-100 text-base">{f}</div>
            ))}
          </div>
          <button
            onClick={() => setStep('form')}
            className="w-full bg-white text-blue-900 font-bold py-4 rounded-2xl text-lg shadow-lg hover:bg-blue-50 active:scale-95 transition-transform"
          >
            Set up my shop →
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-green-50">
        <div className="text-center">
          <div className="text-6xl mb-4">✓</div>
          <div className="text-2xl font-bold text-green-800">Shop created!</div>
          <div className="text-green-600 mt-2">Opening your dashboard…</div>
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
        <div className="text-gray-500 text-sm mb-8">You can change this later in Settings.</div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
