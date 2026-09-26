'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getProducts } from '@/lib/domain/product';
import { createSale } from '@/lib/domain/sale';
import { formatMoney, multiplyMoney, sumMoney } from '@/lib/money';
import type { SaleItemInput } from '@/lib/domain/sale';
import type { Product, UUID } from '@/lib/types';

interface CartItem {
  product: Product;
  quantity: number;
}

export default function POSScreen({ shopId }: { shopId: UUID }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [status, setStatus] = useState<'idle' | 'completing' | 'success' | 'error'>('idle');
  const [lastSaleTotal, setLastSaleTotal] = useState<number>(0);
  const [lastChange, setLastChange] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState('');

  const loadProducts = useCallback(async () => {
    const prods = await getProducts(shopId);
    setProducts(prods);
  }, [shopId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Filter products by search
  const filtered = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : products;

  // Cart management
  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
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
        prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i)),
      );
    }
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  // Totals
  const cartTotal = sumMoney(
    cart.map((i) => multiplyMoney(i.product.sellingPrice, i.quantity)),
  );

  const cashReceivedPaise = cashReceived ? Math.round(parseFloat(cashReceived) * 100) : 0;
  const change = Math.max(0, cashReceivedPaise - cartTotal);

  async function completeSale() {
    if (cart.length === 0) return;
    setStatus('completing');
    setErrorMsg('');

    try {
      const items: SaleItemInput[] = cart.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.sellingPrice,
      }));

      const result = await createSale({
        shopId,
        paymentMethod,
        items,
        cashReceived: paymentMethod === 'cash' && cashReceived
          ? cashReceivedPaise
          : undefined,
      });

      setLastSaleTotal(result.sale.total);
      setLastChange(result.sale.changeGiven ?? 0);
      setCart([]);
      setCashReceived('');
      setSearch('');
      setStatus('success');
      await loadProducts(); // refresh stock display

      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setErrorMsg('Could not complete sale. Please try again.');
      setStatus('error');
      console.error(err);
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-6xl mb-4">✓</div>
        <div className="text-2xl font-bold text-green-700 mb-1">Sale Complete!</div>
        <div className="text-3xl font-bold text-gray-900 mb-2">{formatMoney(lastSaleTotal)}</div>
        {lastChange > 0 && (
          <div className="text-lg text-gray-600">
            Change: <span className="font-bold text-green-600">{formatMoney(lastChange)}</span>
          </div>
        )}
        <div className="text-gray-400 text-sm mt-4">Starting next sale…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="p-3 bg-white border-b border-gray-100">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              {products.length === 0 ? (
                <div>
                  <div className="text-4xl mb-3">📦</div>
                  <div className="font-medium">No products yet</div>
                  <div className="text-sm mt-1">Go to Products tab to add your first product</div>
                </div>
              ) : (
                <div>No products found</div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all shadow-sm min-h-[70px] flex flex-col justify-between"
              >
                <div className="font-medium text-sm text-gray-900 leading-tight line-clamp-2">
                  {product.name}
                </div>
                <div className="text-blue-700 font-bold text-base mt-1">
                  {formatMoney(product.sellingPrice)}
                </div>
                <div className="text-gray-400 text-xs">Stock: {product.stockQuantity}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart & Checkout */}
        {cart.length > 0 && (
          <div className="bg-white border-t md:border-t-0 md:border-l border-gray-200 md:w-80 flex flex-col">
            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Cart ({cart.length})
              </div>
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.product.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatMoney(item.product.sellingPrice)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-200 active:scale-90"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-bold text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-200 active:scale-90"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 active:scale-90 ml-1"
                    >
                      ×
                    </button>
                  </div>
                  <div className="w-16 text-right font-bold text-gray-900 text-sm">
                    {formatMoney(multiplyMoney(item.product.sellingPrice, item.quantity))}
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout Panel */}
            <div className="border-t border-gray-100 p-3 space-y-3">
              {/* Total */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600 font-medium">Total</span>
                <span className="text-2xl font-bold text-gray-900">{formatMoney(cartTotal)}</span>
              </div>

              {/* Payment Method */}
              <div className="flex gap-2">
                {(['cash', 'upi'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 py-2 rounded-xl font-medium text-sm transition-colors ${
                      paymentMethod === method
                        ? 'bg-blue-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {method === 'cash' ? '💵 Cash' : '📱 UPI'}
                  </button>
                ))}
              </div>

              {/* Cash received */}
              {paymentMethod === 'cash' && (
                <div>
                  <input
                    type="number"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="Cash received (₹)"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.50"
                  />
                  {cashReceivedPaise > 0 && change >= 0 && (
                    <div className="flex justify-between text-sm mt-1 px-1">
                      <span className="text-gray-500">Change</span>
                      <span className={`font-bold ${change > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                        {formatMoney(change)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {status === 'error' && (
                <div className="bg-red-50 text-red-700 rounded-xl px-3 py-2 text-sm" role="alert">
                  {errorMsg}
                </div>
              )}

              {/* Complete Sale Button */}
              <button
                onClick={completeSale}
                disabled={status === 'completing'}
                className="w-full bg-green-600 text-white font-bold py-4 rounded-2xl text-lg shadow hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60"
              >
                {status === 'completing' ? 'Saving…' : `✓ Complete Sale`}
              </button>

              {/* Clear cart */}
              <button
                onClick={() => setCart([])}
                className="w-full text-gray-400 text-sm py-1 hover:text-gray-600"
              >
                Clear cart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
