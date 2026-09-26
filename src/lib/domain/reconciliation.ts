/**
 * BaithakOS — Cash Reconciliation Domain Service
 *
 * Deterministic cash drawer reconciliation.
 * Core formula:
 *   Expected Cash = Opening Cash + Cash Sales - Cash Refunds - Cash Expenses + Cash Udhaar Collected
 *
 * If there is a discrepancy, possible causes are derived ONLY from actual recorded events.
 * Never invent a cause.
 */

import { getDB } from '@/lib/db';
import { getShopSettings } from '@/lib/domain/shop';
import { formatMoney } from '@/lib/money';
import type { UUID } from '@/lib/types';

export interface PossibleCause {
  type: 'expense' | 'refund' | 'upi_candidate' | 'cash_candidate' | 'udhaar' | 'opening_cash';
  description: string;
  amount: number; // paise
  referenceId?: string;
}

export interface CashReconciliationReport {
  dateStr: string;
  openingCash: number; // paise
  cashSales: number;   // paise
  cashRefunds: number; // paise
  cashExpenses: number;// paise
  cashUdhaarCollected: number; // paise
  expectedCash: number;// paise
  declaredCash: number;// paise
  difference: number;  // declaredCash - expectedCash (negative = deficit, positive = surplus)
  isBalanced: boolean;
  possibleCauses: PossibleCause[];
}

export async function generateCashReconciliation(
  shopId: UUID,
  declaredCashPaise: number,
  targetDate: Date = new Date()
): Promise<CashReconciliationReport> {
  const db = getDB();

  // Get day bounds (midnight to end-of-day in local time)
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  const startTs = startOfDay.getTime();
  const endTs = endOfDay.getTime();
  const dateStr = startOfDay.toISOString().split('T')[0];

  // 1. Opening Cash from settings or daily summary
  const settings = await getShopSettings(shopId);
  const openingCash = settings?.openingCash ?? 0;

  // 2. Completed Sales and Reversed Sales
  const allSales = await db.sales.where('shopId').equals(shopId).toArray();
  const daySales = allSales.filter((s) => s.createdAt >= startTs && s.createdAt <= endTs);

  let cashSales = 0;
  let cashRefunds = 0;

  for (const sale of daySales) {
    if (sale.status === 'completed' && sale.paymentMethod === 'cash') {
      cashSales += sale.total;
    } else if (sale.status === 'reversed' && sale.paymentMethod === 'cash') {
      cashRefunds += sale.total;
    }
  }

  // 3. Cash Expenses
  const allExpenses = await db.expenses.where('shopId').equals(shopId).toArray();
  const dayExpenses = allExpenses.filter(
    (e) => e.expenseDate >= startTs && e.expenseDate <= endTs && e.paymentMethod === 'cash'
  );
  const cashExpenses = dayExpenses.reduce((sum, e) => sum + e.amount, 0);

  // 4. Cash Udhaar Payments Collected
  const allLedger = await db.customer_ledger.where('shopId').equals(shopId).toArray();
  const dayPayments = allLedger.filter(
    (e) => e.createdAt >= startTs && e.createdAt <= endTs && e.type === 'payment'
  );
  // Payment amount is stored as negative in ledger, so Math.abs
  const cashUdhaarCollected = dayPayments.reduce((sum, e) => sum + Math.abs(e.amount), 0);

  // 5. Expected Cash Formula
  const expectedCash = openingCash + cashSales - cashRefunds - cashExpenses + cashUdhaarCollected;
  const difference = declaredCashPaise - expectedCash;
  const isBalanced = difference === 0;

  // 6. Inspect real events to discover evidence-backed possible causes
  const possibleCauses: PossibleCause[] = [];

  if (!isBalanced) {
    const absDiff = Math.abs(difference);

    // Cause A: Did an expense match or explain the deficit?
    for (const exp of dayExpenses) {
      if (exp.amount === absDiff) {
        possibleCauses.push({
          type: 'expense',
          description: `Exact match: Cash expense recorded for "${exp.category}" (${formatMoney(exp.amount)})`,
          amount: exp.amount,
          referenceId: exp.id,
        });
      } else if (exp.amount > 0) {
        possibleCauses.push({
          type: 'expense',
          description: `Recorded cash expense: ${exp.category} (${formatMoney(exp.amount)})`,
          amount: exp.amount,
          referenceId: exp.id,
        });
      }
    }

    // Cause B: Did a refund occur?
    const refundedSales = daySales.filter((s) => s.status === 'reversed' && s.paymentMethod === 'cash');
    for (const ref of refundedSales) {
      possibleCauses.push({
        type: 'refund',
        description: `Cash refund issued for Sale #${ref.saleNumber} (${formatMoney(ref.total)})${ref.reversalReason ? `: ${ref.reversalReason}` : ''}`,
        amount: ref.total,
        referenceId: ref.id,
      });
    }

    // Cause C: UPI vs Cash confusion: did any UPI transaction match the difference?
    const upiSales = daySales.filter((s) => s.status === 'completed' && s.paymentMethod === 'upi');
    for (const upi of upiSales) {
      if (upi.total === absDiff) {
        possibleCauses.push({
          type: 'upi_candidate',
          description: `Exact match: Sale #${upi.saleNumber} (${formatMoney(upi.total)}) recorded as UPI may have been received in cash`,
          amount: upi.total,
          referenceId: upi.id,
        });
      }
    }

    // Cause D: Udhaar collection check
    for (const pay of dayPayments) {
      const amt = Math.abs(pay.amount);
      if (amt === absDiff) {
        possibleCauses.push({
          type: 'udhaar',
          description: `Exact match: Customer udhaar payment received (${formatMoney(amt)})`,
          amount: amt,
          referenceId: pay.id,
        });
      }
    }

    // Cause E: Opening cash check
    if (openingCash === 0 && difference < 0) {
      possibleCauses.push({
        type: 'opening_cash',
        description: 'Opening cash was recorded as ₹0.00. Check if register started with drawer float.',
        amount: 0,
      });
    }
  }

  return {
    dateStr,
    openingCash,
    cashSales,
    cashRefunds,
    cashExpenses,
    cashUdhaarCollected,
    expectedCash,
    declaredCash: declaredCashPaise,
    difference,
    isBalanced,
    possibleCauses,
  };
}
