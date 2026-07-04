import { SDKChatRequest, SDKChatResponse } from 'shared';

export interface GuardrailOptions {
  endpoint?: string;
  apiKey: string;
  provider?: 'openai' | 'gemini' | 'ollama' | 'mock' | string;
  model?: string;
  applicationName?: string;
}

export class Guardrail {
  private endpoint: string;
  private apiKey: string;
  private provider: string;
  private model: string;
  private applicationName: string;

  constructor(options: GuardrailOptions) {
    this.endpoint = options.endpoint || 'http://localhost:5050';
    this.apiKey = options.apiKey;
    this.provider = options.provider || 'openai';
    this.model = options.model || 'gpt-4o-mini';
    this.applicationName = options.applicationName || 'SDK Application';

    if (!this.apiKey) {
      throw new Error('[Guardrail SDK] Initialisation Error: API Key (apiKey) is required.');
    }
  }

  /**
   * Routes chat completions through the Guardrail Middleware Gateway
   */
  async chat(request: SDKChatRequest): Promise<SDKChatResponse> {
    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          messages: request.messages,
          userId: request.userId || 'sdk_user',
          sessionId: request.sessionId || 'sdk_session',
          provider: request.provider || this.provider,
          model: request.model || this.model,
          applicationName: request.applicationName || this.applicationName,
          metadata: request.metadata || {}
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Guardrail Middleware Error [${response.status}]: ${errorText}`);
      }

      return await response.json() as SDKChatResponse;
    } catch (err: any) {
      console.error('[Guardrail SDK] Chat Request Failed:', err.message);
      throw err;
    }
  }
}
