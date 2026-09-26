'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getProducts, createProduct, updateProduct } from '@/lib/domain/product';
import { toPaise, formatMoney } from '@/lib/money';
import type { Product, UUID } from '@/lib/types';

type Mode = 'list' | 'add';

export default function ProductManager({ shopId }: { shopId: UUID }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [mode, setMode] = useState<Mode>('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [unit, setUnit] = useState('piece');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prods = await getProducts(shopId);
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setName('');
    setSellingPrice('');
    setPurchasePrice('');
    setStock('0');
    setMinStock('5');
    setUnit('piece');
    setError('');
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const sp = parseFloat(sellingPrice);
    const pp = parseFloat(purchasePrice) || 0;

    if (!name.trim()) { setError('Product name is required.'); return; }
    if (isNaN(sp) || sp < 0) { setError('Please enter a valid selling price.'); return; }

    setSaving(true);
    try {
      await createProduct({
        shopId,
        name: name.trim(),
        sellingPrice: toPaise(sp),
        purchasePrice: toPaise(pp),
        stockQuantity: parseInt(stock) || 0,
        minimumStock: parseInt(minStock) || 5,
        unit,
      });
      resetForm();
      setMode('list');
      await load();
    } catch (err) {
      setError('Could not save product. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    await updateProduct(product.id, shopId, { active: !product.active });
    await load();
  }

  if (mode === 'add') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b flex items-center gap-3">
          <button
            onClick={() => { setMode('list'); resetForm(); }}
            className="text-blue-700 font-medium text-sm"
          >
            ← Cancel
          </button>
          <div className="font-semibold text-gray-900">Add Product</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Meetha Paan"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₹) *</label>
                <input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.50"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price (₹)</label>
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.50"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Stock</label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Alert</label>
                <input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {['piece', 'packet', 'bottle', 'kg', 'g', 'ml', 'litre', 'box'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-900 text-white font-bold py-4 rounded-2xl text-lg shadow hover:bg-blue-800 active:scale-95 transition-all disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-white flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Products</div>
          <div className="text-sm text-gray-500">{products.length} products</div>
        </div>
        <button
          onClick={() => setMode('add')}
          className="bg-blue-900 text-white font-medium px-4 py-2 rounded-xl text-sm hover:bg-blue-800 active:scale-95 transition-all"
        >
          + Add Product
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-8 text-center text-gray-400">Loading…</div>}

        {!loading && products.length === 0 && (
          <div className="text-center text-gray-400 mt-16 px-8">
            <div className="text-4xl mb-3">📦</div>
            <div className="font-medium mb-1">No products yet</div>
            <div className="text-sm">Add your first product to start selling</div>
          </div>
        )}

        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 text-sm">{product.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Sell: {formatMoney(product.sellingPrice)}
                {product.purchasePrice > 0 && (
                  <> · Buy: {formatMoney(product.purchasePrice)}</>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div
                className={`text-sm font-bold ${
                  product.stockQuantity <= product.minimumStock
                    ? 'text-amber-600'
                    : 'text-gray-700'
                }`}
              >
                {product.stockQuantity} {product.unit}
                {product.stockQuantity <= product.minimumStock && (
                  <span className="ml-1 text-xs">⚠️</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
