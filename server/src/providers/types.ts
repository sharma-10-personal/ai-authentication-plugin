import { Message, TokenUsage } from 'shared';

/**
 * The normalized response returned by every AI provider adapter.
 */
export interface ProviderResponse {
  /** The model's final text output. */
  text: string;
  /** Token consumption breakdown. */
  tokenUsage: TokenUsage;
  /** Wall-clock latency for the model call in milliseconds. */
  latencyMs: number;
  /**
   * Raw internal "thinking" text emitted before the final answer.
   * Available on models that support extended reasoning (Gemini 2.5, o-series, etc.)
   */
  rawThinking?: string;
}

/**
 * Common interface every AI provider adapter must implement.
 * Enables the ProviderFactory to swap providers transparently.
 */
export interface AIProvider {
  /**
   * Send a chat completion request and return a normalized response.
   * @param messages - Full conversation history in OpenAI message format.
   * @param model - Model name to target (provider-specific).
   */
  chat(messages: Message[], model?: string): Promise<ProviderResponse>;

  /**
   * Generate a semantic embedding vector for the given text.
   * All providers return a 1536-dimensional float array for compatibility.
   * @param text - The input text to embed.
   */
  embed(text: string): Promise<number[]>;
}
