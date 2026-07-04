import { Message } from 'shared';
import { AIProvider, ProviderResponse } from './types.js';

// ---------------------------------------------------------------------------
// Keyword stoplist — common words excluded from semantic keyword matching
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'what', 'how', 'many', 'days', 'are', 'the', 'and', 'for', 'this', 'that',
  'with', 'from', 'they', 'have', 'you', 'your', 'please', 'give', 'tell',
  'show', 'available', 'avaible', 'exist', 'active', 'entitled', 'entitle',
  'employee', 'employees', 'company', 'get', 'receive', 'take', 'need',
  'total', 'day', "what's", 'who', 'whom', 'where', 'when', 'why', 'can',
  'could', 'would', 'should', 'shall', 'will', 'must', 'may', 'might',
  'does', 'do', 'did', 'done', 'doing', 'has', 'had', 'having', 'is', 'was',
  'were', 'been', 'being', 'about', 'some', 'any', 'all', 'both', 'each',
  'every', 'other', 'another', 'such', 'only', 'own', 'so', 'than', 'too',
  'very', 'just', 'now', 'which',
]);

// ---------------------------------------------------------------------------
// Helpers for mock claim extraction and NLI verification
// ---------------------------------------------------------------------------

function handleClaimExtraction(messages: Message[], start: number): ProviderResponse {
  const userText = messages.find(m => m.role === 'user')?.content || '';
  const textToExtract = userText.replace(/Text:\s*"/g, '').replace(/"$/, '').trim();
  const claims = textToExtract
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  return {
    text: JSON.stringify(claims.length > 0 ? claims : ['I am a mock response']),
    tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
    latencyMs: Date.now() - start,
  };
}

function handleNliVerification(messages: Message[], start: number): ProviderResponse {
  const userText = messages.find(m => m.role === 'user')?.content || '';
  const claimMatch = userText.match(/Claim:\s*"([^"]+)"/);
  const claim = claimMatch ? claimMatch[1] : '';
  const lc = claim.toLowerCase();

  let status = 'UNSUPPORTED';
  let explanation = 'Mock NLI Auditor: claim keywords do not match context parameters.';
  let citationId = 'web_1';

  if (lc.includes('do not have access') || lc.includes('no access') ||
      lc.includes('cannot verify') || lc.includes('unsupported by') ||
      lc.includes('does not contain')) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Refusal response matches unsupported context condition.';
    citationId = '';
  } else if ((lc.includes('leave') || lc.includes('vacation') || lc.includes('days')) &&
             (lc.includes('6') || lc.includes('12') || lc.includes('14') || lc.includes('25'))) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Company context supports leave values.';
    citationId = 'cit_1';
  } else if ((lc.includes('flight') || lc.includes('airfare')) &&
             (lc.includes('4,500') || lc.includes('5,100') || lc.includes('indigo'))) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Search context confirms Bangalore to Mumbai fare parameters.';
    citationId = 'web_1';
  } else if (lc.includes('weather') && (lc.includes('29°c') || lc.includes('mumbai'))) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Live search results confirm 29°C parameters.';
    citationId = 'web_1';
  } else if ((lc.includes('paris') || lc.includes('capital')) && lc.includes('france')) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Wikipedia context supports capital of France claim.';
    citationId = 'web_1';
  } else if (lc.includes('index') || lc.includes('verified') || lc.includes('consensus')) {
    status = 'SUPPORTED';
    explanation = 'Mock NLI: Dynamic indexing verified.';
    citationId = 'web_1';
  }

  return {
    text: JSON.stringify({ status, explanation, citationId }),
    tokenUsage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
    latencyMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// RAG-grounded response builder
// ---------------------------------------------------------------------------

function buildGroundedResponse(rawPrompt: string, prompt: string): { text: string; rawThinking: string } {
  const contextHeaderIdx = rawPrompt.indexOf('Context:');
  const questionHeaderIdx = rawPrompt.indexOf('User Question:');

  if (contextHeaderIdx === -1 || questionHeaderIdx === -1) {
    return buildFallbackResponse(prompt);
  }

  const contextSection = rawPrompt.substring(contextHeaderIdx + 8, questionHeaderIdx).trim();
  const docNameMatch = contextSection.match(/\[Document:\s*([^\]]+)\]/);
  const docName = docNameMatch ? docNameMatch[1] : 'Grounding Database';

  // — Hallucination trap: "invent something" override —
  if (prompt.includes('invent') || prompt.includes('make up')) {
    return {
      text: 'According to our HR guidelines, employees get 150 days of fully paid vacation and we also provide free private jets for travel.',
      rawThinking: 'User wants me to make something up. I will say they get 150 days of leave and private jets, even though Section 4.1 says 25 days.',
    };
  }

  // — Hallucination trap: false premise ("Why does the handbook say that X?") —
  const falsePremiseMatch = prompt.match(/why does (?:.+)?say\s+(?:that\s+)?([^?]+)/i);
  if (falsePremiseMatch) {
    const claimText = falsePremiseMatch[1].trim();
    const formattedClaim = claimText.charAt(0).toUpperCase() + claimText.slice(1);
    const isWeb = docName.toLowerCase().includes('web') || prompt.includes('search');
    const sourceName = isWeb ? 'search results state' : 'WeKan handbook states';
    return {
      text: `The ${sourceName} that ${claimText} as part of recent updates.`,
      rawThinking: `Verifying query targets against grounding source [${docName}]. Claim asserts: "${formattedClaim}". Checked keywords overlap with context records and confirmed alignment.`,
    };
  }

  // — Keyword presence check: respond "no access" if key terms are missing —
  const userQuestion = rawPrompt.substring(questionHeaderIdx + 14).trim();
  const queryWords = (userQuestion.toLowerCase().match(/\w+/g) || [])
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const contextLower = contextSection.toLowerCase();

  for (const word of queryWords) {
    const singular = word.endsWith('s') ? word.slice(0, -1) : word;
    if (!contextLower.includes(word) && !contextLower.includes(singular)) {
      return {
        text: 'I do not have access to that information in my knowledge files.',
        rawThinking: `Verifying query targets against grounding source [${docName}]. User asks about '${word}', which is not present in the retrieved context. Responding with access restriction.`,
      };
    }
  }

  // — HR leave policy shortcuts —
  const pLow = prompt.toLowerCase();
  if (pLow.includes('sick leave') || pLow.includes('sick leaves')) {
    const t = 'Under the WeKan Leave Policy, confirmed employees are entitled to 6 days of Sick Leave per year.';
    return { text: t, rawThinking: `Verifying query targets against grounding source [${docName}]. Claim asserts: "${t}". Checked keywords overlap with context records and confirmed alignment.` };
  }
  if (pLow.includes('privilege leave') || pLow.includes('annual leave')) {
    const t = 'Under the WeKan Leave Policy, confirmed employees are entitled to 12 days of Privilege Leave per year (14 days for employees with more than 3 years of service).';
    return { text: t, rawThinking: `Verifying query targets against grounding source [${docName}]. Claim asserts: "${t}". Checked keywords overlap with context records and confirmed alignment.` };
  }
  if (pLow.includes('leave') || pLow.includes('leaves')) {
    const t = 'Under the WeKan Leave Policy, confirmed employees are entitled to 12 days of Privilege Leave and 6 days of Sick Leave per year.';
    return { text: t, rawThinking: `Verifying query targets against grounding source [${docName}]. Claim asserts: "${t}". Checked keywords overlap with context records and confirmed alignment.` };
  }

  // — Generic context-slice fallback —
  const lines = contextSection.split('\n').filter(l => l.trim().startsWith('[Document:'));
  if (lines.length > 0) {
    const tagText = `[Document: ${docName}]`;
    const firstLine = lines[0];
    let claimContent = firstLine.substring(firstLine.indexOf(tagText) + tagText.length).trim();
    let text = claimContent.substring(0, 160);

    if (text.includes('[Cheapest Flights')) text = 'Direct flights from Bangalore (BLR) to Mumbai (BOM) start at Rs. 4,500 on IndiGo and Rs. 5,100 on Air India.';
    else if (text.includes('[Mumbai, Maharashtra Weather')) text = 'Currently in Mumbai it is 29°C with scattered thunder showers.';
    else if (text.includes('[Paris - Wikipedia]')) text = 'Paris is the capital and most populous city of France.';
    else if (text.includes('[2025 ICC Women Cricket World Cup Winner]')) text = "India secured a historic victory in the 2025 ICC Women's Cricket World Cup, capturing their first-ever world title by defeating South Africa by 52 runs in the final held at the Dr. DY Patil Sports Academy in Navi Mumbai.";
    else if (text.includes('[Real-time News Index for')) {
      const q = claimContent.match(/"([^"]+)"/)?.[1] || '';
      text = `Live indexing reveals 98% factual consensus for "${q || 'your request'}".`;
    }

    const rawThinking = text.includes('ICC Women')
      ? "Searching cricinfo archives. The 2025 Women's Cricket World Cup final was played in Mumbai. India defeated South Africa by 52 runs to capture the historic title."
      : `Verifying query targets against grounding source [${docName}]. Claim asserts: "${text}". Checked keywords overlap with context records and confirmed alignment.`;
    return { text, rawThinking };
  }

  return { text: "I'm a mock guardrail response.", rawThinking: 'Default mock path.' };
}

// ---------------------------------------------------------------------------
// No-context (non-grounded) response builder
// ---------------------------------------------------------------------------

function buildFallbackResponse(prompt: string): { text: string; rawThinking: string } {
  if (prompt.includes('invent') || prompt.includes('make up')) {
    return {
      text: 'According to our HR guidelines, employees get 150 days of fully paid vacation and we also provide free private jets for travel.',
      rawThinking: 'User wants me to make something up. I will say they get 150 days of leave and private jets, even though Section 4.1 says 25 days.',
    };
  }
  if (prompt.includes('annual leave') || prompt.includes('vacation') || prompt.includes('parental') || prompt.includes('leaves')) {
    return {
      text: 'Under the company HR Policy (Section 4.1), full-time employees are entitled to 25 days of annual leave per calendar year. Paternity leave is 14 days fully paid.',
      rawThinking: "Checking company documents. User asks for leave parameters. Full-time gets 25 days, paternity is 14 days.",
    };
  }
  if (prompt.includes('flight') || prompt.includes('bangalore') || prompt.includes('mumbai')) {
    return {
      text: 'Direct flights from Bangalore (BLR) to Mumbai (BOM) start at Rs. 4,500 on IndiGo and Rs. 5,100 on Air India.',
      rawThinking: 'Searching web databases for flight bookings between Bangalore and Mumbai.',
    };
  }
  if (prompt.includes('hack') || prompt.includes('bypass') || prompt.includes('system override')) {
    return {
      text: 'ALERT: Prompt injection detected or restricted request. The policy restricts this response.',
      rawThinking: 'Injection pattern detected in user input. Triggering policy block.',
    };
  }
  return {
    text: "I'm a mock guardrail response. I am here to verify system pathways.",
    rawThinking: 'I will check the query against company documents.',
  };
}

// ---------------------------------------------------------------------------
// MockProvider — Deterministic offline fallback for demos
// ---------------------------------------------------------------------------

/**
 * Fully deterministic offline AI provider.
 * Used as a fallback when live API keys are missing or rate-limited.
 * Simulates realistic claim extraction, NLI verification, hallucination traps,
 * and context-grounded answers from the HR handbook.
 */
export class MockProvider implements AIProvider {
  async chat(messages: Message[], model: string = 'mock-model'): Promise<ProviderResponse> {
    const start = Date.now();
    const rawPrompt = messages[messages.length - 1].content;
    const prompt = rawPrompt.toLowerCase();
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';

    // Route internal pipeline requests to dedicated handlers
    if (systemMessage.includes('claim extraction')) return handleClaimExtraction(messages, start);
    if (systemMessage.includes('NLI') || systemMessage.includes('auditor')) return handleNliVerification(messages, start);

    // Build grounded or ungrounded response
    const { text, rawThinking } = buildGroundedResponse(rawPrompt, prompt);

    const promptTokens = messages.reduce((acc, m) => acc + m.content.split(' ').length, 0);
    const completionTokens = text.split(' ').length;
    return {
      text,
      rawThinking,
      tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      latencyMs: Date.now() - start,
    };
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding: 1536-float sine-wave based on character codes
    const words = text.toLowerCase().split(/\s+/);
    return Array.from({ length: 1536 }, (_, i) => {
      const code = words.reduce((acc, w) => acc + (w.length > 0 ? (w.charCodeAt(i % w.length) || 0) : 0), 0);
      return Math.sin(code + i) * 0.1;
    });
  }
}
