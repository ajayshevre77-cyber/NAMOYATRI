import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  ShieldCheck,
  Phone,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import {
  AMBULANCE_NUMBER,
  ChatResponse,
  ChatTurn,
  MAX_CHAT_HISTORY,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_HISTORY_TEXT_LENGTH,
  SUGGESTED_QUESTIONS,
} from '../lib/chat';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** The server's answer, for assistant messages that are not errors. */
  response?: ChatResponse;
  /** A request that failed: `text` says why; Retry asks `question` again. */
  error?: { question: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: SupportedLanguage;
}

/** The server allows the AI 20 s; this leaves room for the network. */
const CLIENT_TIMEOUT_MS = 30_000;

const timeLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
let nextId = 0;
const newId = (prefix: string) => `${prefix}_${Date.now()}_${nextId++}`;

const isChatResponse = (body: any): body is ChatResponse =>
  !!body && typeof body.reply === 'string' && body.reply.trim() !== '' && typeof body.source === 'string';

/**
 * Earlier messages for a follow-up question: answered questions and their
 * answers, newest last, clipped. A question that failed or was cancelled is
 * left out with its error.
 */
const historyOf = (messages: Message[]): ChatTurn[] =>
  messages
    .filter((m, i) => !m.error && !(m.sender === 'user' && messages[i + 1]?.error))
    .map(m => ({ role: m.sender, text: m.text.trim().slice(0, MAX_HISTORY_TEXT_LENGTH) }))
    .filter(turn => turn.text !== '')
    .slice(-MAX_CHAT_HISTORY);

export const NamoAIChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentLanguage,
}) => {
  const t = translations[currentLanguage];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<AbortController | null>(null);
  const cancelled = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Closing the window cancels a question still waiting for its answer.
  useEffect(() => {
    if (!isOpen && pending) {
      cancelled.current = true;
      pending.abort();
    }
  }, [isOpen, pending]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const failure = (question: string, reason: string): Message => ({
    id: newId('err'),
    sender: 'assistant',
    text: reason,
    timestamp: timeLabel(),
    error: { question },
  });

  /** The message to show when the server refused or failed a request. */
  const describeHttpError = (status: number, body: any): string => {
    if (status === 429) {
      const wait = typeof body?.retryAfterSeconds === 'number' ? ` (${body.retryAfterSeconds} s)` : '';
      return `${t.aiErrorRateLimited}${wait}`;
    }
    if (status === 400 || status === 413) return t.aiErrorInvalid;
    return t.aiErrorServer;
  };

  /**
   * Sends `question`. With `replaceId`, the message with that id (an error,
   * or a built-in answer given because the AI failed) is replaced by the new
   * answer instead of adding the question again.
   */
  const ask = async (question: string, replaceId?: string) => {
    const q = question.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!q || pending) return;

    let base: Message[];
    let questionIndex: number;
    if (replaceId) {
      base = messages.filter(m => m.id !== replaceId);
      questionIndex = base.map(m => m.sender === 'user' && m.text === q).lastIndexOf(true);
    } else {
      base = [...messages, { id: newId('msg'), sender: 'user', text: q, timestamp: timeLabel() }];
      questionIndex = base.length - 1;
      setInput('');
    }
    setMessages(base);
    const history = historyOf(questionIndex >= 0 ? base.slice(0, questionIndex) : base);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);
    cancelled.current = false;
    setPending(controller);

    let reply: Message;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, language: currentLanguage, history }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      reply =
        res.ok && isChatResponse(body)
          ? { id: newId('reply'), sender: 'assistant', text: body.reply, timestamp: timeLabel(), response: body }
          : failure(q, describeHttpError(res.status, body));
    } catch {
      reply = failure(q, timedOut ? t.aiErrorTimeout : cancelled.current ? t.aiCancelled : t.aiErrorNetwork);
    } finally {
      clearTimeout(timer);
      setPending(null);
    }
    setMessages(prev => [...prev, reply]);
  };

  const cancel = () => {
    cancelled.current = true;
    pending?.abort();
  };

  /** The user question an answer or error belongs to. */
  const questionBefore = (index: number) =>
    messages.slice(0, index).reverse().find(m => m.sender === 'user')?.text ?? '';

  const sourceLabel = (response: ChatResponse) =>
    response.source === 'gemini' ? t.aiSourceGemini : response.source === 'safety-guidance' ? t.aiSourceSafety : t.aiSourceBuiltIn;

  const callLabel = (number: string) => (number === AMBULANCE_NUMBER ? t.aiCallAmbulance : t.aiCallEmergency);

  return (
    <div
      id="namo-ai-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-xs animate-in fade-in"
    >
      <div
        id="namo-ai-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="namo-ai-title"
        className="bg-white w-full max-w-lg h-[82vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-stone-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="namo-ai-title" className="font-bold text-base text-white">Namo AI Guide</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-black/30 text-amber-200">
                  Simhastha 2027
                </span>
              </div>
              <p className="text-xs text-orange-100">{t.aiSubtitle}</p>
            </div>
          </div>
          <button
            id="close-namo-ai-btn"
            type="button"
            onClick={onClose}
            aria-label={t.aiClose}
            className="w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Advisory banner */}
        <div className="bg-orange-50/90 border-b border-orange-100 px-3 py-1.5 text-[11px] text-orange-950 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-600 shrink-0" aria-hidden="true" />
          <span>{t.aiAdvisory}</span>
        </div>

        {/* Chat Message List */}
        <div
          id="namo-ai-messages"
          role="log"
          aria-live="polite"
          aria-label="Namo AI"
          className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 bg-stone-50/50"
        >
          {/* The welcome follows the current language and is not sent as history. */}
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 shadow-xs">
              <Bot className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs bg-white text-stone-800 border border-stone-200/90">
              <p className="whitespace-pre-line">{t.aiWelcome}</p>
            </div>
          </div>

          {messages.map((msg, index) => {
            const emergency = msg.response?.kind === 'emergency' ? msg.response.emergency : null;
            const canRetry = !!msg.error || !!msg.response?.aiError?.retryable;
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 shadow-xs">
                    <Bot className="w-4 h-4" aria-hidden="true" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-orange-600 text-white rounded-br-none'
                      : msg.error
                        ? 'bg-red-50 text-red-900 border border-red-200 rounded-bl-none'
                        : emergency
                          ? 'bg-white text-stone-900 border-2 border-red-500 rounded-bl-none'
                          : 'bg-white text-stone-800 border border-stone-200/90 rounded-bl-none'
                  }`}
                >
                  {msg.error && (
                    <p className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{msg.text}</span>
                    </p>
                  )}
                  {!msg.error && <p className="whitespace-pre-line">{msg.text}</p>}

                  {emergency && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emergency.callNumbers.map(number => (
                        <a
                          key={number}
                          href={`tel:${number}`}
                          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700"
                        >
                          <Phone className="w-4 h-4" aria-hidden="true" />
                          {callLabel(number)}
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.error && <p className="mt-1 text-[11px]">{t.aiEmergencyReminder}</p>}

                  {msg.response?.notice && (
                    <p className="mt-1.5 pt-1.5 border-t border-stone-100 text-[10px] text-amber-800 italic">
                      {msg.response.notice}
                    </p>
                  )}

                  {canRetry && (
                    <button
                      type="button"
                      onClick={() => ask(msg.error?.question ?? questionBefore(index), msg.id)}
                      disabled={!!pending}
                      className="mt-1.5 inline-flex min-h-12 items-center gap-1 rounded-xl px-2 text-xs font-semibold underline disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {t.aiRetry}
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-stone-400">
                    <span className={msg.sender === 'user' ? 'text-orange-100' : undefined}>{msg.timestamp}</span>
                    {msg.response && <span className="text-right text-[9px] text-stone-500">{sourceLabel(msg.response)}</span>}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-stone-800 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                    <User className="w-4 h-4" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}

          {pending && (
            <div role="status" className="flex gap-2.5 items-center text-xs text-stone-500 py-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl px-3.5 py-2 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" aria-hidden="true" />
                <span>{t.aiThinking}</span>
              </div>
              <button
                type="button"
                onClick={cancel}
                className="min-h-12 rounded-xl px-2 font-semibold text-stone-600 underline"
              >
                {t.aiCancel}
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Queries */}
        <div className="p-2.5 bg-white border-t border-stone-200 overflow-x-auto whitespace-nowrap">
          <div role="group" aria-label={t.aiSuggestions} className="flex gap-1.5">
            {SUGGESTED_QUESTIONS[currentLanguage].map((question, idx) => (
              <button
                key={idx}
                id={`ai-suggested-query-${idx}`}
                type="button"
                onClick={() => ask(question)}
                disabled={!!pending}
                className="text-[11px] bg-stone-100 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 border border-stone-200 rounded-lg px-2.5 py-1 text-stone-700 transition shrink-0 disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-stone-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              id="ai-chat-input"
              ref={inputRef}
              type="text"
              value={input}
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              onChange={(e) => setInput(e.target.value)}
              aria-label={t.aiInputLabel}
              placeholder={t.aiInputPlaceholder}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              id="ai-send-btn"
              type="submit"
              disabled={!!pending || !input.trim()}
              aria-label={t.aiSend}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white p-2 sm:px-3.5 rounded-xl transition flex items-center justify-center"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
