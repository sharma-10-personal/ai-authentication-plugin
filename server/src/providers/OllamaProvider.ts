import { Message } from 'shared';
import { config } from '../config/index.js';
import { AIProvider, ProviderResponse } from './types.js';
import { MockProvider } from './MockProvider.js';

const EMBED_DIMS = 1536;

/**
 * Ollama local-inference provider adapter.
 * Connects to a locally running Ollama server (default: http://localhost:11434).
 * Falls back to MockProvider if Ollama is unreachable.
 */
export class OllamaProvider implements AIProvider {
  private readonly endpoint: string;

  constructor(endpoint: string = config.ollamaEndpoint) {
    this.endpoint = endpoint;
  }

  async chat(messages: Message[], model: string = 'llama3'): Promise<ProviderResponse> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });

      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

      const data = await res.json() as any;
      return {
        text: data.message.content || '',
        tokenUsage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.warn(`[OllamaProvider] Cannot reach Ollama at ${this.endpoint}. Falling back to MockProvider.`);
      return new MockProvider().chat(messages, model);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const res = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'all-minilm', prompt: text }),
      });

      if (!res.ok) throw new Error(`Ollama Embeddings HTTP ${res.status}`);

      const data = await res.json() as any;
      const embedding: number[] = data.embedding;

      if (embedding.length < EMBED_DIMS) {
        return [...embedding, ...new Array(EMBED_DIMS - embedding.length).fill(0)];
      }
      return embedding.slice(0, EMBED_DIMS);
    } catch {
      return new MockProvider().embed(text);
    }
  }
}
