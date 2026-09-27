'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getProducts, createProduct, updateProduct } from '@/lib/domain/product';
import { getSuppliers, createSupplier, type CreateSupplierInput } from '@/lib/domain/supplier';
import { getPurchases, createPurchase, type PurchaseItemInput } from '@/lib/domain/purchase';
import { createStockAdjustment, getStockAdjustments } from '@/lib/domain/stock_adjustment';
import { toPaise, formatMoney } from '@/lib/money';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { Product, Supplier, Purchase, StockAdjustment, UUID } from '@/lib/types';

type SubTab = 'products' | 'purchases' | 'suppliers' | 'adjustments';

export default function InventoryScreen({ shopId }: { shopId: UUID }) {
  const [activeTab, setActiveTab] = useState<SubTab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showRecordPurchase, setShowRecordPurchase] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);

  // Mobile Back Button handlers: close open modals/sheets before exiting app
  useMobileBackHandler(showAddProduct, () => setShowAddProduct(false), 'inv_add_product');
  useMobileBackHandler(showAddSupplier, () => setShowAddSupplier(false), 'inv_add_supplier');
  useMobileBackHandler(showRecordPurchase, () => setShowRecordPurchase(false), 'inv_record_purchase');
  useMobileBackHandler(!!adjustingProduct, () => setAdjustingProduct(null), 'inv_adjust_product');

  // Forms
  const [prodName, setProdName] = useState('');
  const [prodSell, setProdSell] = useState('');
  const [prodBuy, setProdBuy] = useState('');
  const [prodStock, setProdStock] = useState('0');
  const [prodMinStock, setProdMinStock] = useState('5');
  const [prodUnit, setProdUnit] = useState('piece');
  const [prodSupplierId, setProdSupplierId] = useState('');

  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supLeadDays, setSupLeadDays] = useState('2');

  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([]);

  const [adjType, setAdjType] = useState<'addition' | 'damage' | 'expiry' | 'correction'>('correction');
  const [adjQtyChange, setAdjQtyChange] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, sups, purchs, adjs] = await Promise.all([
        getProducts(shopId),
        getSuppliers(shopId),
        getPurchases(shopId, { limit: 50 }),
        getStockAdjustments(shopId),
      ]);
      setProducts(prods);
      setSuppliers(sups);
      setPurchases(purchs);
      setAdjustments(adjs);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Inventory valuation
  const totalStockUnits = products.reduce((sum, p) => sum + p.stockQuantity, 0);
  const totalValuationCost = products.reduce((sum, p) => sum + p.purchasePrice * p.stockQuantity, 0);
  const totalValuationRetail = products.reduce((sum, p) => sum + p.sellingPrice * p.stockQuantity, 0);

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!prodName.trim()) return;
    await createProduct({
      shopId,
      name: prodName.trim(),
      sellingPrice: toPaise(parseFloat(prodSell) || 0),
      purchasePrice: toPaise(parseFloat(prodBuy) || 0),
      stockQuantity: parseInt(prodStock) || 0,
      minimumStock: parseInt(prodMinStock) || 5,
      unit: prodUnit,
      supplierId: prodSupplierId || undefined,
    });
    setProdName('');
    setProdSell('');
    setProdBuy('');
    setProdStock('0');
    setShowAddProduct(false);
    await loadData();
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supName.trim()) return;
    await createSupplier({
      shopId,
      name: supName.trim(),
      contactName: supContact.trim(),
      phone: supPhone.trim(),
      leadTimeDays: parseInt(supLeadDays) || 2,
    });
    setSupName('');
    setSupContact('');
    setSupPhone('');
    setShowAddSupplier(false);
    await loadData();
  }

  async function handleStockAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingProduct) return;
    const change = parseInt(adjQtyChange);
    if (!change || isNaN(change)) return;

    await createStockAdjustment({
      shopId,
      productId: adjustingProduct.id,
      productName: adjustingProduct.name,
      adjustmentType: adjType,
      quantityChange: change,
      reason: adjReason,
    });

    setAdjustingProduct(null);
    setAdjQtyChange('');
    setAdjReason('');
    await loadData();
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Sub-navigation */}
      <div className="bg-white border-b border-gray-200 px-3 flex gap-2 overflow-x-auto">
        {(
          [
            { id: 'products' as SubTab, label: '📦 Products & Stock' },
            { id: 'purchases' as SubTab, label: '🚚 Purchases' },
            { id: 'suppliers' as SubTab, label: '🏢 Suppliers' },
            { id: 'adjustments' as SubTab, label: '⚖️ Adjustments' },
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

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Tab 1: Products */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            {/* Valuation Stats Card */}
            <div className="grid grid-cols-3 gap-2 bg-blue-900 text-white rounded-2xl p-4 shadow-sm">
              <div>
                <div className="text-xs text-blue-200">Total Units</div>
                <div className="text-xl font-bold">{totalStockUnits}</div>
              </div>
              <div>
                <div className="text-xs text-blue-200">Stock Cost Value</div>
                <div className="text-lg font-bold">{formatMoney(totalValuationCost)}</div>
              </div>
              <div>
                <div className="text-xs text-blue-200">Retail Value</div>
                <div className="text-lg font-bold">{formatMoney(totalValuationRetail)}</div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800 text-sm">
                Catalog ({products.length} items)
              </span>
              <button
                onClick={() => setShowAddProduct(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Add Product
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {products.map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Sell: <span className="font-semibold text-gray-800">{formatMoney(p.sellingPrice)}</span> • Buy:{' '}
                      {p.purchasePrice > 0 ? formatMoney(p.purchasePrice) : '₹0'}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-bold ${
                        p.stockQuantity <= p.minimumStock
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {p.stockQuantity} {p.unit}
                    </span>
                    <button
                      onClick={() => setAdjustingProduct(p)}
                      className="border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg"
                      title="Adjust Stock"
                    >
                      Adjust
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Purchases */}
        {activeTab === 'purchases' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800 text-sm">Supplier Purchase Invoices</span>
              <button
                onClick={() => setShowRecordPurchase(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Record Purchase
              </button>
            </div>

            {purchases.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-3xl mb-1">🚚</div>
                <div className="text-sm font-medium">No purchases recorded yet</div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                {purchases.map((pur) => (
                  <div key={pur.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-900">
                        {pur.supplierName || 'Wholesale Supplier'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Inv: {pur.invoiceNumber || 'N/A'} • {new Date(pur.purchaseDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="font-bold text-base text-gray-900">{formatMoney(pur.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Suppliers */}
        {activeTab === 'suppliers' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800 text-sm">Local Suppliers & Agencies</span>
              <button
                onClick={() => setShowAddSupplier(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Add Supplier
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {suppliers.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      Contact: {s.contactName || 'N/A'} • Phone: {s.phone || 'N/A'}
                    </div>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-800 px-2 py-1 rounded-lg font-semibold">
                    Lead: {s.leadTimeDays} days
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Adjustments */}
        {activeTab === 'adjustments' && (
          <div className="space-y-3">
            <div className="font-bold text-gray-800 text-sm">Stock Adjustments & Waste Audit</div>
            {adjustments.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-3xl mb-1">⚖️</div>
                <div className="text-sm font-medium">No stock adjustments recorded</div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
                {adjustments.map((a) => (
                  <div key={a.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-900">{a.productName}</div>
                      <div className="text-xs text-gray-500">
                        {a.adjustmentType} • Reason: {a.reason || 'None specified'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-bold text-sm ${
                          a.quantityChange > 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {a.quantityChange > 0 ? `+${a.quantityChange}` : a.quantityChange}
                      </span>
                      <div className="text-xs text-gray-400">Bal: {a.quantityAfter}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateProduct}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">Add New Product</div>
            <input
              type="text"
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="Product Name *"
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={prodSell}
                onChange={(e) => setProdSell(e.target.value)}
                placeholder="Selling Price (₹) *"
                required
                className="border rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={prodBuy}
                onChange={(e) => setProdBuy(e.target.value)}
                placeholder="Purchase Cost (₹)"
                className="border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={prodStock}
                onChange={(e) => setProdStock(e.target.value)}
                placeholder="Opening Stock"
                className="border rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={prodMinStock}
                onChange={(e) => setProdMinStock(e.target.value)}
                placeholder="Min Alert Stock"
                className="border rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
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

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSupplier}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">Add Supplier</div>
            <input
              type="text"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Agency / Supplier Name *"
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={supContact}
              onChange={(e) => setSupContact(e.target.value)}
              placeholder="Contact Person"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="tel"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder="Phone Number"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={supLeadDays}
              onChange={(e) => setSupLeadDays(e.target.value)}
              placeholder="Lead Time Days"
              min="1"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSupplier(false)}
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

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleStockAdjustment}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl"
          >
            <div className="font-bold text-lg text-gray-900 border-b pb-2">
              Adjust Stock: {adjustingProduct.name}
            </div>
            <div className="text-xs text-gray-500">
              Current Stock: <span className="font-bold text-gray-800">{adjustingProduct.stockQuantity}</span>
            </div>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as any)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            >
              <option value="damage">Damage / Waste (-)</option>
              <option value="expiry">Expired Stock (-)</option>
              <option value="addition">Found Stock (+)</option>
              <option value="correction">Inventory Count Correction</option>
            </select>
            <input
              type="number"
              value={adjQtyChange}
              onChange={(e) => setAdjQtyChange(e.target.value)}
              placeholder="Quantity Change (e.g. -2 or +5) *"
              required
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Reason / Note"
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="flex-1 border py-2.5 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
