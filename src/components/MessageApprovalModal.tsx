'use client';

import React, { useState, useEffect } from 'react';
import { formatWhatsAppUrl, updateTaskStatus } from '@/lib/domain/task';
import { useMobileBackHandler } from '@/lib/hooks/useMobileBackHandler';
import type { ShopTask, UUID } from '@/lib/types';

interface MessageApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: UUID;
  title: string;
  tasks: ShopTask[];
  onTasksUpdated: () => void;
}

export default function MessageApprovalModal({
  isOpen,
  onClose,
  shopId,
  title,
  tasks,
  onTasksUpdated,
}: MessageApprovalModalProps) {
  // Mobile gesture/hardware back button support
  useMobileBackHandler(isOpen, onClose, 'message_approval_modal');

  // Track selected task IDs for approval
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Allow the owner to review and edit custom messages per task
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});
  // Track which task is currently being previewed/edited
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  // Initialize selection with all tasks that have phone numbers
  useEffect(() => {
    if (isOpen) {
      const withPhones = tasks.filter((t) => !!t.recipientPhone);
      setSelectedIds(new Set(withPhones.map((t) => t.id)));

      const initialMsgs: Record<string, string> = {};
      for (const t of tasks) {
        initialMsgs[t.id] = t.suggestedMessage || '';
      }
      setEditedMessages(initialMsgs);

      if (tasks.length > 0) {
        setActiveTaskId(tasks[0].id);
      }
      setSentNotice(null);
    }
  }, [isOpen, tasks]);

  if (!isOpen) return null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    const withPhones = tasks.filter((t) => !!t.recipientPhone);
    if (selectedIds.size === withPhones.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(withPhones.map((t) => t.id)));
    }
  }

  async function handleSendSingle(task: ShopTask) {
    if (!task.recipientPhone) {
      alert(`No phone number available for ${task.recipientName || 'this recipient'}`);
      return;
    }

    const message = editedMessages[task.id] || task.suggestedMessage || '';
    const url = formatWhatsAppUrl(task.recipientPhone, message);
    if (!url) {
      alert('Invalid phone number format');
      return;
    }

    // Open WhatsApp in new tab / mobile app
    window.open(url, '_blank');

    // Automatically mark the task as done
    await updateTaskStatus(task.id, 'completed', shopId);
    onTasksUpdated();

    setSentNotice(`✓ Opened WhatsApp for ${task.recipientName || task.recipientPhone}. Task marked as Done!`);
    setTimeout(() => setSentNotice(null), 4000);
  }

  const activeTask = tasks.find((t) => t.id === activeTaskId) || tasks[0];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl animate-in fade-in duration-200 overflow-hidden cursor-default"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div>
            <div className="font-bold text-base text-gray-900 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>{title}</span>
            </div>
            <div className="text-xs text-gray-500">
              Owner Review & Approval: Select who to ping and verify the message.
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-200/80 hover:bg-gray-300 text-gray-600 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Notice Banner */}
        {sentNotice && (
          <div className="bg-green-50 border-b border-green-200 p-2.5 text-xs text-green-800 font-semibold text-center">
            {sentNotice}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Safety Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
            <span className="font-bold">✓ Total Control:</span> No automated messages are sent without your click. Choose exactly who you want to ping below, check the preview, and tap to approve.
          </div>

          {/* Recipient Selection Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-700">
                Select Recipients ({selectedIds.size} of {tasks.length} selected):
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-blue-700 hover:text-blue-900 font-bold"
              >
                {selectedIds.size === tasks.filter((t) => !!t.recipientPhone).length
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <div className="text-xs text-gray-400 py-3 text-center">No pending recipients found.</div>
              ) : (
                tasks.map((task) => {
                  const isSelected = selectedIds.has(task.id);
                  const hasPhone = !!task.recipientPhone;
                  const isActive = activeTask?.id === task.id;

                  return (
                    <div
                      key={task.id}
                      onClick={() => setActiveTaskId(task.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                        isActive
                          ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!hasPhone}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelect(task.id);
                        }}
                        className="w-4 h-4 text-blue-900 rounded border-gray-300 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-gray-900 truncate">
                            {task.recipientName || task.title}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              task.type === 'low_stock'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {task.type === 'low_stock' ? 'Supplier' : 'Khata'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 truncate flex items-center gap-1.5 mt-0.5">
                          <span>{hasPhone ? `📞 ${task.recipientPhone}` : '⚠️ No phone saved'}</span>
                          <span>•</span>
                          <span>{task.description}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Message Preview & Customization */}
          {activeTask && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-800">
                  Message Preview for {activeTask.recipientName || 'Recipient'}:
                </span>
                <span className="text-[11px] text-gray-500">Editable before sending</span>
              </div>

              <textarea
                value={editedMessages[activeTask.id] ?? activeTask.suggestedMessage ?? ''}
                onChange={(e) =>
                  setEditedMessages({
                    ...editedMessages,
                    [activeTask.id]: e.target.value,
                  })
                }
                rows={3}
                className="w-full text-xs p-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans"
                placeholder="Type your message..."
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="text-[11px] text-gray-500">
                  Destination: {activeTask.recipientPhone ? `WhatsApp (+${activeTask.recipientPhone})` : 'Phone missing'}
                </div>

                <button
                  type="button"
                  onClick={() => handleSendSingle(activeTask)}
                  disabled={!activeTask.recipientPhone}
                  className="bg-green-600 hover:bg-green-700 active:scale-98 text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-40 transition-transform"
                >
                  <span>💬</span>
                  <span>Approve & Ping via WhatsApp</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500 font-medium">
            {selectedIds.size} recipient{selectedIds.size === 1 ? '' : 's'} approved to ping
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-bold py-2 px-4 rounded-xl"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
