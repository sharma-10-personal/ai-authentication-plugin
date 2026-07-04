/**
 * @module providers
 *
 * AI Provider abstraction layer for the Guardrail Gateway.
 *
 * All providers implement the `AIProvider` interface, so the gateway can swap
 * between OpenAI, Gemini, Ollama, OpenRouter, or the deterministic Mock at
 * runtime — zero changes to the pipeline.
 *
 * Usage:
 * ```ts
 * import { ProviderFactory } from './providers/index.js';
 * const provider = ProviderFactory.getProvider('gemini');
 * const response = await provider.chat(messages, 'gemini-2.5-flash');
 * ```
 */

export type { AIProvider, ProviderResponse } from './types.js';
export { MockProvider } from './MockProvider.js';
export { OpenAIProvider } from './OpenAIProvider.js';
export { GeminiProvider } from './GeminiProvider.js';
export { OllamaProvider } from './OllamaProvider.js';
export { OpenRouterProvider } from './OpenRouterProvider.js';

import { config } from '../config/index.js';
import type { AIProvider } from './types.js';
import { MockProvider } from './MockProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';

/**
 * Instantiates the correct provider adapter by name.
 * Defaults to MockProvider for unknown or missing provider names.
 */
export class ProviderFactory {
  static getProvider(providerName: string, apiKey?: string): AIProvider {
    switch (providerName.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(apiKey ?? config.openaiApiKey);
      case 'gemini':
        return new GeminiProvider(apiKey ?? config.geminiApiKey);
      case 'openrouter':
        return new OpenRouterProvider(apiKey ?? config.openRouterApiKey);
      case 'ollama':
        return new OllamaProvider(config.ollamaEndpoint);
      case 'mock':
        return new MockProvider();
      default:
        console.warn(`[ProviderFactory] Unknown provider "${providerName}". Using MockProvider.`);
        return new MockProvider();
    }
  }
}
