/**
 * BaithakOS — "Ask Baithak" AI Assistant Engine
 *
 * Sits strictly on top of verified business logic and deterministic analytics.
 * The assistant NEVER estimates or fabricates financial or inventory figures.
 * All figures cited come directly from deterministic domain services.
 */

import { getDayOverview } from '@/lib/domain/closing';
import { calculateReorderRecommendations, detectDeadStock, forecastTomorrowSales } from '@/lib/intelligence';
import { getCustomers } from '@/lib/domain/customer';
import { formatMoney } from '@/lib/money';
import type { UUID } from '@/lib/types';

export interface AssistantResponse {
  answer: string;
  citedMetrics: Array<{ label: string; value: string }>;
  suggestedFollowUps: string[];
}

export async function askBaithak(shopId: UUID, query: string): Promise<AssistantResponse> {
  const normalized = query.toLowerCase().trim();

  // 1. "How was business today?" / Sales / Revenue / Kamai
  if (
    normalized.includes('today') ||
    normalized.includes('business') ||
    normalized.includes('sale') ||
    normalized.includes('kamai') ||
    normalized.includes('revenue') ||
    normalized.includes('aaj')
  ) {
    const overview = await getDayOverview(shopId);
    if (overview.totalTransactions === 0) {
      return {
        answer: 'No completed sales have been recorded yet today.',
        citedMetrics: [
          { label: 'Today Sales', value: '₹0.00' },
          { label: 'Transactions', value: '0' },
        ],
        suggestedFollowUps: ['What should I order?', 'Who owes udhaar?'],
      };
    }

    const answer = `Today's revenue is ${formatMoney(overview.totalSales)} across ${overview.totalTransactions} transactions. Cash collected is ${formatMoney(overview.cashSales)}, and UPI is ${formatMoney(overview.upiSales)}. Estimated gross profit is ${formatMoney(overview.estimatedGrossProfit)}.`;

    return {
      answer,
      citedMetrics: [
        { label: 'Total Revenue', value: formatMoney(overview.totalSales) },
        { label: 'Transactions', value: String(overview.totalTransactions) },
        { label: 'Cash Sales', value: formatMoney(overview.cashSales) },
        { label: 'UPI Sales', value: formatMoney(overview.upiSales) },
        { label: 'Estimated Profit', value: formatMoney(overview.estimatedGrossProfit) },
      ],
      suggestedFollowUps: ['What should I order?', 'Show dead stock', 'Check cash status'],
    };
  }

  // 2. "What should I order?" / Reorder / Stockout / Khareedi
  if (
    normalized.includes('order') ||
    normalized.includes('reorder') ||
    normalized.includes('kya mangwana') ||
    normalized.includes('stockout') ||
    normalized.includes('low stock') ||
    normalized.includes('supplier')
  ) {
    const reorders = await calculateReorderRecommendations(shopId);

    if (reorders.length === 0) {
      return {
        answer: 'All products currently have sufficient stock based on recent sales demand.',
        citedMetrics: [{ label: 'Items to Reorder', value: '0' }],
        suggestedFollowUps: ['How was business today?', 'Show dead stock'],
      };
    }

    const itemsSummary = reorders
      .slice(0, 4)
      .map(
        (r) =>
          `• ${r.productName}: Order ${r.recommendedOrderQuantity} units (Current: ${r.currentStock}, Lead time: ${r.leadTimeDays}d)`
      )
      .join('\n');

    return {
      answer: `You have ${reorders.length} item(s) recommended for reorder:\n\n${itemsSummary}`,
      citedMetrics: reorders.slice(0, 4).map((r) => ({
        label: r.productName,
        value: `${r.recommendedOrderQuantity} units (Stock: ${r.currentStock})`,
      })),
      suggestedFollowUps: ['How was business today?', 'Show dead stock'],
    };
  }

  // 3. "Dead stock" / Which products are not moving?
  if (
    normalized.includes('dead stock') ||
    normalized.includes('not moving') ||
    normalized.includes('slow') ||
    normalized.includes('ruka') ||
    normalized.includes('bik nahi raha')
  ) {
    const dead = await detectDeadStock(shopId);

    if (dead.length === 0) {
      return {
        answer: 'Great news! There is no dead stock detected. All inventory has recorded sales recently.',
        citedMetrics: [{ label: 'Dead Stock Items', value: '0' }],
        suggestedFollowUps: ['What should I order?', 'How was business today?'],
      };
    }

    const totalLocked = dead.reduce((sum, d) => sum + d.totalCapitalLocked, 0);
    const topItems = dead
      .slice(0, 3)
      .map((d) => `• ${d.productName}: ${d.stockQuantity} units (${formatMoney(d.totalCapitalLocked)} locked)`)
      .join('\n');

    return {
      answer: `Found ${dead.length} product(s) with no sales in the last 3 weeks, representing ${formatMoney(totalLocked)} in tied-up capital:\n\n${topItems}`,
      citedMetrics: [
        { label: 'Total Capital Locked', value: formatMoney(totalLocked) },
        { label: 'Unmoved Items', value: String(dead.length) },
      ],
      suggestedFollowUps: ['What should I order?', 'Check cash status'],
    };
  }

  // 4. "Udhaar" / Customer debt
  if (
    normalized.includes('udhaar') ||
    normalized.includes('credit') ||
    normalized.includes('customer') ||
    normalized.includes('baki') ||
    normalized.includes('dukaan khata')
  ) {
    const customers = await getCustomers(shopId);
    const debtors = customers.filter((c) => c.currentBalance > 0);
    const totalUdhaar = debtors.reduce((sum, c) => sum + c.currentBalance, 0);

    if (debtors.length === 0) {
      return {
        answer: 'There is currently zero outstanding udhaar recorded across all customers.',
        citedMetrics: [{ label: 'Outstanding Udhaar', value: '₹0.00' }],
        suggestedFollowUps: ['How was business today?', 'What should I order?'],
      };
    }

    const topDebtors = debtors
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, 3)
      .map((c) => `• ${c.name}: ${formatMoney(c.currentBalance)}`)
      .join('\n');

    return {
      answer: `Total pending udhaar is ${formatMoney(totalUdhaar)} across ${debtors.length} customer(s):\n\n${topDebtors}`,
      citedMetrics: [
        { label: 'Total Pending Udhaar', value: formatMoney(totalUdhaar) },
        { label: 'Customers with Udhaar', value: String(debtors.length) },
      ],
      suggestedFollowUps: ['How was business today?', 'Check cash status'],
    };
  }

  // 5. "Forecast" / Tomorrow / Kal
  if (
    normalized.includes('tomorrow') ||
    normalized.includes('forecast') ||
    normalized.includes('kal') ||
    normalized.includes('expectation')
  ) {
    const forecast = await forecastTomorrowSales(shopId);
    return {
      answer: `Expected revenue for tomorrow is ${formatMoney(forecast.expectedSalesPaiseMin)} to ${formatMoney(forecast.expectedSalesPaiseMax)} (estimated mid: ${formatMoney(forecast.expectedSalesPaiseMid)}). Confidence is ${forecast.confidence}. ${forecast.basis}`,
      citedMetrics: [
        { label: 'Expected Range', value: `${formatMoney(forecast.expectedSalesPaiseMin)} – ${formatMoney(forecast.expectedSalesPaiseMax)}` },
        { label: 'Confidence', value: forecast.confidence },
      ],
      suggestedFollowUps: ['How was business today?', 'What should I order?'],
    };
  }

  // Fallback
  return {
    answer:
      'This feature is currently in development. Please use the preset messages below to view verified shop metrics (e.g. today\'s business, reorders, dead stock, or pending udhaar).',
    citedMetrics: [],
    suggestedFollowUps: [
      'How was business today?',
      'What should I order?',
      'Which products aren’t moving?',
      'How much udhaar is pending?',
    ],
  };
}
