'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getProducts, createProduct, updateProduct } from '@/lib/domain/product';
import { getSuppliers, createSupplier, type CreateSupplierInput } from '@/lib/domain/supplier';
import { getPurchases, createPurchase, getPurchaseWithItems, type PurchaseItemInput } from '@/lib/domain/purchase';
import { createStockAdjustment, getStockAdjustments } from '@/lib/domain/stock_adjustment';
import { toPaise, formatMoney } from '@/lib/money';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { Product, Supplier, Purchase, PurchaseItem, StockAdjustment, UUID } from '@/lib/types';

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
  const [viewingPurchase, setViewingPurchase] = useState<{ purchase: Purchase; items: PurchaseItem[] } | null>(null);

  // Mobile Back Button handlers: close open modals/sheets before exiting app
  useMobileBackHandler(showAddProduct, () => setShowAddProduct(false), 'inv_add_product');
  useMobileBackHandler(showAddSupplier, () => setShowAddSupplier(false), 'inv_add_supplier');
  useMobileBackHandler(showRecordPurchase, () => setShowRecordPurchase(false), 'inv_record_purchase');
  useMobileBackHandler(!!adjustingProduct, () => setAdjustingProduct(null), 'inv_adjust_product');
  useMobileBackHandler(!!viewingPurchase, () => setViewingPurchase(null), 'inv_view_purchase');

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

  // Purchases form state
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemCost, setItemCost] = useState('');
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

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

  function handleSelectProductForPurchase(prodId: string) {
    setSelectedProdId(prodId);
    if (!prodId) {
      setItemCost('');
      return;
    }
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      const costRupees =
        prod.purchasePrice > 0
          ? prod.purchasePrice / 100
          : prod.sellingPrice > 0
          ? prod.sellingPrice / 100
          : 0;
      setItemCost(costRupees > 0 ? costRupees.toString() : '');
      if (!itemQty) setItemQty('10');
    }
  }

  function handleAddItemToPurchase() {
    if (!selectedProdId) return;
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;
    const qty = parseInt(itemQty);
    if (!qty || qty <= 0) return;
    const costRupees = parseFloat(itemCost) || 0;
    const costPaise = toPaise(costRupees);

    const existingIndex = purchaseItems.findIndex((i) => i.productId === selectedProdId);
    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + qty,
        unitCost: costPaise,
      };
      setPurchaseItems(updated);
    } else {
      setPurchaseItems([
        ...purchaseItems,
        {
          productId: prod.id,
          productName: prod.name,
          quantity: qty,
          unitCost: costPaise,
        },
      ]);
    }

    setSelectedProdId('');
    setItemQty('');
    setItemCost('');
  }

  function handleRemovePurchaseItem(index: number) {
    setPurchaseItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  const purchaseTotalPaise = purchaseItems.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  async function handleCreatePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (purchaseItems.length === 0) return;
    setIsSubmittingPurchase(true);
    try {
      const sup = suppliers.find((s) => s.id === purchaseSupplierId);
      await createPurchase({
        shopId,
        supplierId: purchaseSupplierId || undefined,
        supplierName: sup ? sup.name : undefined,
        invoiceNumber: purchaseInvoice.trim() || undefined,
        items: purchaseItems,
        notes: purchaseNotes.trim() || undefined,
      });

      setPurchaseSupplierId('');
      setPurchaseInvoice('');
      setPurchaseNotes('');
      setPurchaseItems([]);
      setSelectedProdId('');
      setItemQty('');
      setItemCost('');
      setShowRecordPurchase(false);
      await loadData();
    } finally {
      setIsSubmittingPurchase(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 overflow-hidden">
      {/* Sub-navigation */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-3 flex gap-2 overflow-x-auto">
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
                ? 'border-blue-900 text-blue-900 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
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
              <span className="font-bold text-gray-800 dark:text-white text-sm">
                Catalog ({products.length} items)
              </span>
              <button
                onClick={() => setShowAddProduct(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Add Product
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800 overflow-hidden">
              {products.map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                      Sell: <span className="font-semibold text-gray-800 dark:text-slate-200">{formatMoney(p.sellingPrice)}</span> • Buy:{' '}
                      {p.purchasePrice > 0 ? formatMoney(p.purchasePrice) : '₹0'}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-bold ${
                        p.stockQuantity <= p.minimumStock
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300'
                      }`}
                    >
                      {p.stockQuantity} {p.unit}
                    </span>
                    <button
                      onClick={() => setAdjustingProduct(p)}
                      className="border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs px-2 py-1 rounded-lg"
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
              <span className="font-bold text-gray-800 dark:text-white text-sm">Supplier Purchase Invoices</span>
              <button
                onClick={() => setShowRecordPurchase(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Record Purchase
              </button>
            </div>

            {purchases.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-slate-500 py-12">
                <div className="text-3xl mb-1">🚚</div>
                <div className="text-sm font-medium">No purchases recorded yet</div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800 overflow-hidden">
                {purchases.map((pur) => (
                  <div
                    key={pur.id}
                    onClick={async () => {
                      const details = await getPurchaseWithItems(pur.id);
                      if (details) setViewingPurchase(details);
                    }}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white">
                        {pur.supplierName || 'Wholesale Supplier'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Inv: {pur.invoiceNumber || 'N/A'} • {new Date(pur.purchaseDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-base text-gray-900 dark:text-white">{formatMoney(pur.total)}</div>
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">View Items →</div>
                    </div>
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
              <span className="font-bold text-gray-800 dark:text-white text-sm">Local Suppliers & Agencies</span>
              <button
                onClick={() => setShowAddSupplier(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold py-2 px-3 rounded-xl shadow"
              >
                + Add Supplier
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
              {suppliers.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-gray-900 dark:text-white">{s.name}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      Contact: {s.contactName || 'N/A'} • Phone: {s.phone || 'N/A'}
                    </div>
                  </div>
                  <span className="text-xs bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-transparent dark:border-blue-800 px-2 py-1 rounded-lg font-semibold">
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
            <div className="font-bold text-gray-800 dark:text-white text-sm">Stock Adjustments & Waste Audit</div>
            {adjustments.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-slate-500 py-12">
                <div className="text-3xl mb-1">⚖️</div>
                <div className="text-sm font-medium">No stock adjustments recorded</div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
                {adjustments.map((a) => (
                  <div key={a.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white">{a.productName}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {a.adjustmentType} • Reason: {a.reason || 'None specified'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-bold text-sm ${
                          a.quantityChange > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {a.quantityChange > 0 ? `+${a.quantityChange}` : a.quantityChange}
                      </span>
                      <div className="text-xs text-gray-400 dark:text-slate-500">Bal: {a.quantityAfter}</div>
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
        <div
          onClick={() => setShowAddProduct(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateProduct}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default border border-transparent dark:border-slate-800"
          >
            <div className="font-bold text-lg text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-2">Add New Product</div>
            <input
              type="text"
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="Product Name *"
              required
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={prodSell}
                onChange={(e) => setProdSell(e.target.value)}
                placeholder="Selling Price (₹) *"
                required
                className="border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
              <input
                type="number"
                value={prodBuy}
                onChange={(e) => setProdBuy(e.target.value)}
                placeholder="Purchase Cost (₹)"
                className="border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={prodStock}
                onChange={(e) => setProdStock(e.target.value)}
                placeholder="Opening Stock"
                className="border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
              <input
                type="number"
                value={prodMinStock}
                onChange={(e) => setProdMinStock(e.target.value)}
                placeholder="Min Alert Stock"
                className="border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="flex-1 border border-gray-300 dark:border-slate-700 py-2.5 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div
          onClick={() => setShowAddSupplier(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateSupplier}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default border border-transparent dark:border-slate-800"
          >
            <div className="font-bold text-lg text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-2">Add Supplier</div>
            <input
              type="text"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Agency / Supplier Name *"
              required
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <input
              type="text"
              value={supContact}
              onChange={(e) => setSupContact(e.target.value)}
              placeholder="Contact Person"
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <input
              type="tel"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder="Phone Number"
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <input
              type="number"
              value={supLeadDays}
              onChange={(e) => setSupLeadDays(e.target.value)}
              placeholder="Lead Time Days"
              min="1"
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSupplier(false)}
                className="flex-1 border border-gray-300 dark:border-slate-700 py-2.5 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <div
          onClick={() => setAdjustingProduct(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleStockAdjustment}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-xl cursor-default border border-transparent dark:border-slate-800"
          >
            <div className="font-bold text-lg text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-2">
              Adjust Stock: {adjustingProduct.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Current Stock: <span className="font-bold text-gray-800 dark:text-slate-200">{adjustingProduct.stockQuantity}</span>
            </div>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as any)}
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
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
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <input
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Reason / Note"
              className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="flex-1 border border-gray-300 dark:border-slate-700 py-2.5 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-900 hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs shadow"
              >
                Apply Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Purchase Modal */}
      {showRecordPurchase && (
        <div
          onClick={() => setShowRecordPurchase(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 cursor-pointer backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl cursor-default border border-gray-200 dark:border-slate-800 overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">Record Stock Purchase</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Add incoming inventory from suppliers or wholesale</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordPurchase(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1.5 rounded-lg text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Supplier & Invoice No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Supplier / Agency</label>
                  <select
                    value={purchaseSupplierId}
                    onChange={(e) => setPurchaseSupplierId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Wholesale / Spot Vendor</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Invoice / Bill #</label>
                  <input
                    type="text"
                    value={purchaseInvoice}
                    onChange={(e) => setPurchaseInvoice(e.target.value)}
                    placeholder="e.g. INV-2024-08"
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Add Item Box */}
              <div className="bg-gray-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700/60 space-y-3">
                <div className="text-xs font-bold text-gray-800 dark:text-slate-200 flex justify-between items-center">
                  <span>Add Product to Inward Bill</span>
                  {products.length === 0 && (
                    <span className="text-amber-600 dark:text-amber-400 text-[11px] font-normal">Add products in catalog first</span>
                  )}
                </div>

                <div className="space-y-2">
                  <select
                    value={selectedProdId}
                    onChange={(e) => handleSelectProductForPurchase(e.target.value)}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  >
                    <option value="">-- Select Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {p.stockQuantity} {p.unit})
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">Quantity Received</label>
                      <input
                        type="number"
                        min="1"
                        value={itemQty}
                        onChange={(e) => setItemQty(e.target.value)}
                        placeholder="Qty"
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">Buy Cost / Unit (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemCost}
                        onChange={(e) => setItemCost(e.target.value)}
                        placeholder="Cost Price"
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItemToPurchase}
                    disabled={!selectedProdId || !itemQty || parseInt(itemQty) <= 0}
                    className="w-full bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition-opacity shadow-xs"
                  >
                    + Add Item to Bill
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-800 dark:text-slate-300 flex justify-between">
                  <span>Invoice Items ({purchaseItems.length})</span>
                  <span className="text-blue-900 dark:text-blue-400 font-bold">{formatMoney(purchaseTotalPaise)}</span>
                </div>

                {purchaseItems.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
                    No items added yet. Select a product and click "+ Add Item to Bill".
                  </div>
                ) : (
                  <div className="border border-gray-200 dark:border-slate-800 rounded-xl divide-y divide-gray-100 dark:divide-slate-800 max-h-40 overflow-y-auto">
                    {purchaseItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="font-bold text-gray-900 dark:text-white truncate">{item.productName}</div>
                          <div className="text-gray-500 dark:text-slate-400">
                            {item.quantity} pcs × {formatMoney(item.unitCost)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-900 dark:text-slate-200">
                            {formatMoney(item.quantity * item.unitCost)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePurchaseItem(idx)}
                            className="text-red-500 hover:text-red-700 p-1 font-bold text-sm"
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Notes / Remarks (Optional)</label>
                <input
                  type="text"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  placeholder="e.g. Paid in cash, Batch #492"
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex gap-2 bg-gray-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => {
                  setShowRecordPurchase(false);
                  setPurchaseItems([]);
                }}
                className="flex-1 border border-gray-300 dark:border-slate-700 py-2.5 rounded-xl font-bold text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePurchase}
                disabled={purchaseItems.length === 0 || isSubmittingPurchase}
                className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition-opacity"
              >
                {isSubmittingPurchase ? 'Saving...' : `Save Purchase • ${formatMoney(purchaseTotalPaise)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Purchase Details Modal */}
      {viewingPurchase && (
        <div
          onClick={() => setViewingPurchase(null)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 cursor-pointer backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl cursor-default border border-transparent dark:border-slate-800"
          >
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-slate-800 pb-2">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Purchase Invoice</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {viewingPurchase.purchase.supplierName || 'Wholesale Supplier'} • {new Date(viewingPurchase.purchase.purchaseDate).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setViewingPurchase(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1 text-base"
              >
                ✕
              </button>
            </div>

            {viewingPurchase.purchase.invoiceNumber && (
              <div className="text-xs bg-gray-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700">
                <span className="text-gray-500 dark:text-slate-400">Invoice Number: </span>
                <span className="font-bold text-gray-900 dark:text-white">{viewingPurchase.purchase.invoiceNumber}</span>
              </div>
            )}

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <div className="text-xs font-bold text-gray-700 dark:text-slate-300">Items Received:</div>
              <div className="divide-y divide-gray-100 dark:divide-slate-800 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {viewingPurchase.items.map((item) => (
                  <div key={item.id} className="p-2.5 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white">{item.productName}</div>
                      <div className="text-gray-500 dark:text-slate-400">{item.quantity} pcs × {formatMoney(item.unitCost)}</div>
                    </div>
                    <div className="font-bold text-gray-900 dark:text-white">{formatMoney(item.lineTotal)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-800">
              <span className="font-bold text-sm text-gray-800 dark:text-white">Total Amount</span>
              <span className="font-bold text-lg text-blue-900 dark:text-blue-400">{formatMoney(viewingPurchase.purchase.total)}</span>
            </div>

            {viewingPurchase.purchase.notes && (
              <div className="text-xs text-gray-500 dark:text-slate-400 italic">
                Note: {viewingPurchase.purchase.notes}
              </div>
            )}

            <button
              onClick={() => setViewingPurchase(null)}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2 rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
