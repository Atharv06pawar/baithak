/**
 * BaithakOS — Full Shop Backup and Restore
 *
 * Implements full offline export and restore of all shop data.
 * Verifiable with: Export -> Delete DB -> Restore -> Compare.
 */

import { getDB } from '@/lib/db';
import type { UUID } from '@/lib/types';

export interface ShopBackupData {
  version: 1;
  exportedAt: number;
  shopId: UUID;
  metadata: {
    shopName: string;
    ownerName: string;
    ownerEmail?: string;
    totalProducts: number;
    totalSales: number;
  };
  tables: {
    shops: unknown[];
    shop_settings: unknown[];
    categories: unknown[];
    products: unknown[];
    suppliers: unknown[];
    sales: unknown[];
    sale_items: unknown[];
    purchases: unknown[];
    purchase_items: unknown[];
    expenses: unknown[];
    customers: unknown[];
    customer_ledger: unknown[];
    stock_adjustments: unknown[];
    audit_logs: unknown[];
    sync_outbox: unknown[];
    sync_state: unknown[];
    devices: unknown[];
    daily_summaries: unknown[];
    analytics_snapshots: unknown[];
  };
}

export async function exportShopBackup(shopId: UUID): Promise<ShopBackupData> {
  const db = getDB();

  const [
    shops,
    shop_settings,
    categories,
    products,
    suppliers,
    sales,
    sale_items,
    purchases,
    purchase_items,
    expenses,
    customers,
    customer_ledger,
    stock_adjustments,
    audit_logs,
    sync_outbox,
    sync_state,
    devices,
    daily_summaries,
    analytics_snapshots,
  ] = await Promise.all([
    db.shops.where('id').equals(shopId).toArray(),
    db.shop_settings.where('shopId').equals(shopId).toArray(),
    db.categories.where('shopId').equals(shopId).toArray(),
    db.products.where('shopId').equals(shopId).toArray(),
    db.suppliers.where('shopId').equals(shopId).toArray(),
    db.sales.where('shopId').equals(shopId).toArray(),
    db.sale_items.where('shopId').equals(shopId).toArray(),
    db.purchases.where('shopId').equals(shopId).toArray(),
    db.purchase_items.where('shopId').equals(shopId).toArray(),
    db.expenses.where('shopId').equals(shopId).toArray(),
    db.customers.where('shopId').equals(shopId).toArray(),
    db.customer_ledger.where('shopId').equals(shopId).toArray(),
    db.stock_adjustments.where('shopId').equals(shopId).toArray(),
    db.audit_logs.where('shopId').equals(shopId).toArray(),
    db.sync_outbox.where('shopId').equals(shopId).toArray(),
    db.sync_state.where('shopId').equals(shopId).toArray(),
    db.devices.where('shopId').equals(shopId).toArray(),
    db.daily_summaries.where('shopId').equals(shopId).toArray(),
    db.analytics_snapshots.where('shopId').equals(shopId).toArray(),
  ]);

  const currentShop = shops[0] as { name?: string; ownerName?: string; ownerEmail?: string } | undefined;

  return {
    version: 1,
    exportedAt: Date.now(),
    shopId,
    metadata: {
      shopName: currentShop?.name || 'Baithak Shop',
      ownerName: currentShop?.ownerName || 'Owner',
      ownerEmail: currentShop?.ownerEmail || undefined,
      totalProducts: products.length,
      totalSales: sales.length,
    },
    tables: {
      shops,
      shop_settings,
      categories,
      products,
      suppliers,
      sales,
      sale_items,
      purchases,
      purchase_items,
      expenses,
      customers,
      customer_ledger,
      stock_adjustments,
      audit_logs,
      sync_outbox,
      sync_state,
      devices,
      daily_summaries,
      analytics_snapshots,
    },
  };
}

export async function restoreShopBackup(backup: ShopBackupData): Promise<void> {
  if (!backup || backup.version !== 1 || !backup.tables) {
    throw new Error('Invalid backup file format or unsupported version');
  }

  const db = getDB();

  // Clear existing local data in all tables and bulk-insert from backup
  await db.transaction(
    'rw',
    [
      db.shops,
      db.shop_settings,
      db.categories,
      db.products,
      db.suppliers,
      db.sales,
      db.sale_items,
      db.purchases,
      db.purchase_items,
      db.expenses,
      db.customers,
      db.customer_ledger,
      db.stock_adjustments,
      db.audit_logs,
      db.sync_outbox,
      db.sync_state,
      db.devices,
      db.daily_summaries,
      db.analytics_snapshots,
    ],
    async () => {
      // Clear
      await Promise.all([
        db.shops.clear(),
        db.shop_settings.clear(),
        db.categories.clear(),
        db.products.clear(),
        db.suppliers.clear(),
        db.sales.clear(),
        db.sale_items.clear(),
        db.purchases.clear(),
        db.purchase_items.clear(),
        db.expenses.clear(),
        db.customers.clear(),
        db.customer_ledger.clear(),
        db.stock_adjustments.clear(),
        db.audit_logs.clear(),
        db.sync_outbox.clear(),
        db.sync_state.clear(),
        db.devices.clear(),
        db.daily_summaries.clear(),
        db.analytics_snapshots.clear(),
      ]);

      // Bulk restore
      const t = backup.tables;
      if (t.shops?.length) await db.shops.bulkAdd(t.shops as any);
      if (t.shop_settings?.length) await db.shop_settings.bulkAdd(t.shop_settings as any);
      if (t.categories?.length) await db.categories.bulkAdd(t.categories as any);
      if (t.products?.length) await db.products.bulkAdd(t.products as any);
      if (t.suppliers?.length) await db.suppliers.bulkAdd(t.suppliers as any);
      if (t.sales?.length) await db.sales.bulkAdd(t.sales as any);
      if (t.sale_items?.length) await db.sale_items.bulkAdd(t.sale_items as any);
      if (t.purchases?.length) await db.purchases.bulkAdd(t.purchases as any);
      if (t.purchase_items?.length) await db.purchase_items.bulkAdd(t.purchase_items as any);
      if (t.expenses?.length) await db.expenses.bulkAdd(t.expenses as any);
      if (t.customers?.length) await db.customers.bulkAdd(t.customers as any);
      if (t.customer_ledger?.length) await db.customer_ledger.bulkAdd(t.customer_ledger as any);
      if (t.stock_adjustments?.length) await db.stock_adjustments.bulkAdd(t.stock_adjustments as any);
      if (t.audit_logs?.length) await db.audit_logs.bulkAdd(t.audit_logs as any);
      if (t.sync_outbox?.length) await db.sync_outbox.bulkAdd(t.sync_outbox as any);
      if (t.sync_state?.length) await db.sync_state.bulkAdd(t.sync_state as any);
      if (t.devices?.length) await db.devices.bulkAdd(t.devices as any);
      if (t.daily_summaries?.length) await db.daily_summaries.bulkAdd(t.daily_summaries as any);
      if (t.analytics_snapshots?.length) await db.analytics_snapshots.bulkAdd(t.analytics_snapshots as any);
    }
  );
}

/** Trigger browser JSON download */
export function downloadBackupJson(backup: ShopBackupData): void {
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `baithak-backup-${backup.metadata.shopName.replace(/\s+/g, '_')}-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
