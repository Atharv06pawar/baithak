'use client';

import React, { useState } from 'react';
import { useShop } from '@/contexts/ShopContext';
import type { Shop } from '@/lib/types';

export default function LockScreen({ shop }: { shop: Shop }) {
  const { unlock, hasCustomPin } = useShop();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleDigitClick(digit: string) {
    if (pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);
    setErrorMessage('');

    // If 4 digits entered, auto-verify
    if (newPin.length === 4) {
      await verify(newPin);
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
    setErrorMessage('');
  }

  async function verify(pinToVerify: string) {
    setIsVerifying(true);
    try {
      const ok = await unlock(pinToVerify);
      if (!ok) {
        setError(true);
        setErrorMessage('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      setError(true);
      setErrorMessage('Verification failed.');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-between min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-indigo-950 text-white p-6 select-none">
      {/* Top Shop Info */}
      <div className="text-center pt-8 space-y-1">
        <div className="text-3xl font-black tracking-wider text-blue-200">बैठक</div>
        <div className="text-2xl font-black text-white">{shop.name}</div>
        <div className="text-xs text-blue-300 font-medium">
          👤 Owner: <span className="text-white font-bold">{shop.ownerName}</span>
          {shop.phone && ` • ${shop.phone}`}
        </div>
      </div>

      {/* Middle PIN Indicators */}
      <div className="flex flex-col items-center space-y-4 my-auto">
        <div className="text-sm font-semibold text-blue-200">
          Enter Master PIN to Unlock Counter
        </div>

        {/* 4 PIN Dots */}
        <div className="flex gap-4 my-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                pin.length > i
                  ? 'bg-green-400 scale-125 shadow-lg shadow-green-400/50'
                  : 'bg-white/20 border border-white/40'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="text-xs font-bold text-red-300 bg-red-950/60 px-3 py-1.5 rounded-xl border border-red-800 animate-bounce">
            {errorMessage}
          </div>
        )}

        {!hasCustomPin && (
          <div className="text-[11px] text-blue-300/80 bg-white/10 px-3 py-1 rounded-full">
            💡 Default Master PIN: <span className="font-bold text-white">1234</span>
          </div>
        )}
      </div>

      {/* Bottom Keypad (Large 0-9 touch buttons) */}
      <div className="w-full max-w-xs space-y-3 pb-8">
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigitClick(digit)}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-2xl font-bold text-white shadow-sm transition-all active:scale-95 flex items-center justify-center border border-white/10"
            >
              {digit}
            </button>
          ))}

          {/* Clear */}
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 text-xs font-bold text-gray-300 transition-all active:scale-95 flex items-center justify-center border border-white/5"
          >
            Clear
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleDigitClick('0')}
            className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-2xl font-bold text-white shadow-sm transition-all active:scale-95 flex items-center justify-center border border-white/10"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-lg font-bold text-white shadow-sm transition-all active:scale-95 flex items-center justify-center border border-white/10"
            title="Delete"
          >
            ⌫
          </button>
        </div>

        {pin.length > 0 && (
          <button
            onClick={() => verify(pin)}
            disabled={isVerifying}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-black py-3.5 rounded-2xl text-base shadow-lg transition-transform active:scale-98"
          >
            {isVerifying ? 'Checking…' : 'Unlock Counter →'}
          </button>
        )}
      </div>
    </div>
  );
}
