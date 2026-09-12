import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  HelpCircle, 
  Loader2, 
  ShieldCheck, 
  Compass, 
  HeartHandshake 
} from 'lucide-react';
import { SupportedLanguage } from '../i18n';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  source?: string;
  note?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: SupportedLanguage;
}

const EXAMPLE_QUERIES = [
  'How do I reach Trimbakeshwar from Nashik Road?',
  'What temples and ghats are near Ramkund?',
  'Explain the history and significance of Kushavarta Kund.',
  'Find a Marathi-speaking volunteer for senior citizen assistance.',
  'Where is the nearest 24x7 medical emergency camp?',
];

export const NamoAIChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentLanguage,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: currentLanguage === 'hi'
        ? 'नमस्ते! मैं नमो एआई हूँ, सिंहस्थ कुंभ २०२७ का आपका डिजिटल तीर्थ मार्गदर्शक। आप मुझसे मंदिर, स्नान समय, शटल बसें अथवा स्वयंसेवक सहायता के बारे में पूछ सकते हैं।'
        : currentLanguage === 'mr'
        ? 'नमस्कार! मी नमो एआय आहे, सिंहस्थ कुंभ २०२७ चा आपला डिजिटल मार्गदर्शक. आपण मला मंदिरे, शाही स्नान, वाहतूक किंवा स्वयंसेवक मदतीविषयी विचारू शकता.'
        : 'Namaste! I am Namo AI, your pilgrimage assistant for Nashik–Trimbakeshwar Simhastha Kumbh 2027. How may I assist your holy yatra today?',
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (queryToSend?: string) => {
    const q = (queryToSend || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryToSend) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, language: currentLanguage }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id: 'reply_' + Date.now(),
        sender: 'assistant',
        text: data.reply || 'Thank you for your inquiry. Please consult the Kumbh Helpdesk if urgent.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: data.source,
        note: data.note,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          sender: 'assistant',
          text: 'Unable to reach Namo AI service at the moment. Please verify your internet connection or refer to official Kumbh bulletins.',
          timestamp: 'Just now',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="namo-ai-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/75 backdrop-blur-xs animate-in fade-in"
    >
      <div 
        id="namo-ai-modal-container"
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
                <h3 className="font-bold text-base text-white">Namo AI Guide</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-black/30 text-amber-200">
                  Simhastha 2027
                </span>
              </div>
              <p className="text-xs text-orange-100">
                Grounded Pilgrim Knowledge & Assistance
              </p>
            </div>
          </div>
          <button
            id="close-namo-ai-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Advisory banner */}
        <div className="bg-orange-50/90 border-b border-orange-100 px-3 py-1.5 text-[11px] text-orange-950 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span>Grounded in verified Nashik–Trimbakeshwar Kumbh guidelines. For life emergencies, dial 112 / 108.</span>
        </div>

        {/* Chat Message List */}
        <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 bg-stone-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-orange-600 text-white rounded-br-none'
                    : 'bg-white text-stone-800 border border-stone-200/90 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>
                <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-stone-400">
                  <span>{msg.timestamp}</span>
                  {msg.source && (
                    <span className="font-mono text-[9px] text-stone-400">
                      via {msg.source}
                    </span>
                  )}
                </div>
                {msg.note && (
                  <p className="mt-1.5 pt-1.5 border-t border-stone-100 text-[10px] text-amber-800 italic">
                    {msg.note}
                  </p>
                )}
              </div>
              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-stone-800 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 items-center text-xs text-stone-500 py-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl px-3.5 py-2 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                <span>Namo AI is retrieving verified Kumbh records...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Queries */}
        <div className="p-2.5 bg-white border-t border-stone-200 overflow-x-auto whitespace-nowrap">
          <div className="flex gap-1.5">
            {EXAMPLE_QUERIES.map((ex, idx) => (
              <button
                key={idx}
                id={`ai-suggested-query-${idx}`}
                onClick={() => handleSend(ex)}
                className="text-[11px] bg-stone-100 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 border border-stone-200 rounded-lg px-2.5 py-1 text-stone-700 transition shrink-0"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-stone-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="ai-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Namo AI about temples, shuttles, passes, volunteers..."
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              id="ai-send-btn"
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white p-2 sm:px-3.5 rounded-xl transition flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
