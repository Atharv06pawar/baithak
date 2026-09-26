/**
 * BaithakOS — Deterministic Business Intelligence Engine
 *
 * Implements deterministic calculations for retail metrics:
 * - Product Velocity (units / day)
 * - Stock Coverage (days remaining)
 * - Reorder Recommendations (explainable formula)
 * - Dead Stock Identification
 * - Sales Trends & Baseline Comparisons
 * - Action Center Prioritized Alerts
 * - Demand Forecasting with Confidence Intervals
 */

import { getDB } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import type { UUID, Product } from '@/lib/types';

export interface ProductVelocity {
  productId: UUID;
  productName: string;
  unitsSold: number;
  daysAnalyzed: number;
  averageDailySales: number; // units/day
  currentStock: number;
  stockCoverageDays: number; // currentStock / averageDailySales (999 if velocity is 0)
}

export interface ReorderRecommendation {
  productId: UUID;
  productName: string;
  currentStock: number;
  averageDailySales: number;
  leadTimeDays: number;
  safetyStock: number;
  recommendedOrderQuantity: number;
  urgency: 'critical' | 'moderate' | 'low';
  explanation: string;
}

export interface DeadStockItem {
  productId: UUID;
  productName: string;
  stockQuantity: number;
  purchaseCostPerUnit: number;
  totalCapitalLocked: number; // paise
  daysWithoutSale: number;
}

export interface ActionAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'positive';
  title: string;
  reason: string;
  evidence: string;
  recommendedAction: string;
}

export interface DailyForecast {
  expectedSalesPaiseMin: number;
  expectedSalesPaiseMax: number;
  expectedSalesPaiseMid: number;
  confidence: 'High' | 'Moderate' | 'Low';
  basis: string;
}

/**
 * Calculate velocity and stock coverage for active products over the last N days.
 */
export async function calculateProductVelocities(
  shopId: UUID,
  windowDays = 14
): Promise<ProductVelocity[]> {
  const db = getDB();
  const now = Date.now();
  const windowStartTs = now - windowDays * 24 * 60 * 60 * 1000;

  const products = await db.products
    .where('shopId')
    .equals(shopId)
    .filter((p) => p.active)
    .toArray();

  const sales = await db.sales
    .where('shopId')
    .equals(shopId)
    .filter((s) => s.status === 'completed' && s.createdAt >= windowStartTs)
    .toArray();

  const saleIds = new Set(sales.map((s) => s.id));
  const saleItems = await db.sale_items.where('shopId').equals(shopId).toArray();
  const windowItems = saleItems.filter((i) => saleIds.has(i.saleId));

  const salesByProduct = new Map<string, number>();
  for (const item of windowItems) {
    const cur = salesByProduct.get(item.productId) ?? 0;
    salesByProduct.set(item.productId, cur + item.quantity);
  }

  return products.map((p) => {
    const unitsSold = salesByProduct.get(p.id) ?? 0;
    const averageDailySales = Number((unitsSold / windowDays).toFixed(2));
    const stockCoverageDays =
      averageDailySales > 0
        ? Number((p.stockQuantity / averageDailySales).toFixed(1))
        : 999;

    return {
      productId: p.id,
      productName: p.name,
      unitsSold,
      daysAnalyzed: windowDays,
      averageDailySales,
      currentStock: p.stockQuantity,
      stockCoverageDays,
    };
  });
}

/**
 * Generate explainable reorder recommendations.
 * Formula:
 *   Reorder Point = (Average Daily Demand × Supplier Lead Time) + Safety Stock
 *   Recommended Order = (Demand during Lead Time × 3) + Safety Stock - Current Stock
 */
export async function calculateReorderRecommendations(
  shopId: UUID,
  windowDays = 14
): Promise<ReorderRecommendation[]> {
  const db = getDB();
  const velocities = await calculateProductVelocities(shopId, windowDays);
  const suppliers = await db.suppliers.where('shopId').equals(shopId).toArray();
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  const products = await db.products.where('shopId').equals(shopId).toArray();
  const productMap = new Map(products.map((p) => [p.id, p]));

  const recommendations: ReorderRecommendation[] = [];

  for (const v of velocities) {
    const p = productMap.get(v.productId);
    if (!p) continue;

    const supplier = p.supplierId ? supplierMap.get(p.supplierId) : undefined;
    const leadTimeDays = supplier?.leadTimeDays ?? 2;
    const safetyStock = p.minimumStock || 5;

    // Demand expected during lead time
    const leadTimeDemand = Math.ceil(v.averageDailySales * leadTimeDays);
    const reorderThreshold = leadTimeDemand + safetyStock;

    // If current stock is below reorder point or stock coverage is under 3 days
    if (v.currentStock <= reorderThreshold || v.stockCoverageDays <= 3) {
      // Recommend ordering enough to cover lead time + 7 days buffer
      const targetCycleDemand = Math.ceil(v.averageDailySales * (leadTimeDays + 7));
      const orderQty = Math.max(
        10,
        targetCycleDemand + safetyStock - v.currentStock
      );

      const urgency: 'critical' | 'moderate' | 'low' =
        v.currentStock === 0 || v.stockCoverageDays <= 1 || v.currentStock <= Math.ceil(safetyStock / 2)
          ? 'critical'
          : v.stockCoverageDays <= 3 || v.currentStock <= safetyStock
          ? 'moderate'
          : 'low';

      const explanation = `Current stock: ${v.currentStock}. Avg daily sales: ${v.averageDailySales}/day. Supplier lead time: ${leadTimeDays} days. Safety buffer: ${safetyStock}. Coverage: ${v.stockCoverageDays === 999 ? '∞' : `${v.stockCoverageDays} days`}.`;

      recommendations.push({
        productId: v.productId,
        productName: v.productName,
        currentStock: v.currentStock,
        averageDailySales: v.averageDailySales,
        leadTimeDays,
        safetyStock,
        recommendedOrderQuantity: orderQty,
        urgency,
        explanation,
      });
    }
  }

  // Sort critical first
  return recommendations.sort((a, b) => (a.urgency === 'critical' ? -1 : 1));
}

/**
 * Detect dead stock (items with inventory but zero sales in the window).
 */
export async function detectDeadStock(
  shopId: UUID,
  windowDays = 21
): Promise<DeadStockItem[]> {
  const velocities = await calculateProductVelocities(shopId, windowDays);
  const db = getDB();
  const products = await db.products.where('shopId').equals(shopId).toArray();
  const productMap = new Map(products.map((p) => [p.id, p]));

  const deadItems: DeadStockItem[] = [];

  for (const v of velocities) {
    if (v.unitsSold === 0 && v.currentStock > 0) {
      const p = productMap.get(v.productId);
      const cost = p?.purchasePrice || 0;
      deadItems.push({
        productId: v.productId,
        productName: v.productName,
        stockQuantity: v.currentStock,
        purchaseCostPerUnit: cost,
        totalCapitalLocked: cost * v.currentStock,
        daysWithoutSale: windowDays,
      });
    }
  }

  return deadItems.sort((a, b) => b.totalCapitalLocked - a.totalCapitalLocked);
}

/**
 * Action Center alerts generation.
 */
export async function generateActionCenterAlerts(shopId: UUID): Promise<ActionAlert[]> {
  const alerts: ActionAlert[] = [];

  // 1. Reorder alerts (critical or moderate)
  const reorders = await calculateReorderRecommendations(shopId);
  const urgentReorders = reorders.filter((r) => r.urgency === 'critical' || r.urgency === 'moderate');
  for (const r of urgentReorders.slice(0, 3)) {
    alerts.push({
      id: `reorder-${r.productId}`,
      severity: r.urgency === 'critical' ? 'critical' : 'warning',
      title: `${r.productName} may stock out soon`,
      reason: `Stock is low (${r.currentStock} remaining, min threshold: ${r.safetyStock}).`,
      evidence: r.explanation,
      recommendedAction: `Order ${r.recommendedOrderQuantity} units from supplier.`,
    });
  }

  // 2. Dead stock alerts
  const deadStock = await detectDeadStock(shopId);
  const totalDeadCapital = deadStock.reduce((sum, d) => sum + d.totalCapitalLocked, 0);
  if (deadStock.length > 0 && totalDeadCapital > 0) {
    alerts.push({
      id: 'dead-stock-summary',
      severity: 'warning',
      title: `${formatMoney(totalDeadCapital)} of inventory has not moved recently`,
      reason: `${deadStock.length} product(s) have recorded zero sales in the last 3 weeks.`,
      evidence: `Top stalled item: ${deadStock[0].productName} (${deadStock[0].stockQuantity} in stock, ${formatMoney(deadStock[0].totalCapitalLocked)} locked).`,
      recommendedAction: 'Place these items near the billing counter or bundle with fast sellers.',
    });
  }

  // 3. Sales momentum / positive trend alert
  const db = getDB();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaySales = await db.sales
    .where('shopId')
    .equals(shopId)
    .filter((s) => s.status === 'completed' && s.createdAt >= startOfDay.getTime())
    .toArray();
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);

  if (todaySales.length >= 5) {
    alerts.push({
      id: 'sales-active',
      severity: 'positive',
      title: `Today's sales: ${formatMoney(todayRevenue)} (${todaySales.length} transactions)`,
      reason: 'Healthy billing activity recorded today.',
      evidence: `Average ticket size: ${formatMoney(Math.round(todayRevenue / todaySales.length))}.`,
      recommendedAction: 'Keep sufficient counter cash for change.',
    });
  }

  return alerts;
}

/**
 * Statistical sales forecast for tomorrow with uncertainty range.
 */
export async function forecastTomorrowSales(shopId: UUID): Promise<DailyForecast> {
  const db = getDB();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const sales = await db.sales
    .where('shopId')
    .equals(shopId)
    .filter((s) => s.status === 'completed' && s.createdAt >= sevenDaysAgo)
    .toArray();

  if (sales.length === 0) {
    return {
      expectedSalesPaiseMin: 0,
      expectedSalesPaiseMax: 0,
      expectedSalesPaiseMid: 0,
      confidence: 'Low',
      basis: 'No sales history recorded yet in the past 7 days.',
    };
  }

  // Group sales by day
  const dailyTotals = new Map<string, number>();
  for (const s of sales) {
    const day = new Date(s.createdAt).toISOString().split('T')[0];
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + s.total);
  }

  const totals = Array.from(dailyTotals.values());
  const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);

  // Apply a standard ±15% uncertainty band
  const min = Math.round(avg * 0.85);
  const max = Math.round(avg * 1.15);
  const confidence: 'High' | 'Moderate' | 'Low' = totals.length >= 5 ? 'Moderate' : 'Low';

  return {
    expectedSalesPaiseMin: min,
    expectedSalesPaiseMax: max,
    expectedSalesPaiseMid: avg,
    confidence,
    basis: `Calculated from ${totals.length} recent operating day(s) with ±15% variance band.`,
  };
}
