'use client';

import React, { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected runtime errors for counter diagnosis
    console.error('BaithakOS runtime error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 select-none">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black">
          ⚠️
        </div>

        <div>
          <h2 className="text-xl font-black text-white tracking-wide">
            Counter Session Interrupted
          </h2>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            A temporary display error occurred. <strong>Your shop data is 100% safe</strong> — all sales, inventory counts, and customer khata records are securely preserved in your offline database.
          </p>
        </div>

        {error.message && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
              Error Details:
            </span>
            <code className="text-xs text-rose-300 font-mono break-all line-clamp-3">
              {error.message}
            </code>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-3.5 px-4 rounded-xl text-xs shadow-lg transition-transform"
          >
            🔄 Resume Counter
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold py-3.5 px-4 rounded-xl text-xs shadow transition-transform"
          >
            ⚡ Hard Reload
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Need assistance? Your database remains available offline at all times.
        </p>
      </div>
    </div>
  );
}
