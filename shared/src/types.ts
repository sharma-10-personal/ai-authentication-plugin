export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SDKChatRequest {
  messages: Message[];
  userId?: string;
  sessionId?: string;
  provider?: string;
  model?: string;
  applicationName?: string;
  metadata?: Record<string, any>;
  groundingSource?: 'kb' | 'web';
}

export interface Citation {
  citationId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}

export interface Claim {
  claim: string;
  status: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED';
  explanation: string;
  citationId?: string;
}

export interface PolicyResult {
  decision: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  violatedRules: string[];
  explanation: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Metrics {
  totalLatencyMs: number;
  llmLatencyMs: number;
  ragLatencyMs: number;
  verificationLatencyMs: number;
  tokenUsage: TokenUsage;
  costUsd: number;
}

export interface SDKChatResponse {
  auditId: string;
  text: string;
  decision: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  hallucinationScore: number;
  factualTrustScore: number; // 0.0 to 1.0 grounding metric
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  citations: Citation[];
  claims: Claim[];
  policyExplanation: string;
  metrics: Metrics;
  rawThinking?: string;
  thinkingClaims?: Claim[];
  rawResponseBeforeBlock?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  size: number;
  status: 'indexing' | 'indexed' | 'failed';
  version: number;
  owner?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface ProviderConfig {
  providerId: string;
  name: string;
  enabled: boolean;
  defaultModel: string;
  apiKey?: string;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  latency: number;
}
