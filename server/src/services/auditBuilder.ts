import { Citation, TokenUsage } from 'shared';

interface AuditLogParams {
  auditId: string;
  appName: string;
  userId: string;
  sessionId: string;
  providerName: string;
  modelName: string;
  promptText: string;
  interceptRes: { sanitizedPrompt: string; piiRedacted: boolean; violations: string[] };
  citations: Citation[];
  rawText: string;
  finalResponseText: string;
  finalThinkingTrace: string;
  claims: any[];
  thinkingClaims: any[];
  hallucinationScore: number;
  factualTrustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  policyResult: { decision: string; violatedRules: string[]; explanation: string };
  totalLatencyMs: number;
  llmLatency: number;
  ragLatency: number;
  verifyLatency: number;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  metadata?: Record<string, any>;
}

/**
 * Constructs the structured audit log document persisted to MongoDB.
 * Centralising this avoids leaking shape details into the route handler.
 */
export function buildAuditLog(p: AuditLogParams) {
  return {
    auditId: p.auditId,
    applicationName: p.appName,
    userId: p.userId,
    sessionId: p.sessionId,
    provider: p.providerName,
    model: p.modelName,
    timestamp: new Date(),
    request: {
      rawPrompt: p.promptText,
      sanitizedPrompt: p.interceptRes.sanitizedPrompt,
      metadata: p.metadata ?? {},
    },
    retrieval: p.citations,
    response: {
      rawText: p.rawText,
      sanitizedText: p.finalResponseText,
      rawThinking: p.finalThinkingTrace,
    },
    verification: {
      extractedClaims: p.claims,
      thinkingClaims: p.thinkingClaims,
      hallucinationScore: p.hallucinationScore,
      factualTrustScore: p.factualTrustScore,
      riskLevel: p.riskLevel,
    },
    policy: {
      decision: p.policyResult.decision,
      violatedRules: p.policyResult.violatedRules,
      explanation: p.policyResult.explanation,
    },
    metrics: {
      totalLatencyMs: p.totalLatencyMs,
      llmLatencyMs: p.llmLatency,
      ragLatencyMs: p.ragLatency,
      verificationLatencyMs: p.verifyLatency,
      tokenUsage: p.tokenUsage,
      costUsd: p.estimatedCost,
    },
  };
}

/**
 * Builds the "thinking trace" displayed in the Audit Modal.
 *
 * Priority:
 *  1. Native model thinking (rawThinkingText) — used as-is when available.
 *  2. Constructed trace derived from NLI claim verification results.
 *  3. Minimal fallback when no claims were extracted.
 */
export function buildThinkingTrace(
  rawThinkingText: string,
  claims: any[],
  factualTrustScore: number,
  hallucinationScore: number,
  policyResult: { decision: string; explanation: string },
): string {
  if (rawThinkingText) return rawThinkingText;

  if (claims.length > 0) {
    const claimList = claims.map((c, i) => `   - Claim [${i + 1}]: "${c.claim}"`).join('\n');
    const verdicts = claims
      .map((c, i) => `   - Claim [${i + 1}]: Verified against ${c.citationId || 'knowledge base'}. Verdict: ${c.status}. Reason: ${c.explanation}`)
      .join('\n');

    return [
      '[Factual Verification Auditor Thoughts]',
      '',
      '1. Extracted Claims from Response:',
      claimList,
      '',
      '2. Natural Language Inference (NLI) Audit & Alignment Results:',
      verdicts,
      '',
      '3. Verification Metrics:',
      `   - Factual Trust Score: ${factualTrustScore} / 1.0`,
      `   - Hallucination Score: ${hallucinationScore}%`,
      `   - Security Verdict: ${policyResult.decision} (${policyResult.explanation})`,
    ].join('\n');
  }

  return [
    '[Factual Verification Auditor Thoughts]',
    '   - No checkable factual claims extracted from this response.',
    '   - Response classified as non-factual, greeting, or unsupported refusal.',
    '   - Factual Trust Score: 1.00 / 1.0 (APPROVED)',
  ].join('\n');
}
