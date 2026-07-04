import { Message } from 'shared';
import { config } from '../config/index.js';
import { AIProvider, ProviderResponse } from './types.js';
import { MockProvider } from './MockProvider.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBED_MODEL = 'text-embedding-004';
const EMBED_DIMS = 1536;

/**
 * Google Gemini provider adapter.
 *
 * Supports:
 * - Chat completions via `generateContent` with optional thinking budget
 * - Native "thought" extraction from `parts[].thought === true` response fields
 * - Semantic embeddings via `text-embedding-004`, padded to 1536 dimensions
 *
 * Falls back to MockProvider if the API key is absent or the call fails.
 */
export class GeminiProvider implements AIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string = config.geminiApiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], model: string = 'gemini-2.5-flash'): Promise<ProviderResponse> {
    if (!this.apiKey) {
      console.warn('[GeminiProvider] API key missing. Falling back to MockProvider.');
      return new MockProvider().chat(messages, model);
    }

    const start = Date.now();
    try {
      // Map OpenAI-style message history to Gemini's `contents` format
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            thinkingConfig: { thinkingBudget: 1024 },
          },
        }),
      });

      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);

      const data = await res.json() as any;
      const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];

      // Separate thought parts from final answer parts
      const rawThinking = parts.filter(p => p.thought === true).map(p => p.text).join('\n').trim();
      const text = parts.filter(p => !p.thought).map(p => p.text).join('\n').trim();

      // Estimate token usage (Gemini v1beta doesn't always return exact counts)
      const wordCount = (s: string) => s.split(' ').length;
      const inputWords = messages.reduce((acc, m) => acc + wordCount(m.content), 0);
      return {
        text,
        rawThinking,
        tokenUsage: {
          promptTokens: Math.round(inputWords * 1.3),
          completionTokens: Math.round(wordCount(text) * 1.3),
          totalTokens: Math.round((inputWords + wordCount(text)) * 1.3),
        },
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.error('[GeminiProvider] chat error:', err.message);
      return new MockProvider().chat(messages, model);
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) return new MockProvider().embed(text);

    try {
      const res = await fetch(`${GEMINI_BASE}/${EMBED_MODEL}:embedContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
        }),
      });

      if (!res.ok) throw new Error(`Gemini Embeddings HTTP ${res.status}`);

      const data = await res.json() as any;
      const embedding: number[] = data.embedding.values;

      // Pad or truncate to EMBED_DIMS for uniform vector dimensions across providers
      if (embedding.length < EMBED_DIMS) {
        return [...embedding, ...new Array(EMBED_DIMS - embedding.length).fill(0)];
      }
      return embedding.slice(0, EMBED_DIMS);
    } catch {
      return new MockProvider().embed(text);
    }
  }
}
