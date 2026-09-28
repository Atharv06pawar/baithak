'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getOperationalTasks, toggleTaskStatus } from '@/lib/domain/task';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import MessageApprovalModal from './MessageApprovalModal';
import type { ShopTask, UUID } from '@/lib/types';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: UUID;
  onNavigateTab: (tab: 'pos' | 'history' | 'inventory' | 'business' | 'insights' | 'settings') => void;
}

export default function NotificationCenterModal({
  isOpen,
  onClose,
  shopId,
  onNavigateTab,
}: NotificationCenterModalProps) {
  // Mobile hardware/gesture back button support
  useMobileBackHandler(isOpen, onClose, 'notification_center_modal');

  const [tasks, setTasks] = useState<ShopTask[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(false);

  // Approval Modal state
  const [approvalModalState, setApprovalModalState] = useState<{
    isOpen: boolean;
    title: string;
    tasksToReview: ShopTask[];
  }>({
    isOpen: false,
    title: '',
    tasksToReview: [],
  });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const allTasks = await getOperationalTasks(shopId);
      setTasks(allTasks);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (isOpen) {
      loadTasks();
    }
  }, [isOpen, loadTasks]);

  if (!isOpen) return null;

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  async function handleToggle(task: ShopTask) {
    try {
      const updated = await toggleTaskStatus(task.id, shopId);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  }

  // Open approval modal for Khata (Udhaar) reminders
  function openKhataApproval() {
    const khataTasks = tasks.filter((t) => t.type === 'khata_collection' && t.status === 'pending');
    setApprovalModalState({
      isOpen: true,
      title: 'Review Khata (Udhaar) Reminders',
      tasksToReview: khataTasks.length > 0 ? khataTasks : tasks.filter((t) => t.type === 'khata_collection'),
    });
  }

  // Open approval modal for Supplier low-stock orders
  function openSupplierApproval() {
    const supplierTasks = tasks.filter((t) => t.type === 'low_stock' && t.status === 'pending');
    setApprovalModalState({
      isOpen: true,
      title: 'Review Dealer Low-Stock Orders',
      tasksToReview: supplierTasks.length > 0 ? supplierTasks : tasks.filter((t) => t.type === 'low_stock'),
    });
  }

  // Open approval modal for an individual task
  function openSingleApproval(task: ShopTask) {
    setApprovalModalState({
      isOpen: true,
      title: `Review Message for ${task.recipientName || task.title}`,
      tasksToReview: [task],
    });
  }

  function handleActionJump(task: ShopTask) {
    if (task.actionTab) {
      onNavigateTab(task.actionTab);
      onClose();
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-3 sm:p-4 cursor-pointer"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col shadow-2xl animate-in fade-in duration-200 overflow-hidden cursor-default border border-transparent dark:border-slate-800"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/80 dark:bg-slate-950/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                🔔
              </div>
              <div>
                <div className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Shop Tasks & Notifications</span>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
                      {pendingCount} Pending
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  Daily inventory alerts, khata collections, and register closing.
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-200/80 dark:bg-slate-800 hover:bg-gray-300 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Quick Action Approval Triggers */}
          <div className="p-3 bg-blue-50/60 dark:bg-slate-950/60 border-b border-blue-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              onClick={openKhataApproval}
              className="bg-white dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-bold text-xs py-2 px-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>💰</span>
              <span className="truncate">Review Khata Reminders</span>
            </button>

            <button
              onClick={openSupplierApproval}
              className="bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-bold text-xs py-2 px-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>📦</span>
              <span className="truncate">Review Dealer Orders</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-gray-100 dark:border-slate-800 px-4 pt-2.5 bg-white dark:bg-slate-900 text-xs font-bold gap-4">
            <button
              onClick={() => setFilter('pending')}
              className={`pb-2.5 relative ${
                filter === 'pending'
                  ? 'text-blue-900 dark:text-blue-400 border-b-2 border-blue-900 dark:border-blue-400'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`pb-2.5 relative ${
                filter === 'all'
                  ? 'text-blue-900 dark:text-blue-400 border-b-2 border-blue-900 dark:border-blue-400'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              All Tasks ({tasks.length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`pb-2.5 relative ${
                filter === 'completed'
                  ? 'text-blue-900 dark:text-blue-400 border-b-2 border-blue-900 dark:border-blue-400'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              Completed ({completedCount})
            </button>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-10 text-xs text-gray-400 dark:text-slate-500">Loading daily tasks…</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <div className="text-3xl">🎉</div>
                <div className="font-bold text-sm text-gray-800 dark:text-white">No {filter} tasks!</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 max-w-xs mx-auto">
                  {filter === 'pending'
                    ? 'All stock is healthy and no pending customer dues require attention.'
                    : 'No tasks found in this section.'}
                </div>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isDone = task.status === 'completed';
                const hasRecipient = !!task.recipientPhone;

                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isDone
                        ? 'bg-gray-50/70 dark:bg-slate-800/40 border-gray-200 dark:border-slate-800 opacity-75'
                        : 'bg-white dark:bg-slate-800/90 border-gray-200 dark:border-slate-700 shadow-sm hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Check / Uncheck Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggle(task)}
                        title={isDone ? 'Mark as Pending' : 'Mark as Done'}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition-all shrink-0 mt-0.5 ${
                          isDone
                            ? 'bg-green-600 text-white shadow-xs'
                            : 'border-2 border-gray-300 dark:border-slate-600 hover:border-blue-600 text-transparent'
                        }`}
                      >
                        ✓
                      </button>

                      {/* Task Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`font-bold text-xs truncate ${
                              isDone ? 'line-through text-gray-500 dark:text-slate-500' : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {task.title}
                          </span>

                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                              task.type === 'low_stock'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : task.type === 'khata_collection'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                          >
                            {task.type === 'low_stock'
                              ? 'Stock Alert'
                              : task.type === 'khata_collection'
                              ? 'Khata Due'
                              : 'Closing'}
                          </span>
                        </div>

                        <div className="text-xs text-gray-600 dark:text-slate-300 leading-snug">
                          {task.description}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1.5">
                          {hasRecipient && (
                            <button
                              type="button"
                              onClick={() => openSingleApproval(task)}
                              className="text-[11px] font-bold text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors border border-transparent dark:border-blue-800/50"
                            >
                              <span>💬</span>
                              <span>Review Message</span>
                            </button>
                          )}

                          {task.actionTab && (
                            <button
                              type="button"
                              onClick={() => handleActionJump(task)}
                              className="text-[11px] font-bold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <span>👉</span>
                              <span>{task.actionLabel || 'View in App'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggle(task)}
                            className="text-[11px] text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 font-medium ml-auto"
                          >
                            {isDone ? 'Reopen' : 'Mark Done'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/80 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <div>
              {pendingCount === 0 ? '✓ All tasks caught up' : `${pendingCount} operational item${pendingCount === 1 ? '' : 's'} pending`}
            </div>
            <button
              onClick={loadTasks}
              disabled={loading}
              className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 font-bold"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Message Approval Modal */}
      <MessageApprovalModal
        isOpen={approvalModalState.isOpen}
        onClose={() => setApprovalModalState((prev) => ({ ...prev, isOpen: false }))}
        shopId={shopId}
        title={approvalModalState.title}
        tasks={approvalModalState.tasksToReview}
        onTasksUpdated={loadTasks}
      />
    </>
  );
}
