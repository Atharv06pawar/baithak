'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSales, getSaleWithItems, reverseSale } from '@/lib/domain/sale';
import { formatMoney } from '@/lib/money';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { Sale, SaleItem, UUID } from '@/lib/types';

export default function SaleHistory({ shopId }: { shopId: UUID }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [showReversalPrompt, setShowReversalPrompt] = useState(false);

  // Close reversal prompt or selected sale view on mobile back button
  useMobileBackHandler(
    !!selected,
    () => {
      if (showReversalPrompt) {
        setShowReversalPrompt(false);
      } else {
        setSelected(null);
      }
    },
    'sale_detail'
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSales(shopId, { limit: 50 });
      setSales(s);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openSale(saleId: UUID) {
    const result = await getSaleWithItems(saleId);
    if (result) setSelected(result);
  }

  async function handleReversal() {
    if (!selected || !reversalReason.trim()) return;
    setReversing(true);
    try {
      await reverseSale(selected.sale.id, shopId, reversalReason.trim());
      setSelected(null);
      setShowReversalPrompt(false);
      setReversalReason('');
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reversal failed';
      alert(msg);
    } finally {
      setReversing(false);
    }
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400 dark:text-slate-500">Loading sales…</div>;
  }

  // Detail view
  if (selected) {
    const { sale, items } = selected;
    const isReversed = sale.status === 'reversed';

    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900">
        <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center gap-3">
          <button
            onClick={() => { setSelected(null); setShowReversalPrompt(false); }}
            className="text-blue-700 dark:text-blue-400 font-medium text-sm"
          >
            ← Back
          </button>
          <div className="font-semibold text-gray-900 dark:text-white">Sale #{sale.saleNumber}</div>
          {isReversed && (
            <span className="ml-auto text-xs bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
              Reversed
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-gray-50 dark:bg-slate-800 rounded-2xl p-4 space-y-2 border border-transparent dark:border-slate-700">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">Date & Time</span>
              <span className="font-medium text-gray-900 dark:text-white">{formatDate(sale.createdAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">Payment</span>
              <span className="font-medium capitalize text-gray-900 dark:text-white">{sale.paymentMethod}</span>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Items</div>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{item.productName}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </div>
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white">{formatMoney(item.lineTotal)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-slate-800 pt-4 space-y-2">
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Discount</span>
                <span className="text-red-600 dark:text-red-400">−{formatMoney(sale.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white">
              <span>Total</span>
              <span>{formatMoney(sale.total)}</span>
            </div>
            {sale.cashReceived && (
              <>
                <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400">
                  <span>Cash Received</span>
                  <span className="text-gray-800 dark:text-slate-200">{formatMoney(sale.cashReceived)}</span>
                </div>
                {(sale.changeGiven ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium">
                    <span>Change Given</span>
                    <span>{formatMoney(sale.changeGiven!)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {isReversed && sale.reversalReason && (
            <div className="bg-red-50 dark:bg-red-950/40 rounded-xl p-3 text-sm text-red-700 dark:text-red-300 border border-transparent dark:border-red-900">
              <span className="font-medium">Reversed: </span>{sale.reversalReason}
            </div>
          )}

          {/* Reversal */}
          {!isReversed && !showReversalPrompt && (
            <button
              onClick={() => setShowReversalPrompt(true)}
              className="w-full border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-medium py-3 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              Reverse this sale
            </button>
          )}

          {showReversalPrompt && !isReversed && (
            <div className="bg-red-50 dark:bg-red-950/40 rounded-2xl p-4 space-y-3 border border-transparent dark:border-red-900">
              <div className="text-sm font-semibold text-red-800 dark:text-red-300">
                Reverse sale of {formatMoney(sale.total)}?
              </div>
              <div className="text-xs text-red-600 dark:text-red-400">
                This will restore stock for all items. This cannot be undone.
              </div>
              <input
                type="text"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Reason (required)"
                className="w-full border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowReversalPrompt(false); setReversalReason(''); }}
                  className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 font-medium py-2 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReversal}
                  disabled={!reversalReason.trim() || reversing}
                  className="flex-1 bg-red-600 text-white font-bold py-2 rounded-xl text-sm disabled:opacity-60"
                >
                  {reversing ? 'Reversing…' : 'Yes, reverse'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950">
      <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="font-semibold text-gray-900 dark:text-white">Recent Sales</div>
        <div className="text-sm text-gray-500 dark:text-slate-400">{sales.length} sales shown</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sales.length === 0 && (
          <div className="text-center text-gray-400 dark:text-slate-500 mt-16">
            <div className="text-4xl mb-3">🛒</div>
            <div>No sales yet</div>
            <div className="text-sm">Complete your first sale from the POS tab</div>
          </div>
        )}
        {sales.map((sale) => (
          <button
            key={sale.id}
            onClick={() => openSale(sale.id)}
            className="w-full bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 active:bg-gray-100 dark:active:bg-slate-800 text-left"
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                sale.status === 'reversed' ? 'bg-red-400' : 'bg-green-400'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-white text-sm">
                Sale #{sale.saleNumber}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">
                {formatDate(sale.createdAt)} · {sale.paymentMethod}
              </div>
            </div>
            <div className={`font-bold text-base ${sale.status === 'reversed' ? 'text-gray-400 dark:text-slate-600 line-through' : 'text-gray-900 dark:text-white'}`}>
              {formatMoney(sale.total)}
            </div>
            <div className="text-gray-300 dark:text-slate-600">›</div>
          </button>
        ))}
      </div>
    </div>
  );
}
