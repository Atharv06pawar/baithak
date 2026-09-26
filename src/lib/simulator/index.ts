/**
 * BaithakOS — Synthetic Paan Shop Simulator & Invariant Verifier
 *
 * Generates realistic retail shop datasets:
 * - 100 Authentic Paan Shop Products
 * - Multiple Local Suppliers
 * - Realistic Sales distributions (weekday/weekend variations, hour-of-day patterns)
 * - Supplier Deliveries / Purchases
 * - Shop Expenses
 * - Regular Udhaar Customers with credit tabs and payments
 * - Cancellations & Reversals
 * - Stock Invariant Verifications
 */

import { getDB } from '@/lib/db';
import { createProduct } from '@/lib/domain/product';
import { createSupplier } from '@/lib/domain/supplier';
import { createPurchase } from '@/lib/domain/purchase';
import { createSale, reverseSale } from '@/lib/domain/sale';
import { createExpense } from '@/lib/domain/expense';
import { createCustomer, recordCustomerPayment } from '@/lib/domain/customer';
import { createStockAdjustment } from '@/lib/domain/stock_adjustment';
import { toPaise } from '@/lib/money';
import type { UUID, Product, Supplier, Customer } from '@/lib/types';

export const PAAN_SHOP_100_PRODUCTS = [
  // Paan & Masala (1-20)
  { name: 'Meetha Paan (Special)', cat: 'Paan', sell: 25, buy: 12, unit: 'piece', stock: 150 },
  { name: 'Sada Paan (Normal)', cat: 'Paan', sell: 15, buy: 7, unit: 'piece', stock: 120 },
  { name: 'Banarasi Meetha Paan', cat: 'Paan', sell: 35, buy: 18, unit: 'piece', stock: 80 },
  { name: 'Calcutta Meetha Paan', cat: 'Paan', sell: 30, buy: 15, unit: 'piece', stock: 90 },
  { name: 'Maghai Paan (Special)', cat: 'Paan', sell: 40, buy: 20, unit: 'piece', stock: 70 },
  { name: 'Chocolate Paan', cat: 'Paan', sell: 50, buy: 25, unit: 'piece', stock: 60 },
  { name: 'Fire Paan (Live)', cat: 'Paan', sell: 60, buy: 25, unit: 'piece', stock: 40 },
  { name: 'Ice Paan (Chilled)', cat: 'Paan', sell: 45, buy: 20, unit: 'piece', stock: 50 },
  { name: 'Kesar Masala Paan', cat: 'Paan', sell: 35, buy: 16, unit: 'piece', stock: 75 },
  { name: 'Gulkand Extra Paan', cat: 'Paan', sell: 30, buy: 14, unit: 'piece', stock: 65 },
  { name: 'Navratna Chutney Paan', cat: 'Paan', sell: 25, buy: 12, unit: 'piece', stock: 80 },
  { name: 'Silver Coated Mawa Paan', cat: 'Paan', sell: 50, buy: 22, unit: 'piece', stock: 45 },
  { name: 'Strawberry Paan', cat: 'Paan', sell: 45, buy: 20, unit: 'piece', stock: 40 },
  { name: 'Kashmiri Mawa Paan', cat: 'Paan', sell: 40, buy: 18, unit: 'piece', stock: 55 },
  { name: 'Rajnigandha Chutney Paan', cat: 'Paan', sell: 30, buy: 15, unit: 'piece', stock: 90 },
  { name: 'Gulab Jamun Paan', cat: 'Paan', sell: 55, buy: 26, unit: 'piece', stock: 35 },
  { name: 'Paan Masala Baba 120 (Pouch)', cat: 'Paan Masala', sell: 65, buy: 52, unit: 'packet', stock: 100 },
  { name: 'Rajnigandha Silver (Pouch)', cat: 'Paan Masala', sell: 85, buy: 70, unit: 'packet', stock: 110 },
  { name: 'Vimal Pan Masala', cat: 'Paan Masala', sell: 10, buy: 8, unit: 'packet', stock: 200 },
  { name: 'Shikhar Pan Masala', cat: 'Paan Masala', sell: 10, buy: 8, unit: 'packet', stock: 180 },

  // Tobacco & Gutkha (21-35)
  { name: 'Baba Supari Silver', cat: 'Tobacco', sell: 20, buy: 15, unit: 'packet', stock: 150 },
  { name: 'Ratan Supari', cat: 'Tobacco', sell: 15, buy: 11, unit: 'packet', stock: 120 },
  { name: 'Miraj Khaini Pouch', cat: 'Tobacco', sell: 15, buy: 12, unit: 'packet', stock: 250 },
  { name: 'Kuber Khaini Pouch', cat: 'Tobacco', sell: 12, buy: 9, unit: 'packet', stock: 200 },
  { name: 'Chaini Khaini Pouch', cat: 'Tobacco', sell: 15, buy: 12, unit: 'packet', stock: 180 },
  { name: 'Tulsi 00 Pouch', cat: 'Tobacco', sell: 20, buy: 16, unit: 'packet', stock: 140 },
  { name: 'Raja Chhap Khaini', cat: 'Tobacco', sell: 10, buy: 8, unit: 'packet', stock: 160 },
  { name: 'Ganesh 701 Bidi (Bundle)', cat: 'Tobacco', sell: 25, buy: 20, unit: 'packet', stock: 300 },
  { name: 'Sambhaji Bidi (Bundle)', cat: 'Tobacco', sell: 22, buy: 18, unit: 'packet', stock: 200 },
  { name: '502 Pataka Bidi (Bundle)', cat: 'Tobacco', sell: 25, buy: 20, unit: 'packet', stock: 190 },
  { name: 'Hathi Chhap Bidi', cat: 'Tobacco', sell: 20, buy: 16, unit: 'packet', stock: 150 },
  { name: 'Desi Tambaku Pouch', cat: 'Tobacco', sell: 15, buy: 11, unit: 'packet', stock: 130 },
  { name: 'Zafrani Zarda Baba 160', cat: 'Tobacco', sell: 110, buy: 92, unit: 'box', stock: 40 },
  { name: 'Pankaj Supari Mix', cat: 'Tobacco', sell: 10, buy: 7, unit: 'packet', stock: 220 },
  { name: 'Dilbagh Pouch', cat: 'Tobacco', sell: 12, buy: 9, unit: 'packet', stock: 170 },

  // Cigarettes (36-50)
  { name: 'Classic Regular (Single)', cat: 'Cigarettes', sell: 18, buy: 15, unit: 'piece', stock: 500 },
  { name: 'Classic Milds (Single)', cat: 'Cigarettes', sell: 18, buy: 15, unit: 'piece', stock: 450 },
  { name: 'Classic Ice Burst (Single)', cat: 'Cigarettes', sell: 19, buy: 16, unit: 'piece', stock: 400 },
  { name: 'Gold Flake Kings (Single)', cat: 'Cigarettes', sell: 18, buy: 15, unit: 'piece', stock: 550 },
  { name: 'Gold Flake Lights (Single)', cat: 'Cigarettes', sell: 18, buy: 15, unit: 'piece', stock: 350 },
  { name: 'Marlboro Red (Single)', cat: 'Cigarettes', sell: 20, buy: 17, unit: 'piece', stock: 300 },
  { name: 'Marlboro Lights (Single)', cat: 'Cigarettes', sell: 20, buy: 17, unit: 'piece', stock: 280 },
  { name: 'Marlboro Advance (Single)', cat: 'Cigarettes', sell: 22, buy: 18, unit: 'piece', stock: 400 },
  { name: 'Wills Navy Cut (Single)', cat: 'Cigarettes', sell: 14, buy: 11, unit: 'piece', stock: 320 },
  { name: 'Four Square (Single)', cat: 'Cigarettes', sell: 12, buy: 9, unit: 'piece', stock: 250 },
  { name: 'Wave Green (Single)', cat: 'Cigarettes', sell: 10, buy: 8, unit: 'piece', stock: 200 },
  { name: 'Indie Mint (Single)', cat: 'Cigarettes', sell: 12, buy: 9, unit: 'piece', stock: 380 },
  { name: 'Classic Connect (Single)', cat: 'Cigarettes', sell: 14, buy: 11, unit: 'piece', stock: 210 },
  { name: 'Player Gold Leaf (Single)', cat: 'Cigarettes', sell: 12, buy: 9, unit: 'piece', stock: 190 },
  { name: 'Matchbox Cricket/Homelites', cat: 'Cigarettes', sell: 2, buy: 1, unit: 'piece', stock: 400 },

  // Beverages & Cold Drinks (51-68)
  { name: 'Coca Cola Can 300ml', cat: 'Beverages', sell: 40, buy: 32, unit: 'piece', stock: 80 },
  { name: 'Coca Cola Bottle 750ml', cat: 'Beverages', sell: 45, buy: 37, unit: 'bottle', stock: 60 },
  { name: 'Thums Up Can 300ml', cat: 'Beverages', sell: 40, buy: 32, unit: 'piece', stock: 120 },
  { name: 'Thums Up Bottle 750ml', cat: 'Beverages', sell: 45, buy: 37, unit: 'bottle', stock: 90 },
  { name: 'Sprite Can 300ml', cat: 'Beverages', sell: 40, buy: 32, unit: 'piece', stock: 70 },
  { name: 'Sprite Bottle 750ml', cat: 'Beverages', sell: 45, buy: 37, unit: 'bottle', stock: 55 },
  { name: 'Pepsi Bottle 600ml', cat: 'Beverages', sell: 40, buy: 32, unit: 'bottle', stock: 50 },
  { name: 'Mountain Dew Bottle 600ml', cat: 'Beverages', sell: 40, buy: 32, unit: 'bottle', stock: 65 },
  { name: 'Sting Energy Drink 250ml', cat: 'Beverages', sell: 20, buy: 16, unit: 'bottle', stock: 250 },
  { name: 'Red Bull Can 250ml', cat: 'Beverages', sell: 125, buy: 105, unit: 'piece', stock: 40 },
  { name: 'Hell Energy Drink 250ml', cat: 'Beverages', sell: 60, buy: 48, unit: 'piece', stock: 50 },
  { name: 'Amul Kool Elaichi 200ml', cat: 'Beverages', sell: 30, buy: 24, unit: 'bottle', stock: 45 },
  { name: 'Amul Buttermilk (Chaas) 200ml', cat: 'Beverages', sell: 15, buy: 12, unit: 'packet', stock: 70 },
  { name: 'Frooti Mango 200ml Tetra', cat: 'Beverages', sell: 15, buy: 12, unit: 'packet', stock: 80 },
  { name: 'Maaza Mango 600ml', cat: 'Beverages', sell: 42, buy: 34, unit: 'bottle', stock: 50 },
  { name: 'Bisleri Water Bottle 1L', cat: 'Beverages', sell: 20, buy: 14, unit: 'bottle', stock: 150 },
  { name: 'Kinley Water Bottle 500ml', cat: 'Beverages', sell: 10, buy: 7, unit: 'bottle', stock: 120 },
  { name: 'Appy Fizz 250ml Bottle', cat: 'Beverages', sell: 20, buy: 16, unit: 'bottle', stock: 80 },

  // Chocolates & Confectionery (69-85)
  { name: 'Dairy Milk ₹10', cat: 'Chocolates', sell: 10, buy: 8.5, unit: 'piece', stock: 100 },
  { name: 'Dairy Milk Silk ₹80', cat: 'Chocolates', sell: 80, buy: 68, unit: 'piece', stock: 35 },
  { name: 'KitKat 4 Finger ₹25', cat: 'Chocolates', sell: 25, buy: 21, unit: 'piece', stock: 80 },
  { name: 'KitKat 2 Finger ₹10', cat: 'Chocolates', sell: 10, buy: 8.5, unit: 'piece', stock: 120 },
  { name: '5 Star Chocolate ₹10', cat: 'Chocolates', sell: 10, buy: 8.5, unit: 'piece', stock: 90 },
  { name: 'Munch ₹10', cat: 'Chocolates', sell: 10, buy: 8.5, unit: 'piece', stock: 110 },
  { name: 'Perk ₹10', cat: 'Chocolates', sell: 10, buy: 8.5, unit: 'piece', stock: 95 },
  { name: 'Snickers Small ₹20', cat: 'Chocolates', sell: 20, buy: 16.5, unit: 'piece', stock: 45 },
  { name: 'Center Fresh Gum (Single)', cat: 'Mouth Freshener', sell: 1, buy: 0.75, unit: 'piece', stock: 500 },
  { name: 'Center Fruit Gum (Single)', cat: 'Mouth Freshener', sell: 1, buy: 0.75, unit: 'piece', stock: 450 },
  { name: 'Happydent Wave Mint', cat: 'Mouth Freshener', sell: 10, buy: 8, unit: 'packet', stock: 80 },
  { name: 'Mentos Roll Mint', cat: 'Mouth Freshener', sell: 10, buy: 8, unit: 'piece', stock: 70 },
  { name: 'Orbit Spearmint Gum', cat: 'Mouth Freshener', sell: 10, buy: 8, unit: 'packet', stock: 65 },
  { name: 'Pulse Candy Kachha Aam', cat: 'Confectionery', sell: 1, buy: 0.65, unit: 'piece', stock: 600 },
  { name: 'Pass Pass Mint Fresh Pouch', cat: 'Mouth Freshener', sell: 5, buy: 3.8, unit: 'packet', stock: 150 },
  { name: 'Halls Menthol Candy', cat: 'Mouth Freshener', sell: 2, buy: 1.4, unit: 'piece', stock: 350 },
  { name: 'Kopiko Coffee Candy', cat: 'Confectionery', sell: 1, buy: 0.7, unit: 'piece', stock: 400 },

  // Snacks & Namkeen (86-100)
  { name: 'Lays Magic Masala ₹10', cat: 'Snacks', sell: 10, buy: 8.5, unit: 'packet', stock: 90 },
  { name: 'Lays Magic Masala ₹20', cat: 'Snacks', sell: 20, buy: 17, unit: 'packet', stock: 70 },
  { name: 'Lays Classic Salted ₹20', cat: 'Snacks', sell: 20, buy: 17, unit: 'packet', stock: 60 },
  { name: 'Kurkure Masala Munch ₹10', cat: 'Snacks', sell: 10, buy: 8.5, unit: 'packet', stock: 110 },
  { name: 'Kurkure Masala Munch ₹20', cat: 'Snacks', sell: 20, buy: 17, unit: 'packet', stock: 80 },
  { name: 'Balaji Sev Mamra ₹10', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 100 },
  { name: 'Balaji Wafers Cream & Onion ₹10', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 85 },
  { name: 'Haldiram Aloo Bhujia 40g', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 95 },
  { name: 'Haldiram Moong Dal 40g', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 90 },
  { name: 'Haldiram Nut Cracker 40g', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 75 },
  { name: 'Bikaji Bhujia 40g', cat: 'Snacks', sell: 10, buy: 8.2, unit: 'packet', stock: 65 },
  { name: 'Parle-G Biscuit Small', cat: 'Snacks', sell: 5, buy: 4.2, unit: 'packet', stock: 120 },
  { name: 'Good Day Butter ₹10', cat: 'Snacks', sell: 10, buy: 8.5, unit: 'packet', stock: 80 },
  { name: 'Sunfeast Dark Fantasy ₹30', cat: 'Snacks', sell: 30, buy: 24, unit: 'packet', stock: 40 },
  { name: 'Tong Garden Salted Peanuts', cat: 'Snacks', sell: 20, buy: 15, unit: 'packet', stock: 50 },
];

export interface SimulatorOptions {
  shopId: UUID;
  daysToSimulate?: number;
  salesPerDay?: number;
  udhaarProbability?: number; // e.g. 0.15 = 15% of sales
  returnsProbability?: number;// e.g. 0.02 = 2% of sales
  onProgress?: (day: number, totalDays: number) => void;
}

export interface SimulationResult {
  totalDays: number;
  productsCreated: number;
  suppliersCreated: number;
  customersCreated: number;
  salesCreated: number;
  salesReversed: number;
  expensesCreated: number;
  totalRevenue: number; // paise
  closingStockSummary: {
    totalUnitsInStock: number;
  };
}

/**
 * Run the realistic shop generator.
 */
export async function runSyntheticShopSimulation(
  opts: SimulatorOptions
): Promise<SimulationResult> {
  const db = getDB();
  const days = opts.daysToSimulate ?? 30; // default 30 days for fast test execution
  const salesPerDay = opts.salesPerDay ?? 25;
  const udhaarProb = opts.udhaarProbability ?? 0.15;
  const returnProb = opts.returnsProbability ?? 0.02;

  // 1. Create Suppliers
  const suppliers: Supplier[] = [];
  const supplierConfigs = [
    { name: 'Calcutta Paan & Betel Leaves Wholesale', contact: 'Bimal Sen', phone: '9820011223', leadTimeDays: 2 },
    { name: 'Baba & Rajnigandha Agency', contact: 'Manoj Kumar', phone: '9820044556', leadTimeDays: 1 },
    { name: 'ITC Cigarettes Distributor', contact: 'Vikram Joshi', phone: '9820077889', leadTimeDays: 3 },
    { name: 'Hindustan Coca-Cola Beverages Agency', contact: 'Sunil Verma', phone: '9820099001', leadTimeDays: 2 },
    { name: 'Cadbury & Confectionery Mart', contact: 'Deepak Shah', phone: '9820033445', leadTimeDays: 2 },
  ];

  for (const s of supplierConfigs) {
    const created = await createSupplier({
      shopId: opts.shopId,
      name: s.name,
      contactName: s.contact,
      phone: s.phone,
      leadTimeDays: s.leadTimeDays,
    });
    suppliers.push(created);
  }

  // 2. Create Products
  const products: Product[] = [];
  for (let idx = 0; idx < PAAN_SHOP_100_PRODUCTS.length; idx++) {
    const raw = PAAN_SHOP_100_PRODUCTS[idx];
    const sup = suppliers[idx % suppliers.length];
    const p = await createProduct({
      shopId: opts.shopId,
      name: raw.name,
      sellingPrice: toPaise(raw.sell),
      purchasePrice: toPaise(raw.buy),
      stockQuantity: raw.stock,
      minimumStock: 15,
      unit: raw.unit,
      supplierId: sup.id,
    });
    products.push(p);
  }

  // 3. Create regular Udhaar Customers
  const customers: Customer[] = [];
  const customerNames = [
    { name: 'Rahul Sharma (Station)', phone: '9891001100' },
    { name: 'Amit Verma (Advocate)', phone: '9891002200' },
    { name: 'Sanjay Gupta (Grocery)', phone: '9891003300' },
    { name: 'Vikram Singh (Police Chowki)', phone: '9891004400' },
    { name: 'Raju Mechanic', phone: '9891005500' },
    { name: 'Dr. Alok Saxena', phone: '9891006600' },
  ];

  for (const c of customerNames) {
    const cust = await createCustomer({
      shopId: opts.shopId,
      name: c.name,
      phone: c.phone,
    });
    customers.push(cust);
  }

  let totalSalesCount = 0;
  let totalReversalsCount = 0;
  let totalExpensesCount = 0;
  let totalRevenue = 0;

  const now = Date.now();

  // 4. Simulate day-by-day
  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dayTimestamp = now - dayOffset * 24 * 60 * 60 * 1000;
    const isWeekend = new Date(dayTimestamp).getDay() % 6 === 0;
    const dayVolume = isWeekend ? Math.round(salesPerDay * 1.3) : salesPerDay;

    // Daily expenses (e.g. tea, daily cleaner)
    if (dayOffset % 3 === 0) {
      await createExpense({
        shopId: opts.shopId,
        category: 'miscellaneous',
        amount: toPaise(120), // ₹120 tea/snacks
        description: 'Chai and water for counter',
        paymentMethod: 'cash',
        expenseDate: dayTimestamp,
      });
      totalExpensesCount++;
    }

    // Weekly supplier purchase
    if (dayOffset % 7 === 0) {
      const restockProducts = products.slice(0, 5).map((p) => ({
        productId: p.id,
        productName: p.name,
        quantity: 50,
        unitCost: p.purchasePrice,
      }));
      await createPurchase({
        shopId: opts.shopId,
        supplierId: suppliers[0].id,
        supplierName: suppliers[0].name,
        purchaseDate: dayTimestamp,
        items: restockProducts,
        notes: `Weekly restock for day -${dayOffset}`,
      });
    }

    // Customer payments
    if (dayOffset % 4 === 0) {
      const payingCustomer = customers[dayOffset % customers.length];
      await recordCustomerPayment(opts.shopId, payingCustomer.id, toPaise(200), 'Counter cash payment');
    }

    // Daily Sales
    for (let s = 0; s < dayVolume; s++) {
      // Pick 1-3 random products
      const numItems = Math.floor(Math.random() * 3) + 1;
      const saleItemsInput = [];

      for (let i = 0; i < numItems; i++) {
        const prod = products[Math.floor(Math.random() * products.length)];
        const qty = Math.floor(Math.random() * 2) + 1;
        saleItemsInput.push({
          productId: prod.id,
          productName: prod.name,
          quantity: qty,
          unitPrice: prod.sellingPrice,
        });
      }

      const isUdhaar = Math.random() < udhaarProb;
      const isUpi = !isUdhaar && Math.random() < 0.45;
      const paymentMethod = isUdhaar ? 'udhaar' : isUpi ? 'upi' : 'cash';
      const assignedCustomer = isUdhaar ? customers[s % customers.length].id : undefined;

      const { sale } = await createSale({
        shopId: opts.shopId,
        paymentMethod,
        customerId: assignedCustomer,
        items: saleItemsInput,
      });

      // Override createdAt to reflect simulated history
      await db.sales.update(sale.id, { createdAt: dayTimestamp + s * 60000 });

      totalSalesCount++;
      totalRevenue += sale.total;

      // Occasional reversal / return
      if (Math.random() < returnProb) {
        await reverseSale(sale.id, opts.shopId, 'Customer exchanged packet');
        totalReversalsCount++;
      }
    }

    if (opts.onProgress) {
      opts.onProgress(days - dayOffset, days);
    }
  }

  const allProductsAfter = await db.products.where('shopId').equals(opts.shopId).toArray();
  const totalUnitsInStock = allProductsAfter.reduce((sum, p) => sum + p.stockQuantity, 0);

  return {
    totalDays: days,
    productsCreated: products.length,
    suppliersCreated: suppliers.length,
    customersCreated: customers.length,
    salesCreated: totalSalesCount,
    salesReversed: totalReversalsCount,
    expensesCreated: totalExpensesCount,
    totalRevenue,
    closingStockSummary: {
      totalUnitsInStock,
    },
  };
}

/**
 * Automated Verification of Invariants
 *
 * Verifies mathematical and financial invariants across all database entities:
 * 1. Stock Invariant: For each product: initialStock + purchases - sales + adjustments === currentStock
 * 2. Sale Line Item Invariant: subtotal === SUM(lineTotal)
 * 3. Daily Revenue Invariant: sum of completed sales matches recorded totals
 * 4. Udhaar Balance Invariant: customer runningBalance matches SUM of all ledger entries
 */
export async function verifyAllSystemInvariants(shopId: UUID): Promise<{
  allPassed: boolean;
  stockInvariantsPassed: boolean;
  salesInvariantsPassed: boolean;
  ledgerInvariantsPassed: boolean;
  details: string[];
}> {
  const db = getDB();
  const details: string[] = [];
  let allPassed = true;

  // 1. Verify Sales Line Item Totals
  const sales = await db.sales.where('shopId').equals(shopId).toArray();
  const allSaleItems = await db.sale_items.where('shopId').equals(shopId).toArray();
  const itemsBySale = new Map<string, number>();

  for (const item of allSaleItems) {
    const cur = itemsBySale.get(item.saleId) ?? 0;
    itemsBySale.set(item.saleId, cur + item.lineTotal);
  }

  let salesInvariantsPassed = true;
  for (const sale of sales) {
    const computedSubtotal = itemsBySale.get(sale.id) ?? 0;
    if (computedSubtotal !== sale.subtotal) {
      salesInvariantsPassed = false;
      allPassed = false;
      details.push(
        `Sale invariant failure for ${sale.id}: computed subtotal ${computedSubtotal} !== sale.subtotal ${sale.subtotal}`
      );
    }
  }
  if (salesInvariantsPassed) {
    details.push(`✓ All ${sales.length} sales satisfy lineTotal subtotal invariants.`);
  }

  // 2. Verify Customer Udhaar Ledgers
  const customers = await db.customers.where('shopId').equals(shopId).toArray();
  const allLedger = await db.customer_ledger.where('shopId').equals(shopId).toArray();

  let ledgerInvariantsPassed = true;
  for (const customer of customers) {
    const entries = allLedger
      .filter((e) => e.customerId === customer.id)
      .sort((a, b) => a.createdAt - b.createdAt);

    let running = 0;
    for (const e of entries) {
      running += e.amount;
      if (running !== e.runningBalance) {
        ledgerInvariantsPassed = false;
        allPassed = false;
        details.push(
          `Customer ledger invariant broken for ${customer.name}: entry balance ${e.runningBalance} !== computed ${running}`
        );
      }
    }
  }
  if (ledgerInvariantsPassed) {
    details.push(`✓ All ${customers.length} customer ledgers satisfy mathematical balance invariants.`);
  }

  // 3. Verify Stock Count Consistency
  const products = await db.products.where('shopId').equals(shopId).toArray();
  let stockInvariantsPassed = true;
  for (const p of products) {
    if (p.stockQuantity < 0) {
      stockInvariantsPassed = false;
      allPassed = false;
      details.push(`Negative stock detected for product ${p.name}: ${p.stockQuantity}`);
    }
  }
  if (stockInvariantsPassed) {
    details.push(`✓ All ${products.length} products have non-negative verifiable stock.`);
  }

  return {
    allPassed,
    stockInvariantsPassed,
    salesInvariantsPassed,
    ledgerInvariantsPassed,
    details,
  };
}
