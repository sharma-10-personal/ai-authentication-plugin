import { SDKChatRequest, SDKChatResponse } from './types.js';

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
          metadata: request.metadata || {},
          groundingSource: request.groundingSource || 'kb'
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

/**
 * Wraps an OpenAI client instance so its chat completions are automatically
 * audited and secured by the Guardrail Middleware Gateway.
 */
export function wrapOpenAI(openaiClient: any, options: GuardrailOptions) {
  const guardrail = new Guardrail(options);
  
  if (openaiClient?.chat?.completions) {
    const originalCreate = openaiClient.chat.completions.create.bind(openaiClient.chat.completions);
    
    openaiClient.chat.completions.create = async function(params: any, requestOptions?: any) {
      const res = await guardrail.chat({
        messages: params.messages,
        model: params.model || options.model,
        provider: 'openai',
        applicationName: options.applicationName,
        metadata: { originalParams: params }
      });

      return {
        id: res.auditId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: params.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: res.text },
          finish_reason: res.decision === 'BLOCKED' ? 'content_filter' : 'stop'
        }],
        usage: {
          prompt_tokens: res.metrics?.tokenUsage?.promptTokens || 0,
          completion_tokens: res.metrics?.tokenUsage?.completionTokens || 0,
          total_tokens: res.metrics?.tokenUsage?.totalTokens || 0
        }
      };
    };
  }
  return openaiClient;
}

/**
 * Express Middleware to intercept, scan, and secure incoming chatbot routes.
 */
export function guardrailExpress(options: GuardrailOptions) {
  const guardrail = new Guardrail(options);
  
  return async (req: any, res: any, next: any) => {
    try {
      const messages = req.body.messages;
      if (!messages || !Array.isArray(messages)) {
        return next();
      }
      
      const auditRes = await guardrail.chat({
        messages,
        userId: req.body.userId || 'express_user',
        sessionId: req.body.sessionId || 'express_session',
        groundingSource: req.body.groundingSource || 'kb'
      });
      
      req.guardrail = auditRes;
      
      if (auditRes.decision === 'BLOCKED') {
        return res.status(400).json({
          error: 'Blocked by Guardrail Security Policy',
          explanation: auditRes.policyExplanation,
          fallbackText: auditRes.text,
          auditId: auditRes.auditId
        });
      }
      
      next();
    } catch (err: any) {
      console.error('[Guardrail Middleware] Audit scan failed:', err.message);
      next();
    }
  };
}
