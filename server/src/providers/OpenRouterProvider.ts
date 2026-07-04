import { Message } from 'shared';
import { config } from '../config/index.js';
import { AIProvider, ProviderResponse } from './types.js';
import { MockProvider } from './MockProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Maps simple model aliases to OpenRouter's namespaced model IDs. */
const MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o': 'openai/gpt-4o',
  'claude-3-haiku': 'anthropic/claude-3-haiku',
};

/**
 * OpenRouter provider adapter.
 * Routes requests through openrouter.ai, enabling access to many model providers
 * via a single unified API. Extracts `reasoning_content` for models that support it.
 * Falls back to MockProvider if the key is absent or the call fails.
 */
export class OpenRouterProvider implements AIProvider {
  private readonly apiKey: string;

  constructor(apiKey: string = config.openRouterApiKey) {
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], model: string = 'google/gemini-2.5-flash'): Promise<ProviderResponse> {
    if (!this.apiKey) {
      console.warn('[OpenRouterProvider] API key missing. Falling back to MockProvider.');
      return new MockProvider().chat(messages, model);
    }

    const start = Date.now();
    try {
      const resolvedModel = MODEL_MAP[model] ?? model;

      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/guardrail-plug',
          'X-Title': 'HalluciNOT Guardrail Gateway',
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);

      const data = await res.json() as any;
      const choice = data.choices[0];
      const text: string = choice.message.content || '';
      const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      // Extract reasoning trace if the model emits one (e.g. DeepSeek R1, o-series)
      const rawThinking: string | undefined =
        choice.message.reasoning_content ?? choice.message.reasoning ?? undefined;

      return {
        text,
        rawThinking,
        tokenUsage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.error('[OpenRouterProvider] chat error:', err.message);
      return new MockProvider().chat(messages, model);
    }
  }

  async embed(text: string): Promise<number[]> {
    // Delegate embedding to available direct providers
    if (config.geminiApiKey) return new GeminiProvider(config.geminiApiKey).embed(text);
    if (config.openaiApiKey) return new OpenAIProvider(config.openaiApiKey).embed(text);
    return new MockProvider().embed(text);
  }
}
