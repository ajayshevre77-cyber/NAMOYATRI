/**
 * The Namo AI chat's request and response, shared by the chat window
 * (`components/NamoAIChatModal.tsx`) and the server (`server/chat.ts`), the
 * same way `itinerary.ts` is shared by the trip planner.
 */

export type ChatLanguage = 'en' | 'hi' | 'mr';

export const isChatLanguage = (value: unknown): value is ChatLanguage => value === 'en' || value === 'hi' || value === 'mr';

/** Longest message a user may send. */
export const MAX_CHAT_MESSAGE_LENGTH = 500;
/** Earlier messages sent with a question, so follow-ups ("how do I get there?") make sense. */
export const MAX_CHAT_HISTORY = 6;
/** Each earlier message is clipped to this many characters before it is sent. */
export const MAX_HISTORY_TEXT_LENGTH = 1000;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatRequest {
  message: string;
  language: ChatLanguage;
  history: ChatTurn[];
}

/**
 * Where an answer came from. The chat window labels each one differently:
 * - `gemini`: written by the AI, may be inaccurate, checked by no one;
 * - `built-in`: fixed text written for this app, from its own (demo) data;
 * - `safety-guidance`: fixed emergency guidance, never written by the AI.
 */
export type ChatSource = 'gemini' | 'built-in' | 'safety-guidance';

export type EmergencyType = 'medical' | 'missing_person' | 'danger' | 'general';

/** Real national numbers in India: 112 for any emergency, 108 for an ambulance. */
export const EMERGENCY_NUMBER = '112';
export const AMBULANCE_NUMBER = '108';

export interface ChatAiError {
  code: string;
  /** Whether asking again could get an AI answer. */
  retryable: boolean;
  retryAfterSeconds?: number;
}

export interface ChatResponse {
  reply: string;
  source: ChatSource;
  /** The AI model, only when `source` is `gemini`. */
  model: string | null;
  /** The language the reply is written in. */
  language: ChatLanguage;
  /** `fallback`: no answer to this question, only what the assistant can help with. */
  kind: 'answer' | 'fallback' | 'emergency';
  emergency: { type: EmergencyType; callNumbers: string[] } | null;
  /** Why this is not an AI answer, in the reply's language; null for AI and safety answers. */
  notice: string | null;
  /** Set when the AI was asked and failed, or could not be asked. */
  aiError: ChatAiError | null;
}

/**
 * The suggested-question buttons. Each one has a built-in answer on its own
 * topic (tests/chat.test.ts checks every one in every language), so they are
 * useful even when the AI is not set up.
 */
export const SUGGESTED_QUESTIONS: Record<ChatLanguage, string[]> = {
  en: [
    'How do I reach Trimbakeshwar from Nashik?',
    'What temples and ghats are near Ramkund?',
    'Tell me about Kushavarta Kund.',
    'How do I find a volunteer who speaks Marathi?',
    'Where can I find a hospital or pharmacy?',
    'How do ride requests work in this app?',
    'What should I do in an emergency?',
  ],
  hi: [
    'नासिक से त्र्यंबकेश्वर कैसे पहुँचें?',
    'रामकुंड के पास कौन से मंदिर और घाट हैं?',
    'कुशावर्त कुंड के बारे में बताइए।',
    'मराठी बोलने वाला स्वयंसेवक कैसे ढूँढें?',
    'अस्पताल या दवा की दुकान कहाँ मिलेगी?',
    'इस ऐप में सवारी का अनुरोध कैसे काम करता है?',
    'आपातकाल में क्या करें?',
  ],
  mr: [
    'नाशिकहून त्र्यंबकेश्वरला कसे जायचे?',
    'रामकुंडाजवळ कोणती मंदिरे आणि घाट आहेत?',
    'कुशावर्त कुंडाबद्दल सांगा.',
    'मराठी बोलणारा स्वयंसेवक कसा शोधायचा?',
    'रुग्णालय किंवा औषधाचे दुकान कुठे मिळेल?',
    'या ॲपमध्ये वाहन विनंती कशी चालते?',
    'आपत्कालीन परिस्थितीत काय करावे?',
  ],
};
