import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import { SDKChatRequest, Message, Citation, UploadedDocument, DocumentChunk } from 'shared';

import { 
  AuditRepository, 
  DocumentRepository, 
  ChunkRepository, 
  ProviderRepository 
} from '../db/index.js';
import { ProviderFactory } from '../providers/Provider.js';
import { scanPrompt } from '../middleware/interceptor.js';
import { RetrievalEngine, chunkText } from '../retrieval/index.js';
import { WebSearchRetriever } from '../retrieval/webSearch.js';
import { VerificationEngine } from '../verification/index.js';
import { PolicyEngine, DEFAULT_POLICIES } from '../policy/index.js';

import { config } from '../config/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ----------------------------------------------------
// SDK CHAT GATEWAY ENDPOINT: POST /chat
// ----------------------------------------------------
router.post('/chat', async (req: Request, res: Response) => {
  const startTotal = Date.now();
  const body = req.body as SDKChatRequest;

  const messages = body.messages || [];
  const latestMessage = messages[messages.length - 1];
  const promptText = latestMessage ? latestMessage.content : '';

  const providerName = body.provider || 'openai';
  const modelName = body.model || 'gpt-4o-mini';
  const appName = body.applicationName || 'Default App';
  const userId = body.userId || 'anonymous';
  const sessionId = body.sessionId || 'session_default';

  console.log(`\n====================================================`);
  console.log(`📡 [GATEWAY REQUEST] App: "${appName}" | User: "${userId}" | Session: "${sessionId}"`);
  console.log(`🤖 Config Target: Provider: ${providerName.toUpperCase()} | Model: ${modelName}`);
  console.log(`💬 User Prompt: "${promptText}"`);
  console.log(`----------------------------------------------------`);

  // Instantiate Provider
  const provider = ProviderFactory.getProvider(providerName);

  // 1. Input Interceptor Scan
  const interceptRes = scanPrompt(promptText);
  console.log(`🛡️ [Step 1: Interceptor] PII Redacted: ${interceptRes.piiRedacted} | isSafe: ${interceptRes.isSafe}`);
  if (interceptRes.piiRedacted) {
    console.log(`   └─ Redacted Prompt: "${interceptRes.sanitizedPrompt}"`);
  }

  // 2. RAG Retrieval Step
  const startRag = Date.now();
  let citations: Citation[] = [];
  const groundingMode = body.groundingSource || 'kb';
  if (interceptRes.isSafe) {
    if (groundingMode === 'web') {
      citations = await WebSearchRetriever.search(interceptRes.sanitizedPrompt);
    } else {
      const retrievalEngine = new RetrievalEngine(provider);
      citations = await retrievalEngine.retrieve(interceptRes.sanitizedPrompt, 3);
    }
  }
  const ragLatency = Date.now() - startRag;
  console.log(`🗄️ [Step 2: RAG Context] Retrieved ${citations.length} documents in ${ragLatency}ms`);
  citations.forEach((c, idx) => {
    console.log(`   └─ [cit_${idx + 1}] Source: "${c.documentName}" (Jaccard Score: ${c.score})`);
    console.log(`      Text: "${c.content.substring(0, 120)}..."`);
  });

  // 3. Inject Context & Invoke LLM Provider
  const startLlm = Date.now();
  let rawText = '';
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let llmLatency = 0;

  if (interceptRes.isSafe) {
    // Augment prompt with RAG context
    const augmentedMessages: Message[] = [...messages.slice(0, -1)];
    
    if (citations.length > 0) {
      const contextStr = citations.map(c => `[Document: ${c.documentName}] ${c.content}`).join('\n\n');
      const groundedPrompt = `Instructions: Answer the question using ONLY the provided verified context. If the answer is not supported by the context, respond "I do not have access to that information in my knowledge files."

Context:
${contextStr}

User Question: ${interceptRes.sanitizedPrompt}`;
      
      augmentedMessages.push({ role: 'user', content: groundedPrompt });
    } else {
      augmentedMessages.push({ role: 'user', content: interceptRes.sanitizedPrompt });
    }

    try {
      const llmResponse = await provider.chat(augmentedMessages, modelName);
      rawText = llmResponse.text;
      tokenUsage = llmResponse.tokenUsage;
      llmLatency = llmResponse.latencyMs;
      (req as any).rawThinking = llmResponse.rawThinking; // Save to request context
    } catch (err: any) {
      console.error(`🚨 [LLM Failure] Error executing completion:`, err.message);
      return res.status(500).json({ error: `LLM execution error: ${err.message}` });
    }
  } else {
    // Interceptor flagged prompt injection or sensitive PII block actions
    rawText = `Blocked: Safeguards detected policy violation: [${interceptRes.violations.join(', ')}].`;
  }
  const rawThinkingText = (req as any).rawThinking || '';
  console.log(`🤖 [Step 3: LLM Response] Latency: ${llmLatency}ms | Tokens: ${tokenUsage.totalTokens}`);
  console.log(`   └─ Response: "${rawText.substring(0, 160).replace(/\n/g, ' ')}${rawText.length > 160 ? '...' : ''}"`);
  if (rawThinkingText) {
    console.log(`   └─ Raw Thoughts: "${rawThinkingText.substring(0, 160).replace(/\n/g, ' ')}${rawThinkingText.length > 160 ? '...' : ''}"`);
  }

  // 4. Fact Verification Engine
  const startVerify = Date.now();
  let claims: any[] = [];
  let thinkingClaims: any[] = [];
  let hallucinationScore = 0;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

  if (interceptRes.isSafe && citations.length > 0) {
    const verifier = new VerificationEngine(provider);
    if (rawText.length > 0) {
      const verifyRes = await verifier.verify(rawText, citations);
      claims = verifyRes.claims;
      hallucinationScore = verifyRes.hallucinationScore;
      riskLevel = verifyRes.riskLevel;
    }
    if (rawThinkingText.length > 0) {
      console.log(`⚖️ [Audit] Verifying AI raw thoughts...`);
      const thinkVerifyRes = await verifier.verify(rawThinkingText, citations);
      thinkingClaims = thinkVerifyRes.claims;
      console.log(`   └─ Verified ${thinkingClaims.length} thought claims`);
    }
  }
  const verifyLatency = Date.now() - startVerify;
  const factualTrustScore = parseFloat((1.0 - (hallucinationScore / 100)).toFixed(2));

  console.log(`⚖️ [Step 4: Fact Audit] Verified ${claims.length} claims in ${verifyLatency}ms`);
  console.log(`   ├─ Factual Trust Score: ${factualTrustScore} / 1.0`);
  console.log(`   └─ Risk Level: ${riskLevel}`);
  claims.forEach((c, idx) => {
    console.log(`      └─ Claim [${idx + 1}] "${c.claim.substring(0, 50)}...": ${c.status} (${c.explanation})`);
  });

  // 5. Policy Engine Evaluation
  const policyEngine = new PolicyEngine(DEFAULT_POLICIES);
  const policyResult = policyEngine.evaluate({
    hallucinationScore,
    citationCount: citations.length,
    rawPrompt: promptText,
    rawResponse: rawText,
    piiDetected: interceptRes.piiRedacted
  });

  // Calculate costs (Simple heuristic estimates)
  const costPer1kInput = 0.0015;
  const costPer1kOutput = 0.002;
  const estimatedCost = ((tokenUsage.promptTokens / 1000) * costPer1kInput) + 
                        ((tokenUsage.completionTokens / 1000) * costPer1kOutput);

  const totalLatencyMs = Date.now() - startTotal;

  // Final sanitized output text depending on policy decision
  let finalResponseText = rawText;
  if (policyResult.decision === 'BLOCKED') {
    finalResponseText = `BLOCKED: This response was rejected by corporate policies. Reason: ${policyResult.explanation}`;
  } else if (policyResult.decision === 'FLAGGED') {
    // Mask/append warnings
    finalResponseText = `[WARNING: Policy flags: ${policyResult.violatedRules.join(', ')}]\n\n${rawText}`;
  }
  console.log(`🚦 [Step 5: Policy Verdict] Decision: ${policyResult.decision}`);
  if (policyResult.decision !== 'APPROVED') {
    console.log(`   └─ Reason: "${policyResult.explanation}"`);
  }
  console.log(`⏱️  [Metrics] Total Time: ${totalLatencyMs}ms | Estimated Cost: $${estimatedCost.toFixed(5)}`);
  console.log(`====================================================\n`);

  // 6. Log Audit Trail
  const auditId = `aud_${uuidv4().substring(0, 8)}`;
  const auditLog = {
    auditId,
    applicationName: appName,
    userId,
    sessionId,
    provider: providerName,
    model: modelName,
    timestamp: new Date(),
    request: {
      rawPrompt: promptText,
      sanitizedPrompt: interceptRes.sanitizedPrompt,
      metadata: body.metadata || {}
    },
    retrieval: citations,
    response: {
      rawText: rawText,
      sanitizedText: finalResponseText,
      rawThinking: rawThinkingText
    },
    verification: {
      extractedClaims: claims,
      thinkingClaims,
      hallucinationScore,
      factualTrustScore,
      riskLevel
    },
    policy: {
      decision: policyResult.decision,
      violatedRules: policyResult.violatedRules,
      explanation: policyResult.explanation
    },
    metrics: {
      totalLatencyMs,
      llmLatencyMs: llmLatency,
      ragLatencyMs: ragLatency,
      verificationLatencyMs: verifyLatency,
      tokenUsage,
      costUsd: estimatedCost
    }
  };

  await AuditRepository.save(auditLog);

  // Return SDK Response
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
    rawResponseBeforeBlock: rawText
  });
});

// ----------------------------------------------------
// DOCUMENT MANAGEMENT ENDPOINTS
// ----------------------------------------------------
router.post('/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { originalname, size, buffer } = req.file;
  const docId = `doc_${uuidv4().substring(0, 8)}`;
  
  try {
    let fileText = '';
    const fileType = originalname.split('.').pop()?.toLowerCase() || 'txt';

    if (fileType === 'pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        fileText = pdfData.text;
      } catch (pdfErr) {
        console.warn('pdf-parse failed, falling back to buffer-string extraction.');
        fileText = buffer.toString('utf-8');
      }
    } else {
      fileText = buffer.toString('utf-8');
    }

    // Save Doc Record
    const uploadedDoc: UploadedDocument = {
      id: docId,
      name: originalname,
      type: fileType,
      uploadedAt: new Date().toISOString(),
      size,
      status: 'indexing',
      version: 1
    };

    await DocumentRepository.save(uploadedDoc);

    // Split text into chunks
    const textChunks = chunkText(fileText);
    const activeProviderName = config.defaultProvider || 'mock';
    const defaultProvider = ProviderFactory.getProvider(activeProviderName);

    console.log(`📤 [Document Indexing] Uploaded: "${originalname}" (${size} bytes)`);
    console.log(`   ├─ Split into ${textChunks.length} content segments`);
    console.log(`   └─ Generating semantic embeddings using: ${activeProviderName.toUpperCase()}`);

    // Create chunks records
    const chunksToInsert: DocumentChunk[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      const chunkTextContent = textChunks[i];
      // Generate embedding vector
      const embedVector = await defaultProvider.embed(chunkTextContent);

      chunksToInsert.push({
        id: `chk_${uuidv4().substring(0, 8)}`,
        documentId: docId,
        documentName: originalname,
        content: chunkTextContent,
        embedding: embedVector,
        metadata: { index: i, wordCount: chunkTextContent.split(/\s+/).length }
      });
    }

    await ChunkRepository.saveMany(chunksToInsert);
    
    // Update Doc status
    uploadedDoc.status = 'indexed';
    // Using simple local updates
    const docs = await DocumentRepository.findAll();
    const activeDoc = docs.find(d => d.id === docId);
    if (activeDoc) {
      activeDoc.status = 'indexed';
    }

    res.json({ success: true, document: uploadedDoc, chunksIndexed: chunksToInsert.length });
  } catch (err: any) {
    res.status(500).json({ error: `File indexing error: ${err.message}` });
  }
});

router.get('/documents', async (req: Request, res: Response) => {
  const docs = await DocumentRepository.findAll();
  res.json(docs);
});

router.delete('/documents/:id', async (req: Request, res: Response) => {
  const deleted = await DocumentRepository.deleteById(req.params.id);
  res.json({ success: deleted });
});

// ----------------------------------------------------
// AUDIT MANAGEMENT ENDPOINTS
// ----------------------------------------------------
router.get('/audits', async (req: Request, res: Response) => {
  const audits = await AuditRepository.findAll();
  res.json(audits);
});

router.get('/audits/:id', async (req: Request, res: Response) => {
  const audit = await AuditRepository.findById(req.params.id);
  if (!audit) {
    return res.status(404).json({ error: 'Audit log not found.' });
  }
  res.json(audit);
});

// ----------------------------------------------------
// METRICS ENDPOINT: GET /metrics
// ----------------------------------------------------
router.get('/metrics', async (req: Request, res: Response) => {
  const audits = await AuditRepository.findAll();

  let totalRequests = audits.length;
  let totalLatency = 0;
  let totalCost = 0;
  let blockedRequests = 0;
  let flaggedRequests = 0;
  let totalHallucinationScore = 0;

  const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const providerDistribution: Record<string, number> = {};

  audits.forEach(a => {
    totalLatency += a.metrics?.totalLatencyMs || 0;
    totalCost += a.metrics?.costUsd || 0;
    
    if (a.policy?.decision === 'BLOCKED') blockedRequests++;
    if (a.policy?.decision === 'FLAGGED') flaggedRequests++;
    
    totalHallucinationScore += a.verification?.hallucinationScore || 0;

    const risk = (a.verification?.riskLevel || 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    riskDistribution[risk] = (riskDistribution[risk] || 0) + 1;

    const prov = a.provider || 'unknown';
    providerDistribution[prov] = (providerDistribution[prov] || 0) + 1;
  });

  res.json({
    totalRequests,
    avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
    totalCostUsd: parseFloat(totalCost.toFixed(4)),
    avgHallucinationScore: totalRequests > 0 ? Math.round(totalHallucinationScore / totalRequests) : 0,
    blockedCount: blockedRequests,
    flaggedCount: flaggedRequests,
    approvedCount: totalRequests - blockedRequests - flaggedRequests,
    riskDistribution,
    providerDistribution
  });
});

// ----------------------------------------------------
// PROVIDER CONFIG MANAGEMENT ENDPOINTS
// ----------------------------------------------------
router.get('/providers', async (req: Request, res: Response) => {
  const list = await ProviderRepository.findAll();
  res.json(list);
});

router.post('/providers', async (req: Request, res: Response) => {
  const provider = req.body;
  const updated = await ProviderRepository.save(provider);
  res.json(updated);
});

export default router;
