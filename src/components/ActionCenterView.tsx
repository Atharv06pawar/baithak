'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  generateActionCenterAlerts,
  calculateReorderRecommendations,
  detectDeadStock,
  forecastTomorrowSales,
  type ActionAlert,
  type ReorderRecommendation,
  type DeadStockItem,
  type DailyForecast,
} from '@/lib/intelligence';
import { formatMoney } from '@/lib/money';
import type { UUID } from '@/lib/types';

export default function ActionCenterView({ shopId }: { shopId: UUID }) {
  const [alerts, setAlerts] = useState<ActionAlert[]>([]);
  const [reorders, setReorders] = useState<ReorderRecommendation[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [forecast, setForecast] = useState<DailyForecast | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [alts, reords, dead, fc] = await Promise.all([
        generateActionCenterAlerts(shopId),
        calculateReorderRecommendations(shopId),
        detectDeadStock(shopId),
        forecastTomorrowSales(shopId),
      ]);
      setAlerts(alts);
      setReorders(reords);
      setDeadStock(dead);
      setForecast(fc);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading intelligence engine…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto p-4 space-y-5">
      {/* Header */}
      <div>
        <div className="font-black text-xl text-gray-900">⚡ Action Center</div>
        <div className="text-xs text-gray-500">
          Prioritized, verifiable recommendations to prevent stockouts and loss of money.
        </div>
      </div>

      {/* Tomorrow's Forecast Card */}
      {forecast && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="uppercase tracking-wider font-semibold text-blue-200">
              Tomorrow's Sales Expectation
            </span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold">
              Confidence: {forecast.confidence}
            </span>
          </div>

          <div className="text-2xl font-black">
            {formatMoney(forecast.expectedSalesPaiseMin)} – {formatMoney(forecast.expectedSalesPaiseMax)}
          </div>
          <div className="text-xs text-blue-200">{forecast.basis}</div>
        </div>
      )}

      {/* Prioritized Alert Cards */}
      <div className="space-y-3">
        <div className="font-bold text-sm text-gray-800">Priority Alerts ({alerts.length})</div>
        {alerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-200 text-gray-500">
            <div className="text-3xl mb-1">🟢</div>
            <div className="font-bold text-sm text-gray-800">All Systems Normal</div>
            <div className="text-xs mt-1">No critical stockouts or dead inventory detected.</div>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-2xl p-4 border space-y-2 shadow-sm ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : alert.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : alert.severity === 'positive'
                  ? 'bg-green-50 border-green-200 text-green-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {alert.severity === 'critical'
                    ? '🔴'
                    : alert.severity === 'warning'
                    ? '🟠'
                    : alert.severity === 'positive'
                    ? '🟢'
                    : 'ℹ️'}
                </span>
                <span className="font-black text-sm">{alert.title}</span>
              </div>

              <div className="text-xs opacity-90">{alert.reason}</div>
              <div className="bg-white/60 p-2.5 rounded-xl text-xs font-mono">{alert.evidence}</div>
              <div className="text-xs font-bold pt-1">
                👉 Recommended Action: <span className="underline">{alert.recommendedAction}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Explainable Reorders Section */}
      <div className="space-y-3">
        <div className="font-bold text-sm text-gray-800">
          Reorder Recommendations ({reorders.length})
        </div>
        {reorders.length === 0 ? (
          <div className="bg-white p-4 rounded-xl border text-center text-xs text-gray-500">
            No items currently need reordering.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {reorders.map((r) => (
              <div key={r.productId} className="p-3.5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-gray-900">{r.productName}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                      r.urgency === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    Order {r.recommendedOrderQuantity} units
                  </span>
                </div>
                <div className="text-xs text-gray-500 leading-relaxed font-mono bg-gray-50 p-2 rounded-lg">
                  {r.explanation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dead Stock Section */}
      {deadStock.length > 0 && (
        <div className="space-y-3">
          <div className="font-bold text-sm text-gray-800">
            Dead Stock Overview ({deadStock.length} items)
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {deadStock.slice(0, 5).map((d) => (
              <div key={d.productId} className="p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold text-gray-900">{d.productName}</div>
                  <div className="text-gray-400">0 sales in last 3 weeks</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-amber-800">{formatMoney(d.totalCapitalLocked)}</div>
                  <div className="text-gray-400">{d.stockQuantity} units locked</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
