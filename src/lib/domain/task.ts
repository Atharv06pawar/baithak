/**
 * BaithakOS — Operational Tasks & Notifications Domain Service
 *
 * Generates and manages daily shop tasks:
 * - Low-stock alerts with supplier reorder drafts
 * - Khata (Udhaar) dues with polite customer payment reminder drafts
 * - Daily register closing check
 *
 * Guarantees that:
 * 1. Tasks are tracked offline in IndexedDB with full check/uncheck status.
 * 2. NO automated messages are ever sent without explicit shop owner review and approval.
 */

import { getDB } from '@/lib/db';
import { getProducts } from './product';
import { getSuppliers } from './supplier';
import { getCustomers } from './customer';
import { formatMoney } from '@/lib/money';
import type { ShopTask, TaskStatus, UUID } from '@/lib/types';

/**
 * Format phone number for WhatsApp wa.me links
 * Handles 10-digit Indian numbers by prefixing 91
 */
export function formatWhatsAppUrl(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // If 10 digits, prefix Indian country code 91
  const fullPhone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Fetch all operational tasks for a shop, synchronizing with current
 * product stock levels and customer balances.
 */
export async function getOperationalTasks(shopId: UUID): Promise<ShopTask[]> {
  const db = getDB();
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Fetch current domain state in parallel
  const [products, suppliers, customers, existingTasks] = await Promise.all([
    getProducts(shopId),
    getSuppliers(shopId),
    getCustomers(shopId),
    db.tasks.where('shopId').equals(shopId).toArray(),
  ]);

  const existingMap = new Map<string, ShopTask>();
  for (const t of existingTasks) {
    existingMap.set(t.id, t);
  }

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const currentTasks: ShopTask[] = [];

  // 2. Generate Low-Stock Tasks
  for (const product of products) {
    if (product.active && product.stockQuantity <= product.minimumStock) {
      const taskId = `low_stock_${product.id}`;
      const existing = existingMap.get(taskId);
      const supplier = product.supplierId ? supplierMap.get(product.supplierId) : undefined;

      const title = `Reorder: ${product.name}`;
      const description = `Only ${product.stockQuantity} ${product.unit} left (Minimum threshold: ${product.minimumStock})${
        supplier ? ` • Supplier: ${supplier.name}` : ''
      }`;

      const suggestedMessage = supplier
        ? `Namaste ${supplier.contactName || supplier.name}! Baithak Paan Shop ko urgent ye saman chahiye: ${product.name} (Stock kam hai: sirf ${product.stockQuantity} ${product.unit} bacha hai). Kripya delivery confirm karein. Dhanyawad!`
        : `Baithak Paan Shop Stock Alert: ${product.name} is running low (${product.stockQuantity} ${product.unit} left).`;

      const task: ShopTask = {
        id: taskId,
        shopId,
        type: 'low_stock',
        title,
        description,
        status: existing?.status || 'pending',
        entityId: product.id,
        recipientName: supplier?.name,
        recipientPhone: supplier?.phone,
        suggestedMessage,
        actionLabel: 'View Stock',
        actionTab: 'inventory',
        completedAt: existing?.completedAt,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      currentTasks.push(task);
    }
  }

  // 3. Generate Khata (Udhaar) Collection Tasks
  for (const customer of customers) {
    if (customer.active && customer.currentBalance > 0) {
      const taskId = `khata_${customer.id}`;
      const existing = existingMap.get(taskId);

      const title = `Collect Udhaar: ${customer.name}`;
      const balanceStr = formatMoney(customer.currentBalance);
      const description = `Outstanding balance: ${balanceStr}${
        customer.phone ? ` • Phone: ${customer.phone}` : ' • No phone recorded'
      }`;

      const suggestedMessage = `Namaste ${customer.name} ji, Baithak Paan Shop se aapka kul udhaar baaki ${balanceStr} hai. Kripya samay par chukta karein. Dhanyawad!`;

      const task: ShopTask = {
        id: taskId,
        shopId,
        type: 'khata_collection',
        title,
        description,
        status: existing?.status || 'pending',
        entityId: customer.id,
        recipientName: customer.name,
        recipientPhone: customer.phone,
        suggestedMessage,
        actionLabel: 'View Ledger',
        actionTab: 'business',
        completedAt: existing?.completedAt,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      currentTasks.push(task);
    }
  }

  // 4. Generate Daily Register Closing Task
  const existingClosing = existingMap.get(`closing_${todayStr}`);
  const closingSummary = await db.daily_summaries
    .where('dateStr')
    .equals(todayStr)
    .first();

  if (!closingSummary || closingSummary.status !== 'closed') {
    const task: ShopTask = {
      id: `closing_${todayStr}`,
      shopId,
      type: 'daily_closing',
      title: 'Daily Register Closing & Cash Count',
      description: "Count the register drawer cash and verify today's transactions.",
      status: existingClosing?.status || 'pending',
      actionLabel: 'Go to Closing',
      actionTab: 'business',
      completedAt: existingClosing?.completedAt,
      createdAt: existingClosing?.createdAt || now,
      updatedAt: now,
    };
    currentTasks.push(task);
  }

  // 5. Persist tasks to Dexie so user toggles and edits are retained
  await db.tasks.bulkPut(currentTasks);

  // 6. Sort: pending first, then by creation date
  return currentTasks.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'pending' ? -1 : 1;
    }
    return b.createdAt - a.createdAt;
  });
}

/**
 * Toggle a task status between pending and completed
 */
export async function toggleTaskStatus(taskId: string, shopId: UUID): Promise<ShopTask> {
  const db = getDB();
  const task = await db.tasks.get(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
  const updated: ShopTask = {
    ...task,
    status: newStatus,
    completedAt: newStatus === 'completed' ? Date.now() : undefined,
    updatedAt: Date.now(),
  };

  await db.tasks.put(updated);
  return updated;
}

/**
 * Update task status explicitly
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  shopId: UUID
): Promise<ShopTask> {
  const db = getDB();
  const task = await db.tasks.get(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const updated: ShopTask = {
    ...task,
    status,
    completedAt: status === 'completed' ? Date.now() : undefined,
    updatedAt: Date.now(),
  };

  await db.tasks.put(updated);
  return updated;
}

/**
 * Batch mark multiple tasks as completed
 */
export async function batchMarkTasksDone(taskIds: string[], shopId: UUID): Promise<void> {
  const db = getDB();
  const now = Date.now();
  await db.transaction('rw', db.tasks, async () => {
    for (const id of taskIds) {
      const task = await db.tasks.get(id);
      if (task) {
        await db.tasks.put({
          ...task,
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        });
      }
    }
  });
}
