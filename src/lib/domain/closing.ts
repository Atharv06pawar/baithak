/**
 * BaithakOS — Daily Closing Domain Service
 *
 * Workflow for end-of-day verification and closing summary.
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { generateCashReconciliation, type CashReconciliationReport } from '@/lib/domain/reconciliation';
import type { DailySummary, UUID } from '@/lib/types';

export interface DayOverview {
  dateStr: string;
  totalSales: number;
  totalTransactions: number;
  cashSales: number;
  upiSales: number;
  udhaarSales: number;
  totalExpenses: number;
  totalRefunds: number;
  udhaarCollected: number;
  estimatedGrossProfit: number;
  reconciliation: CashReconciliationReport;
  summaryRecord?: DailySummary;
}

export async function getDayOverview(
  shopId: UUID,
  declaredCashPaise: number = 0,
  targetDate: Date = new Date()
): Promise<DayOverview> {
  const db = getDB();

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  const startTs = startOfDay.getTime();
  const endTs = endOfDay.getTime();
  const dateStr = startOfDay.toISOString().split('T')[0];

  const reconciliation = await generateCashReconciliation(shopId, declaredCashPaise, targetDate);

  // Completed sales
  const allSales = await db.sales.where('shopId').equals(shopId).toArray();
  const daySales = allSales.filter((s) => s.createdAt >= startTs && s.createdAt <= endTs);
  const completedSales = daySales.filter((s) => s.status === 'completed');

  let totalSales = 0;
  let cashSales = 0;
  let upiSales = 0;
  let udhaarSales = 0;

  for (const s of completedSales) {
    totalSales += s.total;
    if (s.paymentMethod === 'cash') cashSales += s.total;
    else if (s.paymentMethod === 'upi') upiSales += s.total;
    else if (s.paymentMethod === 'udhaar') udhaarSales += s.total;
  }

  // Cost of goods sold & gross profit calculation
  const saleIds = completedSales.map((s) => s.id);
  const allSaleItems = await db.sale_items.where('shopId').equals(shopId).toArray();
  const daySaleItems = allSaleItems.filter((i) => saleIds.includes(i.saleId));

  const allProducts = await db.products.where('shopId').equals(shopId).toArray();
  const productCostMap = new Map<string, number>();
  for (const p of allProducts) {
    productCostMap.set(p.id, p.purchasePrice || 0);
  }

  let totalCogs = 0;
  for (const item of daySaleItems) {
    const cost = productCostMap.get(item.productId) || 0;
    totalCogs += cost * item.quantity;
  }

  const estimatedGrossProfit = Math.max(0, totalSales - totalCogs);

  const summaryId = `${shopId}_${dateStr}`;
  const existingSummary = await db.daily_summaries.get(summaryId);

  return {
    dateStr,
    totalSales,
    totalTransactions: completedSales.length,
    cashSales,
    upiSales,
    udhaarSales,
    totalExpenses: reconciliation.cashExpenses,
    totalRefunds: reconciliation.cashRefunds,
    udhaarCollected: reconciliation.cashUdhaarCollected,
    estimatedGrossProfit,
    reconciliation,
    summaryRecord: existingSummary,
  };
}

export async function closeDay(
  shopId: UUID,
  declaredCashPaise: number,
  closedBy?: string,
  targetDate: Date = new Date()
): Promise<DailySummary> {
  const overview = await getDayOverview(shopId, declaredCashPaise, targetDate);
  const db = getDB();
  const now = Date.now();
  const summaryId = `${shopId}_${overview.dateStr}`;

  const summary: DailySummary = {
    id: summaryId,
    shopId,
    dateStr: overview.dateStr,
    openingCash: overview.reconciliation.openingCash,
    closingCash: declaredCashPaise,
    expectedCash: overview.reconciliation.expectedCash,
    cashDifference: overview.reconciliation.difference,
    totalSales: overview.totalSales,
    totalTransactions: overview.totalTransactions,
    cashSales: overview.cashSales,
    upiSales: overview.upiSales,
    udhaarAdded: overview.udhaarSales,
    udhaarCollected: overview.udhaarCollected,
    totalExpenses: overview.totalExpenses,
    totalRefunds: overview.totalRefunds,
    grossProfit: overview.estimatedGrossProfit,
    status: 'closed',
    closedAt: now,
    closedBy,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.daily_summaries, db.sync_outbox, db.audit_logs], async () => {
    await db.daily_summaries.put(summary);

    await appendToOutbox({
      db,
      shopId,
      entityType: 'daily_summary',
      entityId: summary.id,
      operation: 'create',
      payload: { summary },
    });

    await db.audit_logs.add({
      id: crypto.randomUUID(),
      shopId,
      deviceId: getDeviceId(),
      entityType: 'daily_summary',
      entityId: summary.id,
      operation: 'create',
      payload: {
        dateStr: overview.dateStr,
        totalSales: overview.totalSales,
        difference: overview.reconciliation.difference,
      },
      createdAt: now,
    });
  });

  return summary;
}
