/**
 * BaithakOS — Expense Domain Service
 */

import { getDB } from '@/lib/db';
import { appendToOutbox } from '@/lib/sync/outbox';
import { getDeviceId } from '@/lib/device';
import { assertPaise } from '@/lib/money';
import type { Expense, ExpenseCategory, UUID } from '@/lib/types';

export interface CreateExpenseInput {
  shopId: UUID;
  category: ExpenseCategory;
  amount: number; // paise
  description?: string;
  paymentMethod?: 'cash' | 'upi' | 'bank_transfer';
  expenseDate?: number;
  recordedBy?: string;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  if (!input.shopId) throw new Error('shopId is required');
  assertPaise(input.amount, 'amount');
  if (input.amount <= 0) throw new Error('Expense amount must be greater than 0');

  const db = getDB();
  const now = Date.now();
  const expenseId = crypto.randomUUID();

  const expense: Expense = {
    id: expenseId,
    shopId: input.shopId,
    category: input.category,
    amount: input.amount,
    description: input.description?.trim(),
    paymentMethod: input.paymentMethod ?? 'cash',
    expenseDate: input.expenseDate ?? now,
    recordedBy: input.recordedBy,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.expenses, db.sync_outbox, db.audit_logs], async () => {
    await db.expenses.add(expense);

    await appendToOutbox({
      db,
      shopId: input.shopId,
      entityType: 'expense',
      entityId: expenseId,
      operation: 'create',
      payload: { expense },
    });

    await db.audit_logs.add({
      id: crypto.randomUUID(),
      shopId: input.shopId,
      deviceId: getDeviceId(),
      entityType: 'expense',
      entityId: expenseId,
      operation: 'create',
      payload: { category: input.category, amount: input.amount, method: expense.paymentMethod },
      createdAt: now,
    });
  });

  return expense;
}

export async function getExpenses(
  shopId: UUID,
  opts?: { limit?: number; category?: ExpenseCategory }
): Promise<Expense[]> {
  const db = getDB();
  let query = db.expenses.where('shopId').equals(shopId);
  const results = await query.reverse().sortBy('expenseDate');
  let filtered = results;
  if (opts?.category) {
    filtered = filtered.filter((e) => e.category === opts.category);
  }
  return opts?.limit ? filtered.slice(0, opts.limit) : filtered;
}

export async function getExpensesForDay(shopId: UUID, dayStartTs: number, dayEndTs: number): Promise<Expense[]> {
  const db = getDB();
  const all = await db.expenses.where('shopId').equals(shopId).toArray();
  return all.filter((e) => e.expenseDate >= dayStartTs && e.expenseDate <= dayEndTs);
}
