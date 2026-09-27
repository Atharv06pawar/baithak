'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getProducts } from '@/lib/domain/product';
import { createSale } from '@/lib/domain/sale';
import {
  getCustomers,
  createCustomer,
  updateCustomerPhone,
  formatUdhaarReceiptMessage,
  buildWhatsAppUrl,
  type CustomerWithBalance,
} from '@/lib/domain/customer';
import { formatMoney, multiplyMoney, sumMoney, toPaise } from '@/lib/money';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import { useShop } from '@/contexts/ShopContext';
import type { SaleItemInput } from '@/lib/domain/sale';
import type { Product, Sale, UUID } from '@/lib/types';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CompletedSaleState {
  sale: Sale;
  items: CartItem[];
  customer?: CustomerWithBalance;
  previousBalance?: number;
  newBalance?: number;
}

export default function POSScreen({ shopId }: { shopId: UUID }) {
  const { shop } = useShop();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'udhaar'>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [quickPhoneInput, setQuickPhoneInput] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [discountRupees, setDiscountRupees] = useState('');
  const [status, setStatus] = useState<'idle' | 'completing' | 'error'>('idle');
  const [completedSale, setCompletedSale] = useState<CompletedSaleState | null>(null);
  const [whatsAppSent, setWhatsAppSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Mobile Back Button handlers: close sheets/modals before exiting app
  useMobileBackHandler(isMobileCartOpen, () => setIsMobileCartOpen(false), 'pos_cart');
  useMobileBackHandler(!!completedSale, () => setCompletedSale(null), 'pos_receipt');
  useMobileBackHandler(showAddCustomer, () => setShowAddCustomer(false), 'pos_add_customer');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [prods, custs] = await Promise.all([
      getProducts(shopId),
      getCustomers(shopId),
    ]);
    setProducts(prods);
    setCustomers(custs);
  }, [shopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcuts (Enter to add first match if exact or 1 item, Esc to clear search)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearch('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter products by search
  const filtered = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  // Quick buttons (first 6 active products)
  const quickProducts = products.slice(0, 6);

  // Cart operations
  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
      );
    }
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  // Totals calculation
  const subtotal = sumMoney(
    cart.map((i) => multiplyMoney(i.product.sellingPrice, i.quantity))
  );

  const discountPaise = discountRupees ? toPaise(Math.max(0, parseFloat(discountRupees) || 0)) : 0;
  const total = Math.max(0, subtotal - discountPaise);

  const cashReceivedPaise = cashReceived ? toPaise(parseFloat(cashReceived) || 0) : 0;
  const change = Math.max(0, cashReceivedPaise - total);

  async function handleCreateQuickCustomer() {
    if (!newCustomerName.trim()) {
      setErrorMsg('Customer name is required');
      return;
    }
    const cleanPhone = newCustomerPhone.trim().replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg('Valid 10-digit mobile number is required for WhatsApp Khata receipts');
      return;
    }

    try {
      const created = await createCustomer({
        shopId,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
      });
      const withBal: CustomerWithBalance = { ...created, currentBalance: 0 };
      setCustomers((prev) => [...prev, withBal]);
      setSelectedCustomerId(created.id);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowAddCustomer(false);
      setErrorMsg('');
    } catch (err) {
      console.error('Failed to create customer:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add customer');
    }
  }

  async function handleSaveCustomerPhone(customerId: UUID, phone: string) {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    try {
      const updated = await updateCustomerPhone(shopId, customerId, phone.trim());
      setCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? { ...c, phone: updated.phone } : c))
      );
      if (completedSale?.customer?.id === customerId) {
        const updatedSaleData: CompletedSaleState = {
          ...completedSale,
          customer: { ...completedSale.customer, phone: updated.phone },
        };
        setCompletedSale(updatedSaleData);
        handleSendWhatsApp(updatedSaleData);
      }
      setQuickPhoneInput('');
    } catch (err) {
      alert('Failed to update phone: ' + (err instanceof Error ? err.message : 'Error'));
    }
  }

  function handleSendWhatsApp(saleData: CompletedSaleState) {
    if (!saleData.customer?.phone) return;
    const msg = formatUdhaarReceiptMessage({
      customerName: saleData.customer.name,
      shopName: shop?.name || 'Baithak Paan Shop',
      billNumber: saleData.sale.saleNumber,
      date: new Date(saleData.sale.createdAt),
      items: saleData.items.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        lineTotal: multiplyMoney(i.product.sellingPrice, i.quantity),
      })),
      purchaseAmount: saleData.sale.total,
      previousBalance: saleData.previousBalance ?? 0,
      newBalance: saleData.newBalance ?? saleData.sale.total,
    });

    const url = buildWhatsAppUrl(saleData.customer.phone, msg);
    if (url) {
      window.open(url, '_blank');
      setWhatsAppSent(true);
    }
  }

  async function completeSale() {
    if (cart.length === 0) return;
    if (paymentMethod === 'udhaar' && !selectedCustomerId) {
      setErrorMsg('Please select a customer for Udhaar sale');
      return;
    }

    setStatus('completing');
    setErrorMsg('');

    try {
      const items: SaleItemInput[] = cart.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.sellingPrice,
      }));

      const selectedCust =
        paymentMethod === 'udhaar'
          ? customers.find((c) => c.id === selectedCustomerId)
          : undefined;
      const prevBal = selectedCust ? selectedCust.currentBalance : 0;

      const result = await createSale({
        shopId,
        paymentMethod,
        customerId: paymentMethod === 'udhaar' ? selectedCustomerId : undefined,
        discountAmount: discountPaise > 0 ? discountPaise : undefined,
        items,
        cashReceived:
          paymentMethod === 'cash' && cashReceived ? cashReceivedPaise : undefined,
      });

      const newBal = prevBal + result.sale.total;
      const saleData: CompletedSaleState = {
        sale: result.sale,
        items: [...cart],
        customer: selectedCust,
        previousBalance: prevBal,
        newBalance: newBal,
      };

      setCompletedSale(saleData);
      setWhatsAppSent(false);
      setCart([]);
      setIsMobileCartOpen(false);
      setCashReceived('');
      setDiscountRupees('');
      setSearch('');
      setStatus('idle');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not complete sale';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Top Search & Quick Bar */}
      <div className="p-3 bg-white border-b border-gray-200 space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search products (type or tap below)…"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-gray-400 hover:text-gray-600 px-2 py-1 text-sm font-semibold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Taps (Top 6 Fast-sellers) */}
        {!search && quickProducts.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-gray-400 self-center uppercase pr-1">
              Quick:
            </span>
            {quickProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="flex-shrink-0 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-blue-100 active:scale-95 transition-transform"
              >
                {p.name.split(' ')[0]} ({formatMoney(p.sellingPrice)})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main split: Product Grid (left) + Cart & Checkout (right) */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 mt-12">
              <div className="text-4xl mb-2">📦</div>
              <div className="font-medium">No products found</div>
              <div className="text-sm mt-1">Add items from the Products tab</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filtered.map((product) => {
                const isOutOfStock = product.stockQuantity <= 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`bg-white border rounded-xl p-3 text-left transition-all shadow-sm flex flex-col justify-between min-h-[82px] active:scale-95 ${
                      isOutOfStock
                        ? 'border-red-200 bg-red-50/30'
                        : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-900 leading-snug line-clamp-2">
                        {product.name}
                      </div>
                      <div className="text-xs text-gray-400 capitalize">{product.unit}</div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-blue-900 font-bold text-base">
                        {formatMoney(product.sellingPrice)}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          isOutOfStock
                            ? 'bg-red-100 text-red-700'
                            : product.stockQuantity <= product.minimumStock
                            ? 'bg-amber-100 text-amber-700'
                            : 'text-gray-500'
                        }`}
                      >
                        {isOutOfStock ? 'Out' : `${product.stockQuantity}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Mobile Cart Bar when items are present and drawer is closed */}
        {!isMobileCartOpen && cart.length > 0 && (
          <div className="md:hidden fixed bottom-[60px] left-0 right-0 p-2.5 z-40 bg-gradient-to-t from-gray-900/30 to-transparent pointer-events-none">
            <div className="bg-blue-900 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between pointer-events-auto border border-blue-700 animate-in fade-in slide-in-from-bottom duration-150">
              <div>
                <div className="text-[11px] text-blue-200 font-medium">
                  {cart.reduce((s, i) => s + i.quantity, 0)} item(s) in cart
                </div>
                <div className="text-xl font-black">{formatMoney(total)}</div>
              </div>
              <button
                onClick={() => setIsMobileCartOpen(true)}
                className="bg-green-600 hover:bg-green-500 active:scale-95 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-transform flex items-center gap-1.5"
              >
                <span>View Cart & Pay</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* Cart & Checkout Panel (Side-by-side on desktop, full-screen overlay sheet on mobile) */}
        <div
          className={`${
            isMobileCartOpen
              ? 'fixed inset-0 z-50 flex flex-col bg-white md:static md:z-auto'
              : 'hidden md:flex'
          } md:w-96 flex-col bg-white border-t md:border-t-0 md:border-l border-gray-200 shadow-sm`}
        >
          {/* Cart Header */}
          <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 md:bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="md:hidden text-blue-900 font-bold text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-lg shadow-sm"
              >
                ← Back
              </button>
              <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setCart([]);
                  setIsMobileCartOpen(false);
                }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-3xl mb-1">🛒</div>
                <div className="text-sm font-medium">Cart is empty</div>
                <div className="text-xs mt-0.5">Tap products on the left to add</div>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {item.product.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatMoney(item.product.sellingPrice)} each
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 text-gray-800 font-bold flex items-center justify-center hover:bg-gray-200 active:scale-90"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-bold text-sm text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 text-gray-800 font-bold flex items-center justify-center hover:bg-gray-200 active:scale-90"
                    >
                      +
                    </button>
                  </div>

                  <div className="w-16 text-right font-bold text-sm text-gray-900">
                    {formatMoney(multiplyMoney(item.product.sellingPrice, item.quantity))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout Controls */}
          {cart.length > 0 && (
            <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50/50">
              {/* Discount Row */}
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-gray-600 font-medium">Discount (₹):</span>
                <input
                  type="number"
                  value={discountRupees}
                  onChange={(e) => setDiscountRupees(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="1"
                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Totals */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                <span className="text-base font-semibold text-gray-700">Total</span>
                <span className="text-2xl font-black text-gray-900">{formatMoney(total)}</span>
              </div>

              {/* Payment Methods */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['cash', 'upi', 'udhaar'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                      paymentMethod === method
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {method === 'cash' ? '💵 Cash' : method === 'upi' ? '📱 UPI' : '📝 Udhaar'}
                  </button>
                ))}
              </div>

              {/* Udhaar Customer Picker */}
              {paymentMethod === 'udhaar' && (
                <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  <div className="text-xs font-semibold text-amber-900 flex justify-between">
                    <span>Select Customer for Udhaar:</span>
                    <button
                      onClick={() => setShowAddCustomer(!showAddCustomer)}
                      className="text-blue-700 font-bold hover:underline"
                    >
                      {showAddCustomer ? 'Select Existing' : '+ New Customer'}
                    </button>
                  </div>

                  {showAddCustomer ? (
                    <div className="space-y-1.5 p-2 bg-white rounded-xl border border-amber-200">
                      <div className="text-[11px] font-bold text-gray-800">New Khata Member:</div>
                      <input
                        type="text"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        placeholder="Customer Full Name *"
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-900"
                      />
                      <input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        placeholder="Mobile / WhatsApp No (e.g. 9876543210) *"
                        maxLength={15}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-900"
                      />
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddCustomer(false);
                            setNewCustomerName('');
                            setNewCustomerPhone('');
                          }}
                          className="flex-1 border border-gray-300 text-gray-600 font-bold text-xs py-1.5 rounded-lg bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateQuickCustomer}
                          className="flex-1 bg-blue-900 text-white font-bold text-xs py-1.5 rounded-lg shadow-sm"
                        >
                          Add & Select
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-800 font-medium"
                      >
                        <option value="">-- Choose Customer --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : '(No phone)'} — Due: {formatMoney(c.currentBalance)}
                          </option>
                        ))}
                      </select>

                      {/* Phone prompt if selected customer has no mobile number */}
                      {selectedCustomerId &&
                        (() => {
                          const cust = customers.find((c) => c.id === selectedCustomerId);
                          if (!cust) return null;
                          if (!cust.phone) {
                            return (
                              <div className="text-[11px] text-amber-900 bg-amber-100/80 p-2 rounded-lg space-y-1">
                                <div className="font-semibold">⚠️ No mobile number saved for {cust.name}.</div>
                                <div className="flex gap-1">
                                  <input
                                    type="tel"
                                    placeholder="Enter 10-digit mobile"
                                    value={quickPhoneInput}
                                    onChange={(e) => setQuickPhoneInput(e.target.value)}
                                    className="flex-1 border border-amber-300 rounded px-2 py-0.5 text-xs bg-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCustomerPhone(cust.id, quickPhoneInput)}
                                    className="bg-amber-800 text-white font-bold px-2.5 py-0.5 rounded text-[11px]"
                                  >
                                    Save Phone
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="text-[11px] text-green-700 flex items-center gap-1 font-medium">
                              <span>✓ WhatsApp receipt will be sent to {cust.phone}</span>
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </div>
              )}

              {/* Cash Tendered & Change */}
              {paymentMethod === 'cash' && (
                <div className="space-y-1">
                  <input
                    type="number"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="Cash Received (₹)"
                    min="0"
                    step="1"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                  {cashReceivedPaise > 0 && (
                    <div className="flex justify-between text-xs px-1 font-semibold">
                      <span className="text-gray-500">Change to return:</span>
                      <span className={change > 0 ? 'text-green-700 text-sm' : 'text-gray-700'}>
                        {formatMoney(change)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="bg-red-50 text-red-700 rounded-xl px-3 py-2 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Complete Sale Button */}
              <button
                onClick={completeSale}
                disabled={status === 'completing'}
                className="w-full bg-green-600 hover:bg-green-700 active:scale-98 text-white font-black py-3.5 rounded-2xl text-lg shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {status === 'completing' ? 'Saving…' : `✓ Complete Sale • ${formatMoney(total)}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Digital Receipt Modal */}
      {completedSale && (
        <div
          onClick={() => setCompletedSale(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in fade-in duration-200 cursor-default"
          >
            <div className="text-center border-b pb-3">
              <div className="text-4xl mb-1">🧾</div>
              <div className="font-black text-xl text-gray-900">Sale Complete</div>
              <div className="text-xs text-gray-500">
                Receipt #{completedSale.sale.saleNumber} •{' '}
                {new Date(completedSale.sale.createdAt).toLocaleTimeString()}
              </div>
            </div>

            {/* Receipt Items */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs border-b pb-3">
              {completedSale.items.map((i) => (
                <div key={i.product.id} className="flex justify-between">
                  <span className="text-gray-800 font-medium">
                    {i.product.name} × {i.quantity}
                  </span>
                  <span className="font-bold text-gray-900">
                    {formatMoney(multiplyMoney(i.product.sellingPrice, i.quantity))}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between font-bold text-sm">
                <span>{completedSale.sale.paymentMethod === 'udhaar' ? 'Bill Amount:' : 'Total Paid:'}</span>
                <span className="text-base text-blue-900">
                  {formatMoney(completedSale.sale.total)}
                </span>
              </div>
              <div className="flex justify-between text-gray-500 capitalize">
                <span>Payment Method:</span>
                <span className="font-semibold text-gray-800">{completedSale.sale.paymentMethod}</span>
              </div>
              {(completedSale.sale.changeGiven ?? 0) > 0 && (
                <div className="flex justify-between font-bold text-green-700">
                  <span>Change Given:</span>
                  <span>{formatMoney(completedSale.sale.changeGiven!)}</span>
                </div>
              )}
            </div>

            {/* Udhaar Khata Customer Summary & 1-Tap WhatsApp */}
            {completedSale.sale.paymentMethod === 'udhaar' && completedSale.customer && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-amber-900 border-b border-amber-200 pb-1.5">
                  <span>📖 Khata (Udhaar) Updated</span>
                  <span className="font-semibold text-gray-700">{completedSale.customer.name}</span>
                </div>

                <div className="space-y-1 text-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pichla Baaki (Previous Balance):</span>
                    <span className="font-semibold">{formatMoney(completedSale.previousBalance ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-blue-900 font-bold">
                    <span>Is Bill Ka Udhaar (This Purchase):</span>
                    <span>+{formatMoney(completedSale.sale.total)}</span>
                  </div>
                  <div className="flex justify-between border-t border-amber-200 pt-1 font-black text-red-600 text-sm">
                    <span>Kul Naya Baaki (Total Due Now):</span>
                    <span>{formatMoney(completedSale.newBalance ?? completedSale.sale.total)}</span>
                  </div>
                </div>

                {/* WhatsApp Action */}
                {completedSale.customer.phone ? (
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(completedSale)}
                    className="w-full mt-2 bg-green-600 hover:bg-green-700 active:scale-98 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-transform"
                  >
                    <span>💬</span>
                    <span>
                      {whatsAppSent
                        ? '✓ WhatsApp Sent (Tap to Resend)'
                        : `Send WhatsApp Receipt to ${completedSale.customer.name}`}
                    </span>
                  </button>
                ) : (
                  <div className="mt-2 space-y-1.5 pt-1 border-t border-amber-200">
                    <div className="text-[11px] font-semibold text-amber-900">
                      ⚠️ Mobile number not saved. Enter number to send WhatsApp receipt:
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="tel"
                        value={quickPhoneInput}
                        onChange={(e) => setQuickPhoneInput(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="flex-1 border border-amber-300 rounded-lg px-2 py-1 text-xs bg-white text-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCustomerPhone(completedSale.customer!.id, quickPhoneInput)}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-3 py-1 rounded-lg shadow-sm"
                      >
                        Save & Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 border border-gray-300 py-2.5 rounded-xl font-bold text-xs text-gray-700 hover:bg-gray-50"
              >
                🖨️ Print
              </button>
              <button
                onClick={() => setCompletedSale(null)}
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Next Sale →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
