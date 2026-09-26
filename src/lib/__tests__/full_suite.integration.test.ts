/**
 * Comprehensive Integration Test Suite
 *
 * Verifies all phases:
 * - Phase 2: POS Enhancements
 * - Phase 3: Inventory, Purchases, Suppliers, Stock Adjustments
 * - Phase 4: Business Operations (Expenses, Udhaar Ledger, Cash Reconciliation, Daily Close)
 * - Phase 5: Backup & Restore
 * - Phase 6: Business Intelligence Engine & Action Center
 * - Phase 7: AI Assistant ("Ask Baithak")
 * - Phase 8: Synthetic Simulation & Invariant Checks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { _resetDB, getDB } from '@/lib/db';
import { createShop } from '@/lib/domain/shop';
import { createProduct, getProducts } from '@/lib/domain/product';
import { createSupplier, getSuppliers } from '@/lib/domain/supplier';
import { createPurchase, getPurchases } from '@/lib/domain/purchase';
import { createStockAdjustment, getStockAdjustments } from '@/lib/domain/stock_adjustment';
import { createSale, reverseSale } from '@/lib/domain/sale';
import { createExpense, getExpenses } from '@/lib/domain/expense';
import { createCustomer, recordCustomerPayment, getCustomers, getCustomerLedger } from '@/lib/domain/customer';
import { generateCashReconciliation } from '@/lib/domain/reconciliation';
import { getDayOverview, closeDay } from '@/lib/domain/closing';
import { exportShopBackup, restoreShopBackup } from '@/lib/backup';
import {
  calculateProductVelocities,
  calculateReorderRecommendations,
  detectDeadStock,
  generateActionCenterAlerts,
  forecastTomorrowSales,
} from '@/lib/intelligence';
import { askBaithak } from '@/lib/ai/assistant';
import { runSyntheticShopSimulation, verifyAllSystemInvariants } from '@/lib/simulator';
import { toPaise } from '@/lib/money';

const SHOP_ID = 'integration-test-shop';

beforeEach(async () => {
  const db = getDB();
  if (db.isOpen()) {
    await db.delete();
  }
  _resetDB();
  await getDB().open();
});

describe('Phase 3: Suppliers, Purchases & Stock Adjustments', () => {
  it('creates suppliers and retrieves active list', async () => {
    const s = await createSupplier({
      shopId: SHOP_ID,
      name: 'Baba Pan Products Distributor',
      contactName: 'Rameshji',
      phone: '9820011223',
      leadTimeDays: 2,
    });

    expect(s.id).toBeTruthy();
    expect(s.leadTimeDays).toBe(2);

    const list = await getSuppliers(SHOP_ID);
    expect(list.some((sup) => sup.id === s.id)).toBe(true);
  });

  it('records purchase invoice and increases stock atomically', async () => {
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Baba 120 Pouch',
      sellingPrice: toPaise(65),
      purchasePrice: toPaise(50),
      stockQuantity: 20,
    });

    const { purchase, items } = await createPurchase({
      shopId: SHOP_ID,
      invoiceNumber: 'INV-2026-001',
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 50,
          unitCost: toPaise(48), // updated cost
        },
      ],
    });

    expect(purchase.total).toBe(toPaise(48 * 50));
    expect(items).toHaveLength(1);

    const updatedProd = await getDB().products.get(prod.id);
    // 20 + 50 = 70
    expect(updatedProd?.stockQuantity).toBe(70);
    // purchase price updated
    expect(updatedProd?.purchasePrice).toBe(toPaise(48));

    const purchasesList = await getPurchases(SHOP_ID);
    expect(purchasesList.length).toBeGreaterThanOrEqual(1);
  });

  it('records stock adjustment for damaged goods', async () => {
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Coca Cola Can',
      sellingPrice: toPaise(40),
      stockQuantity: 30,
    });

    const adj = await createStockAdjustment({
      shopId: SHOP_ID,
      productId: prod.id,
      productName: prod.name,
      adjustmentType: 'damage',
      quantityChange: -3,
      reason: 'Leaked during transit',
    });

    expect(adj.quantityBefore).toBe(30);
    expect(adj.quantityAfter).toBe(27);

    const updatedProd = await getDB().products.get(prod.id);
    expect(updatedProd?.stockQuantity).toBe(27);

    const adjustments = await getStockAdjustments(SHOP_ID, prod.id);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].reason).toBe('Leaked during transit');
  });
});

describe('Phase 4: Business Operations (Expenses, Udhaar, Reconciliation, Closing)', () => {
  it('records business expenses and categorizes them', async () => {
    const exp = await createExpense({
      shopId: SHOP_ID,
      category: 'electricity',
      amount: toPaise(850),
      description: 'Monthly cooler bill',
      paymentMethod: 'cash',
    });

    expect(exp.id).toBeTruthy();
    expect(exp.amount).toBe(toPaise(850));

    const list = await getExpenses(SHOP_ID, { category: 'electricity' });
    expect(list.some((e) => e.id === exp.id)).toBe(true);
  });

  it('handles customer udhaar sale and repayment flow', async () => {
    const customer = await createCustomer({
      shopId: SHOP_ID,
      name: 'Raju Bhai Tea Stall',
      phone: '9892003344',
    });

    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Classic Milds',
      sellingPrice: toPaise(18),
      stockQuantity: 100,
    });

    // Udhaar sale: 2 packs = ₹36
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'udhaar',
      customerId: customer.id,
      items: [{ productId: prod.id, productName: prod.name, quantity: 2, unitPrice: toPaise(18) }],
    });

    let customersWithBalance = await getCustomers(SHOP_ID);
    let target = customersWithBalance.find((c) => c.id === customer.id);
    expect(target?.currentBalance).toBe(toPaise(36));

    // Customer makes partial cash payment of ₹20
    await recordCustomerPayment(SHOP_ID, customer.id, toPaise(20), 'Paid ₹20 at counter');

    customersWithBalance = await getCustomers(SHOP_ID);
    target = customersWithBalance.find((c) => c.id === customer.id);
    // 36 - 20 = 16
    expect(target?.currentBalance).toBe(toPaise(16));

    const ledger = await getCustomerLedger(SHOP_ID, customer.id);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].amount).toBe(toPaise(36));
    expect(ledger[1].amount).toBe(-toPaise(20));
  });

  it('performs cash reconciliation and discovers discrepancy evidence', async () => {
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Meetha Paan',
      sellingPrice: toPaise(20),
      stockQuantity: 50,
    });

    // Make ₹60 cash sale (3 items)
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: prod.id, productName: prod.name, quantity: 3, unitPrice: toPaise(20) }],
    });

    // Record ₹20 cash expense
    await createExpense({
      shopId: SHOP_ID,
      category: 'miscellaneous',
      amount: toPaise(20),
      paymentMethod: 'cash',
    });

    // Expected cash: 0 + 60 - 20 = 40
    // Suppose owner declares ₹40 (exact)
    const balancedReport = await generateCashReconciliation(SHOP_ID, toPaise(40));
    expect(balancedReport.expectedCash).toBe(toPaise(40));
    expect(balancedReport.difference).toBe(0);
    expect(balancedReport.isBalanced).toBe(true);

    // Suppose owner declares ₹20 (missing ₹20)
    const discrepancyReport = await generateCashReconciliation(SHOP_ID, toPaise(20));
    expect(discrepancyReport.difference).toBe(-toPaise(20));
    expect(discrepancyReport.isBalanced).toBe(false);
    expect(discrepancyReport.possibleCauses.length).toBeGreaterThanOrEqual(1);
    expect(
      discrepancyReport.possibleCauses.some((c) => c.type === 'expense' && c.amount === toPaise(20))
    ).toBe(true);
  });

  it('generates day overview and closes day', async () => {
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Banarasi Paan',
      sellingPrice: toPaise(30),
      purchasePrice: toPaise(15),
      stockQuantity: 40,
    });

    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: prod.id, productName: prod.name, quantity: 2, unitPrice: toPaise(30) }],
    });

    const overview = await getDayOverview(SHOP_ID, toPaise(60));
    expect(overview.totalSales).toBe(toPaise(60));
    expect(overview.totalTransactions).toBe(1);
    expect(overview.estimatedGrossProfit).toBe(toPaise(30)); // 60 - 30

    const closed = await closeDay(SHOP_ID, toPaise(60), 'Owner Ramesh');
    expect(closed.status).toBe('closed');
    expect(closed.totalSales).toBe(toPaise(60));
  });
});

describe('Phase 5: Full Shop Backup & Restore Verification', () => {
  it('exports, clears DB, restores, and preserves exact data invariants', async () => {
    await createShop({ name: 'Sharma Paan Store', ownerName: 'Ramesh Sharma' });
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Special Meetha Paan',
      sellingPrice: toPaise(25),
      purchasePrice: toPaise(12),
      stockQuantity: 80,
    });
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: prod.id, productName: prod.name, quantity: 4, unitPrice: toPaise(25) }],
    });

    // 1. Export backup
    const backup = await exportShopBackup(SHOP_ID);
    expect(backup.tables.products.length).toBeGreaterThanOrEqual(1);
    expect(backup.tables.sales.length).toBeGreaterThanOrEqual(1);

    // 2. Clear database
    await getDB().products.clear();
    await getDB().sales.clear();
    const prodsAfterClear = await getDB().products.toArray();
    expect(prodsAfterClear.length).toBe(0);

    // 3. Restore backup
    await restoreShopBackup(backup);

    // 4. Verify data is intact
    const restoredProducts = await getProducts(SHOP_ID);
    expect(restoredProducts.some((p) => p.name === 'Special Meetha Paan')).toBe(true);

    const restoredProduct = restoredProducts.find((p) => p.name === 'Special Meetha Paan');
    // Stock was 80 - 4 = 76
    expect(restoredProduct?.stockQuantity).toBe(76);
  });
});

describe('Phase 6 & 7: Intelligence Engine & Ask Baithak', () => {
  it('computes product velocity and reorder recommendations', async () => {
    const prod = await createProduct({
      shopId: SHOP_ID,
      name: 'Fast Selling Maghai Paan',
      sellingPrice: toPaise(40),
      stockQuantity: 4, // low stock
      minimumStock: 10,
    });

    // Record sales to generate velocity
    await createSale({
      shopId: SHOP_ID,
      paymentMethod: 'cash',
      items: [{ productId: prod.id, productName: prod.name, quantity: 3, unitPrice: toPaise(40) }],
    });

    const velocities = await calculateProductVelocities(SHOP_ID, 14);
    const target = velocities.find((v) => v.productId === prod.id);
    expect(target).toBeDefined();
    expect(target?.unitsSold).toBe(3);

    const reorders = await calculateReorderRecommendations(SHOP_ID, 14);
    expect(reorders.some((r) => r.productId === prod.id)).toBe(true);

    const alerts = await generateActionCenterAlerts(SHOP_ID);
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    const forecast = await forecastTomorrowSales(SHOP_ID);
    expect(forecast.expectedSalesPaiseMid).toBeGreaterThanOrEqual(0);
  });

  it('Ask Baithak answers queries using verified metrics', async () => {
    const answerSales = await askBaithak(SHOP_ID, 'How was business today?');
    expect(answerSales.answer).toBeTruthy();
    expect(answerSales.citedMetrics.length).toBeGreaterThanOrEqual(1);

    const answerReorder = await askBaithak(SHOP_ID, 'What should I order?');
    expect(answerReorder.answer).toBeTruthy();

    const answerDead = await askBaithak(SHOP_ID, 'Which products are dead stock?');
    expect(answerDead.answer).toBeTruthy();

    const answerUdhaar = await askBaithak(SHOP_ID, 'How much udhaar is pending?');
    expect(answerUdhaar.answer).toBeTruthy();
  });
});

describe('Phase 8: Synthetic Shop Simulator & Mathematical Invariant Verification', () => {
  it('runs realistic simulation and passes all mathematical invariants', async () => {
    // Run simulation for 3 days with 10 sales/day for speedy automated test
    const simResult = await runSyntheticShopSimulation({
      shopId: SHOP_ID,
      daysToSimulate: 3,
      salesPerDay: 8,
      udhaarProbability: 0.2,
      returnsProbability: 0.05,
    });

    expect(simResult.productsCreated).toBe(100);
    expect(simResult.suppliersCreated).toBe(5);
    expect(simResult.salesCreated).toBeGreaterThanOrEqual(20);

    // Verify all system invariants
    const verification = await verifyAllSystemInvariants(SHOP_ID);
    expect(verification.salesInvariantsPassed).toBe(true);
    expect(verification.ledgerInvariantsPassed).toBe(true);
    expect(verification.stockInvariantsPassed).toBe(true);
    expect(verification.allPassed).toBe(true);
  });
});
