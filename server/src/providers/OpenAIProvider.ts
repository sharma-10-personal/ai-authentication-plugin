import { Message } from 'shared';
import { config } from '../config/index.js';
import { AIProvider, ProviderResponse } from './types.js';
import { MockProvider } from './MockProvider.js';

/**
 * OpenAI provider adapter.
 * Supports chat completions and text-embedding-3-small for vector retrieval.
 * Falls back to MockProvider if the API key is absent or the call fails.
 */
export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string = config.openaiApiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], model: string = 'gpt-4o-mini'): Promise<ProviderResponse> {
    if (!this.apiKey) {
      console.warn('[OpenAIProvider] API key missing. Falling back to MockProvider.');
      return new MockProvider().chat(messages, model);
    }

    const start = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.1,
        }),
      });

      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);

      const data = await res.json() as any;
      const text: string = data.choices[0].message.content || '';
      const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        text,
        tokenUsage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.error('[OpenAIProvider] chat error:', err.message);
      return new MockProvider().chat(messages, model);
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) return new MockProvider().embed(text);

    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });

      if (!res.ok) throw new Error(`OpenAI Embeddings HTTP ${res.status}`);

      const data = await res.json() as any;
      return data.data[0].embedding as number[];
    } catch {
      return new MockProvider().embed(text);
    }
  }
}
