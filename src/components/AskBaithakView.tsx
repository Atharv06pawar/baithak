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
        'Namaste! I am Ask Baithak, your shop assistant. Ask me anything about today’s sales, reorder needs, dead stock, or customer udhaar.',
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
          content: 'Sorry, I encountered an error checking shop records. Please try again.',
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
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <div>
            <div className="font-black text-base text-gray-900">Ask Baithak</div>
            <div className="text-xs text-gray-500">
              Honest assistant powered strictly by verified shop facts
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
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-line leading-relaxed">{m.content}</div>

              {/* Cited Metrics Card */}
              {m.citedMetrics && m.citedMetrics.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                  {m.citedMetrics.map((met, mIdx) => (
                    <div key={mIdx} className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                      <div className="text-gray-400 font-medium text-[11px]">{met.label}</div>
                      <div className="font-black text-blue-900 text-xs mt-0.5">{met.value}</div>
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
                    className="bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100 active:scale-95 text-xs font-semibold px-3 py-1.5 rounded-full transition-transform"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-white p-3 rounded-2xl border w-fit">
            <span className="animate-spin text-base">⏳</span>
            Consulting verified shop metrics…
          </div>
        )}
      </div>

      {/* Input bar with Voice Button */}
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
        <button
          onClick={handleToggleVoice}
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-transform active:scale-90 ${
            isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
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
