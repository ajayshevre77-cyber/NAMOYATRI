/**
 * The one Gemini client, shared by the Namo AI chat and the trip planner.
 *
 * The key is read from the environment when needed (server.ts runs
 * dotenv.config() after its imports), never logged and never sent to the
 * browser. The `.env.example` placeholder counts as no key, so a copied
 * example file says "not configured" instead of failing at Google.
 */
import { GoogleGenAI } from '@google/genai';

/** The model the project already used for the chat; reused for trip planning. */
export const GEMINI_MODEL = 'gemini-3.8-flash';

const GEMINI_KEY_PLACEHOLDER = 'MY_GEMINI_API_KEY';

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== GEMINI_KEY_PLACEHOLDER ? key : null;
}

export const isGeminiConfigured = (): boolean => geminiApiKey() !== null;

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

/** The client for the current key, or null when Gemini is not configured. */
export function getGeminiClient(): GoogleGenAI | null {
  const key = geminiApiKey();
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}
