'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getExpenses, createExpense, type CreateExpenseInput } from '@/lib/domain/expense';
import {
  getCustomers,
  createCustomer,
  recordCustomerPayment,
  getCustomerLedger,
  buildWhatsAppUrl,
  formatPaymentReceiptMessage,
  type CustomerWithBalance,
} from '@/lib/domain/customer';
import { generateCashReconciliation, type CashReconciliationReport } from '@/lib/domain/reconciliation';
import { getDayOverview, closeDay, type DayOverview } from '@/lib/domain/closing';
import { toPaise, formatMoney } from '@/lib/money';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import { useShop } from '@/contexts/ShopContext';
import type { Expense, CustomerLedgerEntry, ExpenseCategory, UUID } from '@/lib/types';

type BusinessTab = 'expenses' | 'udhaar' | 'reconciliation' | 'closing';

interface PaymentReceiptState {
  customer: CustomerWithBalance;
  amountPaid: number;
  previousBalance: number;
  remainingBalance: number;
}

export default function BusinessScreen({ shopId }: { shopId: UUID }) {
  const { shop } = useShop();
  const [activeTab, setActiveTab] = useState<BusinessTab>('udhaar');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [reconciliation, setReconciliation] = useState<CashReconciliationReport | null>(null);
  const [dayOverview, setDayOverview] = useState<DayOverview | null>(null);
  const [declaredCashInput, setDeclaredCashInput] = useState('');

  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [payingCustomer, setPayingCustomer] = useState<CustomerWithBalance | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerWithBalance | null>(null);
  const [customerLedgerEntries, setCustomerLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceiptState | null>(null);

  // Mobile Back Button handlers: close open modals/sheets before exiting app
  useMobileBackHandler(showAddExpense, () => setShowAddExpense(false), 'biz_add_expense');
  useMobileBackHandler(showAddCustomer, () => setShowAddCustomer(false), 'biz_add_customer');
  useMobileBackHandler(!!payingCustomer, () => setPayingCustomer(null), 'biz_pay_customer');
  useMobileBackHandler(!!viewingCustomer, () => setViewingCustomer(null), 'biz_view_customer');
  useMobileBackHandler(!!paymentReceipt, () => setPaymentReceipt(null), 'biz_payment_receipt');

  // Expense form
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('miscellaneous');
  const [expDesc, setExpDesc] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'upi'>('cash');

  // Customer form
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');

  const loadData = useCallback(async () => {
    const [exps, custs, overview] = await Promise.all([
      getExpenses(shopId, { limit: 50 }),
      getCustomers(shopId),
      getDayOverview(shopId, toPaise(parseFloat(declaredCashInput) || 0)),
    ]);
    setExpenses(exps);
    setCustomers(custs);
    setDayOverview(overview);
    setReconciliation(overview.reconciliation);
  }, [shopId, declaredCashInput]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(expAmount);
    if (!amt || amt <= 0) return;

    await createExpense({
      shopId,
      category: expCategory,
      amount: toPaise(amt),
      description: expDesc,
      paymentMethod: expMethod,
    });

    setExpAmount('');
    setExpDesc('');
    setShowAddExpense(false);
    await loadData();
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!custName.trim()) {
      alert('Customer name is required');
      return;
    }
    const cleanPhone = custPhone.trim().replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number for WhatsApp Khata receipts.');
      return;
    }

    await createCustomer({
      shopId,
      name: custName.trim(),
      phone: custPhone.trim(),
    });

    setCustName('');
    setCustPhone('');
    setShowAddCustomer(false);
    await loadData();
  }

  async function handleCustomerPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payingCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;

    const paidPaise = toPaise(amt);
    const prevBal = payingCustomer.currentBalance;
    const remBal = Math.max(0, prevBal - paidPaise);

    await recordCustomerPayment(
      shopId,
      payingCustomer.id,
      paidPaise,
      'Counter payment received'
    );

    const receipt: PaymentReceiptState = {
      customer: payingCustomer,
      amountPaid: paidPaise,
      previousBalance: prevBal,
      remainingBalance: remBal,
    };

    setPayingCustomer(null);
    setPaymentAmount('');
    await loadData();
    setPaymentReceipt(receipt);
  }

  function handleSendPaymentWhatsApp(receipt: PaymentReceiptState) {
    if (!receipt.customer.phone) return;
    const msg = formatPaymentReceiptMessage({
      customerName: receipt.customer.name,
      shopName: shop?.name || 'Baithak Paan Shop',
      date: new Date(),
      amountPaid: receipt.amountPaid,
      previousBalance: receipt.previousBalance,
      remainingBalance: receipt.remainingBalance,
    });
    const url = buildWhatsAppUrl(receipt.customer.phone, msg);
    if (url) {
      window.open(url, '_blank');
    }
  }

  async function openCustomerStatement(customer: CustomerWithBalance) {
    setViewingCustomer(customer);
    const ledger = await getCustomerLedger(shopId, customer.id);
    setCustomerLedgerEntries(ledger);
  }

  async function handleCloseDay() {
    const declaredPaise = toPaise(parseFloat(declaredCashInput) || 0);
    await closeDay(shopId, declaredPaise, 'Owner');
    await loadData();
    alert('Day closed successfully and summary saved!');
  }

  // Total outstanding udhaar
  const totalOutstandingUdhaar = customers.reduce(
    (sum, c) => sum + Math.max(0, c.currentBalance),
    0
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Navigation tabs */}
      <div className="bg-white border-b border-gray-200 px-3 flex gap-2 overflow-x-auto">
        {(
          [
            { id: 'udhaar' as BusinessTab, label: '📝 Udhaar (Khata)' },
            { id: 'expenses' as BusinessTab, label: '💸 Expenses' },
            { id: 'reconciliation' as BusinessTab, label: '💵 Cash Check' },
            { id: 'closing' as BusinessTab, label: '🌙 Daily Closing' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-900 text-blue-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: Udhaar */}
        {activeTab === 'udhaar' && (
          <div className="space-y-3">
            <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-90">Total Pending Udhaar</div>
                <div className="text-2xl font-black mt-0.5">{formatMoney(totalOutstandingUdhaar)}</div>
              </div>
              <button
                onClick={() => setShowAddCustomer(true)}
                className="bg-white text-amber-900 text-xs font-bold px-3 py-2 rounded-xl shadow hover:bg-amber-50"
              >
                + New Customer
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {customers.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <div className="text-3xl mb-1">📝</div>
                  <div className="text-sm font-medium">No customers added yet</div>
                </div>
              ) : (
                customers.map((c) => (
                  <div key={c.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-500">Phone: {c.phone || 'None'}</div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-black text-sm ${
                          c.currentBalance > 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {formatMoney(c.currentBalance)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {c.currentBalance > 0 ? 'Udhaar Due' : 'Settled'}
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      {c.currentBalance > 0 && (
                        <button
                          onClick={() => setPayingCustomer(c)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm"
                        >
                          Pay
                        </button>
                      )}
                      {c.phone && c.currentBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const msg = `Namaste ${c.name} ji, ${shop?.name || 'Baithak Paan Shop'} se aapka kul udhaar baaki ${formatMoney(c.currentBalance)} hai. Kripya samay par chukta karein. Dhanyawad! 🙏`;
                            const url = buildWhatsAppUrl(c.phone, msg);
                            if (url) window.open(url, '_blank');
                          }}
                          title="Send WhatsApp Khata Reminder"
                          className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs px-2 py-1.5 rounded-lg font-bold flex items-center"
                        >
                          <span>💬</span>
                        </button>
                      )}
                      <button
                        onClick={() => openCustomerStatement(c)}
                        className="border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                      >
                        Ledger
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Expenses */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800 text-sm">Shop Expenses</span>
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Record Expense
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {expenses.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <div className="text-3xl mb-1">💸</div>
                  <div className="text-sm font-medium">No expenses recorded</div>
                </div>
              ) : (
                expenses.map((e) => (
                  <div key={e.id} className="p-3.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-900 capitalize">{e.category}</div>
                      <div className="text-xs text-gray-500">
                        {e.description || 'No note'} • {e.paymentMethod.toUpperCase()} •{' '}
                        {new Date(e.expenseDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="font-bold text-sm text-red-600">−{formatMoney(e.amount)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Cash Reconciliation */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
              <div className="font-bold text-base text-gray-900">End-of-Day Cash Drawer Check</div>
              <div className="text-xs text-gray-500">
                Count the physical cash in your drawer and enter it below. BaithakOS compares it against recorded transactions.
              </div>

              <div className="flex gap-2 items-center pt-2">
                <input
                  type="number"
                  value={declaredCashInput}
                  onChange={(e) => setDeclaredCashInput(e.target.value)}
                  placeholder="Actual Cash in Drawer (₹)"
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {reconciliation && (
                <div className="pt-3 border-t border-gray-100 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Opening Cash Drawer:</span>
                    <span>{formatMoney(reconciliation.openingCash)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>+ Cash Sales:</span>
                    <span className="text-green-700 font-bold">+{formatMoney(reconciliation.cashSales)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>+ Cash Udhaar Collected:</span>
                    <span className="text-green-700 font-bold">+{formatMoney(reconciliation.cashUdhaarCollected)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>− Cash Expenses:</span>
                    <span className="text-red-600 font-bold">−{formatMoney(reconciliation.cashExpenses)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>− Cash Refunds:</span>
                    <span className="text-red-600 font-bold">−{formatMoney(reconciliation.cashRefunds)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t">
                    <span>Expected Cash in Drawer:</span>
                    <span>{formatMoney(reconciliation.expectedCash)}</span>
                  </div>

                  {declaredCashInput && (
                    <div
                      className={`p-3 rounded-xl mt-3 ${
                        reconciliation.isBalanced
                          ? 'bg-green-50 text-green-900 border border-green-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      <div className="font-bold text-sm flex justify-between">
                        <span>{reconciliation.isBalanced ? '✓ Drawer Balanced' : 'Cash Mismatch'}</span>
                        <span>{formatMoney(reconciliation.difference)}</span>
                      </div>

                      {!reconciliation.isBalanced && reconciliation.possibleCauses.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs">
                          <div className="font-semibold text-amber-800">Possible Causes (from recorded data):</div>
                          {reconciliation.possibleCauses.map((c, idx) => (
                            <div key={idx} className="text-amber-700">• {c.description}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Daily Closing */}
        {activeTab === 'closing' && dayOverview && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="font-black text-lg text-gray-900">Today's Summary</div>
                  <div className="text-xs text-gray-500">{dayOverview.dateStr}</div>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                    dayOverview.summaryRecord?.status === 'closed'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {dayOverview.summaryRecord?.status === 'closed' ? 'Closed' : 'Open'}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-xl">
                  <div className="text-xs text-gray-500">Total Revenue</div>
                  <div className="text-lg font-black text-blue-900">
                    {formatMoney(dayOverview.totalSales)}
                  </div>
                  <div className="text-xs text-gray-400">{dayOverview.totalTransactions} bills</div>
                </div>

                <div className="bg-gray-50 p-3 rounded-xl">
                  <div className="text-xs text-gray-500">Gross Margin</div>
                  <div className="text-lg font-black text-green-700">
                    {formatMoney(dayOverview.estimatedGrossProfit)}
                  </div>
                  <div className="text-xs text-gray-400">Est. Profit</div>
                </div>

                <div className="bg-gray-50 p-3 rounded-xl">
                  <div className="text-xs text-gray-500">Cash vs UPI</div>
                  <div className="text-sm font-bold text-gray-800 mt-1">
                    Cash: {formatMoney(dayOverview.cashSales)}
                  </div>
                  <div className="text-xs text-gray-500">UPI: {formatMoney(dayOverview.upiSales)}</div>
                </div>

                <div className="bg-gray-50 p-3 rounded-xl">
                  <div className="text-xs text-gray-500">Udhaar Movement</div>
                  <div className="text-sm font-bold text-amber-700 mt-1">
                    Added: {formatMoney(dayOverview.udhaarSales)}
                  </div>
                  <div className="text-xs text-green-600">
                    Recv: {formatMoney(dayOverview.udhaarCollected)}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCloseDay}
                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl text-sm shadow transition-transform active:scale-98"
              >
                🌙 Confirm & Close Today
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Record Expense Modal */}
      {showAddExpense && (
        <div
          onClick={() => setShowAddExpense(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateExpense}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">Record Shop Expense</div>
            <input
              type="number"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="Amount (₹) *"
              required
              className="w-full border rounded-xl px-3 py-2 text-base font-semibold"
            />
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as any)}
              className="w-full border rounded-xl px-3 py-2 text-sm capitalize"
            >
              {[
                'miscellaneous',
                'rent',
                'electricity',
                'staff',
                'transportation',
                'maintenance',
                'purchase',
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Description (e.g. Chai, Sweeper, Tape)"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              {(['cash', 'upi'] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setExpMethod(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                    expMethod === m ? 'bg-blue-900 text-white' : 'bg-gray-50'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddExpense(false)}
                className="flex-1 border py-2.5 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div
          onClick={() => setShowAddCustomer(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCustomer}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">Add Udhaar Customer</div>
            <input
              type="text"
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="Customer Full Name *"
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="tel"
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="Mobile / WhatsApp Number (10 digits) *"
              required
              maxLength={15}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <div className="text-[11px] text-gray-500">
              📱 Mobile number is used to send automated WhatsApp Udhaar receipts and balance updates.
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCustomer(false)}
                className="flex-1 border py-2.5 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Payment Modal */}
      {payingCustomer && (
        <div
          onClick={() => setPayingCustomer(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCustomerPayment}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">
              Receive Payment: {payingCustomer.name}
            </div>
            <div className="text-xs text-gray-500">
              Current Due: <span className="font-bold text-red-600">{formatMoney(payingCustomer.currentBalance)}</span>
            </div>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Payment Amount (₹) *"
              required
              min="1"
              className="w-full border rounded-xl px-3 py-2 text-base font-semibold"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingCustomer(null)}
                className="flex-1 border py-2.5 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Record Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Receipt Modal */}
      {paymentReceipt && (
        <div
          onClick={() => setPaymentReceipt(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl cursor-default animate-in fade-in"
          >
            <div className="text-center border-b pb-3">
              <div className="text-3xl mb-1">✅</div>
              <div className="font-bold text-lg text-gray-900">Payment Recorded</div>
              <div className="text-xs text-gray-500">{paymentReceipt.customer.name}</div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Jama Rashi (Paid):</span>
                <span className="font-bold text-green-700">{formatMoney(paymentReceipt.amountPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pichla Baaki (Previous Due):</span>
                <span className="font-semibold text-gray-700">{formatMoney(paymentReceipt.previousBalance)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold">
                <span className="text-gray-700">Bacha Hua Baaki (Remaining):</span>
                <span className={paymentReceipt.remainingBalance > 0 ? 'text-red-600' : 'text-green-700'}>
                  {formatMoney(paymentReceipt.remainingBalance)}
                </span>
              </div>
            </div>

            {paymentReceipt.customer.phone && (
              <button
                type="button"
                onClick={() => handleSendPaymentWhatsApp(paymentReceipt)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow"
              >
                <span>💬</span>
                <span>Send WhatsApp Payment Receipt</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPaymentReceipt(null)}
              className="w-full border border-gray-300 py-2 rounded-xl font-bold text-xs text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Customer Statement / Ledger Modal */}
      {viewingCustomer && (
        <div
          onClick={() => setViewingCustomer(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3 shadow-xl max-h-[85vh] flex flex-col cursor-default"
          >
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <div className="font-bold text-base text-gray-900">{viewingCustomer.name}</div>
                <div className="text-xs text-gray-500">Khata Statement</div>
              </div>
              <button
                onClick={() => setViewingCustomer(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs divide-y divide-gray-50">
              {customerLedgerEntries.length === 0 ? (
                <div className="text-center text-gray-400 py-6">No ledger entries recorded</div>
              ) : (
                customerLedgerEntries.map((e) => (
                  <div key={e.id} className="pt-2 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-gray-800">
                        {e.type === 'sale' ? 'Purchase on Udhaar' : 'Payment Received'}
                      </div>
                      <div className="text-gray-400 text-[11px]">
                        {new Date(e.createdAt).toLocaleDateString()} • {e.note || ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-bold ${
                          e.amount > 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {e.amount > 0 ? `+${formatMoney(e.amount)}` : formatMoney(e.amount)}
                      </div>
                      <div className="text-gray-400 text-[11px]">Bal: {formatMoney(e.runningBalance)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t pt-3 flex justify-between font-bold text-sm">
              <span>Final Outstanding:</span>
              <span className="text-red-600">{formatMoney(viewingCustomer.currentBalance)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
