import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SDKChatRequest, Message, Citation } from 'shared';

import { AuditRepository } from '../db/index.js';
import { ProviderFactory } from '../providers/index.js';
import { scanPrompt } from '../middleware/interceptor.js';
import { RetrievalEngine } from '../retrieval/index.js';
import { WebSearchRetriever } from '../retrieval/webSearch.js';
import { VerificationEngine } from '../verification/index.js';
import { PolicyEngine, DEFAULT_POLICIES } from '../policy/index.js';
import { buildAuditLog, buildThinkingTrace } from '../services/auditBuilder.js';

const router = Router();

/**
 * POST /api/chat
 *
 * The core guardrail pipeline endpoint. Executes a 5-step safety pipeline:
 *  1. Input Interceptor  — PII detection & prompt injection scan
 *  2. RAG Retrieval      — semantic vector search or live web search
 *  3. LLM Inference      — grounded prompt injected into the target model
 *  4. Fact Verification  — NLI claim extraction and hallucination scoring
 *  5. Policy Engine      — APPROVED / FLAGGED / BLOCKED decision
 */
router.post('/', async (req: Request, res: Response) => {
  const startTotal = Date.now();
  const body = req.body as SDKChatRequest;

  const messages: Message[] = body.messages ?? [];
  const promptText = messages[messages.length - 1]?.content ?? '';
  const providerName = body.provider ?? 'openai';
  const modelName = body.model ?? 'gpt-4o-mini';
  const appName = body.applicationName ?? 'Default App';
  const userId = body.userId ?? 'anonymous';
  const sessionId = body.sessionId ?? 'session_default';
  const groundingMode = body.groundingSource ?? 'kb';

  console.log(`\n====================================================`);
  console.log(`📡 [GATEWAY REQUEST] App: "${appName}" | User: "${userId}" | Session: "${sessionId}"`);
  console.log(`🤖 Config Target: Provider: ${providerName.toUpperCase()} | Model: ${modelName}`);
  console.log(`💬 User Prompt: "${promptText}"`);
  console.log(`----------------------------------------------------`);

  const provider = ProviderFactory.getProvider(providerName);

  // ── Step 1: Input Interceptor ──────────────────────────────────────────────
  const interceptRes = scanPrompt(promptText);
  console.log(`🛡️ [Step 1: Interceptor] PII Redacted: ${interceptRes.piiRedacted} | isSafe: ${interceptRes.isSafe}`);
  if (interceptRes.piiRedacted) {
    console.log(`   └─ Redacted Prompt: "${interceptRes.sanitizedPrompt}"`);
  }

  // ── Step 2: RAG / Web Retrieval ────────────────────────────────────────────
  const startRag = Date.now();
  let citations: Citation[] = [];
  if (interceptRes.isSafe) {
    if (groundingMode === 'web') {
      citations = await WebSearchRetriever.search(interceptRes.sanitizedPrompt);
    } else {
      citations = await new RetrievalEngine(provider).retrieve(interceptRes.sanitizedPrompt, 3);
    }
  }
  const ragLatency = Date.now() - startRag;
  console.log(`🗄️ [Step 2: RAG Context] Retrieved ${citations.length} documents in ${ragLatency}ms`);
  citations.forEach((c, i) => {
    console.log(`   └─ [cit_${i + 1}] Source: "${c.documentName}" (Jaccard Score: ${c.score})`);
    console.log(`      Text: "${c.content.substring(0, 120)}..."`);
  });

  // ── Step 3: LLM Inference ─────────────────────────────────────────────────
  const startLlm = Date.now();
  let rawText = '';
  let rawThinkingText = '';
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let llmLatency = 0;

  if (interceptRes.isSafe) {
    const augmentedMessages: Message[] = [...messages.slice(0, -1)];

    if (citations.length > 0) {
      const contextStr = citations.map(c => `[Document: ${c.documentName}] ${c.content}`).join('\n\n');
      augmentedMessages.push({
        role: 'user',
        content: `Instructions: Answer the question using ONLY the provided verified context. If the answer is not supported by the context, respond "I do not have access to that information in my knowledge files."\n\nContext:\n${contextStr}\n\nUser Question: ${interceptRes.sanitizedPrompt}`,
      });
    } else {
      augmentedMessages.push({ role: 'user', content: interceptRes.sanitizedPrompt });
    }

    try {
      const llmRes = await provider.chat(augmentedMessages, modelName);
      rawText = llmRes.text;
      rawThinkingText = llmRes.rawThinking ?? '';
      tokenUsage = llmRes.tokenUsage;
      llmLatency = llmRes.latencyMs;
    } catch (err: any) {
      console.error('🚨 [LLM Failure]', err.message);
      return res.status(500).json({ error: `LLM execution error: ${err.message}` });
    }
  } else {
    rawText = `Blocked: Safeguards detected policy violation: [${interceptRes.violations.join(', ')}].`;
  }

  console.log(`🤖 [Step 3: LLM Response] Latency: ${llmLatency}ms | Tokens: ${tokenUsage.totalTokens}`);
  console.log(`   └─ Response: "${rawText.substring(0, 160).replace(/\n/g, ' ')}${rawText.length > 160 ? '...' : ''}"`);
  if (rawThinkingText) {
    console.log(`   └─ Raw Thoughts: "${rawThinkingText.substring(0, 160).replace(/\n/g, ' ')}..."`);
  }

  // ── Step 4: Fact Verification ──────────────────────────────────────────────
  const startVerify = Date.now();
  let claims: any[] = [];
  let thinkingClaims: any[] = [];
  let hallucinationScore = 0;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

  if (interceptRes.isSafe && citations.length > 0) {
    const verifier = new VerificationEngine(provider);
    if (rawText) {
      const verifyRes = await verifier.verify(rawText, citations);
      claims = verifyRes.claims;
      hallucinationScore = verifyRes.hallucinationScore;
      riskLevel = verifyRes.riskLevel;
    }
    if (rawThinkingText) {
      console.log(`⚖️ [Audit] Verifying AI raw thoughts...`);
      const thoughtVerifyRes = await verifier.verify(rawThinkingText, citations);
      thinkingClaims = thoughtVerifyRes.claims;
      console.log(`   └─ Verified ${thinkingClaims.length} thought claims`);
    }
  }

  const verifyLatency = Date.now() - startVerify;
  const factualTrustScore = parseFloat((1.0 - hallucinationScore / 100).toFixed(2));

  console.log(`⚖️ [Step 4: Fact Audit] Verified ${claims.length} claims in ${verifyLatency}ms`);
  console.log(`   ├─ Factual Trust Score: ${factualTrustScore} / 1.0`);
  console.log(`   └─ Risk Level: ${riskLevel}`);
  claims.forEach((c, i) => {
    console.log(`      └─ Claim [${i + 1}] "${c.claim.substring(0, 50)}...": ${c.status} (${c.explanation})`);
  });

  // ── Step 5: Policy Engine ──────────────────────────────────────────────────
  const policyResult = new PolicyEngine(DEFAULT_POLICIES).evaluate({
    hallucinationScore,
    citationCount: citations.length,
    rawPrompt: promptText,
    rawResponse: rawText,
    piiDetected: interceptRes.piiRedacted,
  });

  const totalLatencyMs = Date.now() - startTotal;
  const estimatedCost = ((tokenUsage.promptTokens / 1000) * 0.0015) + ((tokenUsage.completionTokens / 1000) * 0.002);

  let finalResponseText = rawText;
  if (policyResult.decision === 'BLOCKED') {
    finalResponseText = `BLOCKED: This response was rejected by corporate policies. Reason: ${policyResult.explanation}`;
  } else if (policyResult.decision === 'FLAGGED') {
    finalResponseText = `[WARNING: Policy flags: ${policyResult.violatedRules.join(', ')}]\n\n${rawText}`;
  }

  console.log(`🚦 [Step 5: Policy Verdict] Decision: ${policyResult.decision}`);
  if (policyResult.decision !== 'APPROVED') console.log(`   └─ Reason: "${policyResult.explanation}"`);
  console.log(`⏱️  [Metrics] Total Time: ${totalLatencyMs}ms | Estimated Cost: $${estimatedCost.toFixed(5)}`);
  console.log(`====================================================\n`);

  // ── Step 6: Persist Audit Trail ────────────────────────────────────────────
  const finalThinkingTrace = buildThinkingTrace(rawThinkingText, claims, factualTrustScore, hallucinationScore, policyResult);
  const auditId = `aud_${uuidv4().substring(0, 8)}`;
  const auditLog = buildAuditLog({
    auditId, appName, userId, sessionId, providerName, modelName, promptText,
    interceptRes, citations, rawText, finalResponseText, finalThinkingTrace,
    claims, thinkingClaims, hallucinationScore, factualTrustScore, riskLevel,
    policyResult, totalLatencyMs, llmLatency, ragLatency, verifyLatency,
    tokenUsage, estimatedCost, metadata: body.metadata,
  });

  await AuditRepository.save(auditLog);

  res.json({
    auditId,
    text: finalResponseText,
    decision: policyResult.decision,
    hallucinationScore,
    factualTrustScore,
    riskLevel,
    citations,
    claims,
    policyExplanation: policyResult.explanation,
    metrics: auditLog.metrics,
    rawThinking: rawThinkingText,
    thinkingClaims,
    rawResponseBeforeBlock: rawText,
  });
});

export default router;
