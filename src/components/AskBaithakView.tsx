'use client';

import React, { useState } from 'react';
import { askBaithak, type AssistantResponse } from '@/lib/ai/assistant';
import type { UUID } from '@/lib/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citedMetrics?: Array<{ label: string; value: string }>;
  suggestedFollowUps?: string[];
}

export default function AskBaithakView({ shopId }: { shopId: UUID }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Namaste! I am Ask Baithak. Free-form custom AI questions are currently in development — please tap any of the preset messages below to view your verified sales, reorder needs, dead stock, and customer udhaar.',
      suggestedFollowUps: [
        'How was business today?',
        'What should I order?',
        'Which products aren’t moving?',
        'How much udhaar is pending?',
      ],
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  async function handleSendQuery(textToSend?: string) {
    const q = (textToSend || inputQuery).trim();
    if (!q) return;

    const userMsg: Message = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const response = await askBaithak(shopId, q);
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.answer,
        citedMetrics: response.citedMetrics,
        suggestedFollowUps: response.suggestedFollowUps,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'This feature is currently in development. Please use the preset messages below to view your verified shop metrics.',
          suggestedFollowUps: [
            'How was business today?',
            'What should I order?',
            'Which products aren’t moving?',
            'How much udhaar is pending?',
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Voice speech recognition handler
  function handleToggleVoice() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please type your question.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN'; // Indian English
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputQuery(transcript);
        handleSendQuery(transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Voice recognition error:', err);
      setIsListening(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-black text-base text-gray-900 dark:text-white">Ask Baithak</div>
              <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                In Development
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Please use preset messages below for verified shop metrics
            </div>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-sm ${
                m.role === 'user'
                  ? 'bg-blue-900 text-white rounded-br-none'
                  : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-white rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-line leading-relaxed">{m.content}</div>

              {/* Cited Metrics Card */}
              {m.citedMetrics && m.citedMetrics.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  {m.citedMetrics.map((met, mIdx) => (
                    <div key={mIdx} className="bg-gray-50 dark:bg-slate-800 p-2 rounded-xl border border-gray-100 dark:border-slate-700">
                      <div className="text-gray-400 dark:text-slate-400 font-medium text-[11px]">{met.label}</div>
                      <div className="font-black text-blue-900 dark:text-blue-400 text-xs mt-0.5">{met.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suggested Followups */}
            {m.suggestedFollowUps && m.suggestedFollowUps.length > 0 && idx === messages.length - 1 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5 max-w-[90%]">
                {m.suggestedFollowUps.map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSendQuery(sug)}
                    className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 active:scale-95 text-xs font-semibold px-3 py-1.5 rounded-full transition-transform"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-400 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3 rounded-2xl w-fit">
            <span className="animate-spin text-base">⏳</span>
            Consulting verified shop metrics…
          </div>
        )}
      </div>

      {/* Input bar with Voice Button */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex items-center gap-2">
        <button
          onClick={handleToggleVoice}
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-transform active:scale-90 ${
            isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200'
          }`}
          title="Voice query (Tap to speak)"
        >
          {isListening ? '🎙️' : '🎤'}
        </button>

        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
          placeholder="Ask e.g. How was business today?…"
          className="flex-1 border border-gray-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
        />

        <button
          onClick={() => handleSendQuery()}
          disabled={!inputQuery.trim() || loading}
          className="bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow transition-transform active:scale-95"
        >
          Send
        </button>
      </div>
    </div>
  );
}
