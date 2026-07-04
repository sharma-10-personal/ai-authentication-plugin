import { Message, Claim, Citation } from 'shared';
import { AIProvider } from '../providers/Provider.js';

export interface VerificationResult {
  claims: Claim[];
  hallucinationScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class VerificationEngine {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  // Extracts atomic claims from the text using LLM or fallback sentence splitter
  async extractClaims(text: string): Promise<string[]> {
    try {
      // 1. Attempt LLM Claim Extraction
      const prompt: Message[] = [
        {
          role: 'system',
          content: 'You are a claim extraction bot. Extract all concrete factual claims from the text. Respond ONLY with a JSON array of strings. Do not add any introduction or codeblocks.'
        },
        {
          role: 'user',
          content: `Text: "${text}"`
        }
      ];

      const res = await this.provider.chat(prompt);
      const cleaned = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as string[];
      if (Array.isArray(parsed)) {
        const disclaimers = [
          'do not have access',
          'dont have access',
          'no access to that information',
          'unsupported by corporate policies',
          'rejected by corporate policies',
          'cannot verify this information',
          'not supported by the context',
          'i do not know',
          'i am not sure',
          'sorry, i cannot',
          'apologize, but i',
          'unsupported claims'
        ];
        const greetings = ['hi', 'hello', 'hey', 'greetings', 'howdy'];
        return parsed.filter(claim => {
          const lower = claim.toLowerCase().trim();
          return !disclaimers.some(disc => lower.includes(disc)) && 
                 !greetings.includes(lower) &&
                 claim.trim().length > 3;
        });
      }
    } catch (err) {
      console.warn('[VerificationEngine] LLM claim extraction failed. Falling back to sentence splitting.');
    }

    // Fallback: Split into sentences and remove short filler
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => {
        const lower = s.toLowerCase();
        return s.length > 5 && 
               !lower.startsWith('sure') && 
               !lower.startsWith('here is') &&
               lower !== 'hi' &&
               lower !== 'hello' &&
               lower !== 'hey' &&
               lower !== 'greetings' &&
               lower !== 'howdy';
      });

    // Safety disclaimer patterns to ignore during factual auditing
    const disclaimers = [
      'do not have access',
      'dont have access',
      'no access to that information',
      'unsupported by corporate policies',
      'rejected by corporate policies',
      'cannot verify this information',
      'not supported by the context',
      'i do not know',
      'i am not sure',
      'sorry, i cannot',
      'apologize, but i',
      'unsupported claims'
    ];

    return sentences.filter(s => {
      const lower = s.toLowerCase();
      return !disclaimers.some(disc => lower.includes(disc));
    });
  }

  // Verifies a claim against the context citations
  async verifyClaim(claim: string, citations: Citation[]): Promise<Claim> {
    // 1. Programmatic Check: Extract numbers in the claim and verify if they exist in RAG citations
    const numberRegex = /\b\d+(?:,\d+)*(?:\.\d+)?\b/g;
    const claimNumbers = claim.match(numberRegex) || [];
    
    // Concatenate all citation text to search in
    const fullCitationText = citations.map(c => c.content).join(' ');
    
    // Check if any numbers in claim are completely missing from citation context
    if (claimNumbers.length > 0) {
      const missingNumbers = claimNumbers.filter(num => !fullCitationText.includes(num));
      if (missingNumbers.length > 0) {
        return {
          claim,
          status: 'UNSUPPORTED',
          explanation: `Numerical discrepancy: The numbers [${missingNumbers.join(', ')}] were asserted in the answer but do not appear in any trusted document.`
        };
      }
    }

    // 2. Call LLM as NLI Judge to verify statement semantic agreement with context
    try {
      const contextBlocks = citations.map(c => `[ID: ${c.citationId}] ${c.content}`).join('\n\n');
      const prompt: Message[] = [
        {
          role: 'system',
          content: `You are an NLI (Natural Language Inference) auditor. Compare the "Claim" against the trusted "Context" chunks.
Classify the claim status as:
- SUPPORTED: If the context explicitly confirms the claim.
- PARTIALLY_SUPPORTED: If the context supports part of the claim but is missing details.
- UNSUPPORTED: If the context does not contain this information or contradicts it.

Respond ONLY with a JSON object:
{
  "status": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED",
  "explanation": "Why this decision was made",
  "citationId": "The ID (e.g. cit_1) that confirms this claim"
}`
        },
        {
          role: 'user',
          content: `Context:\n${contextBlocks}\n\nClaim: "${claim}"`
        }
      ];

      const res = await this.provider.chat(prompt);
      const cleaned = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return {
        claim,
        status: parsed.status || 'UNSUPPORTED',
        explanation: parsed.explanation || 'No validation explanation provided by verification engine.',
        citationId: parsed.citationId || undefined
      };
    } catch (err) {
      // Fallback: heuristic validation if NLI model fails
      let hasOverlap = false;
      let matchingCitId = '';
      for (const cit of citations) {
        // Calculate basic token overlap
        const words = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matches = words.filter(w => cit.content.toLowerCase().includes(w));
        if (matches.length / words.length > 0.4) {
          hasOverlap = true;
          matchingCitId = cit.citationId;
          break;
        }
      }

      return {
        claim,
        status: hasOverlap ? 'SUPPORTED' : 'UNSUPPORTED',
        explanation: hasOverlap 
          ? 'Supported based on high semantic keyword overlap with retrieved chunks.' 
          : 'Unsupported: No matching keywords or clauses found in retrieved context.',
        citationId: matchingCitId || undefined
      };
    }
  }

  async verifyClaimsBatch(claims: string[], citations: Citation[]): Promise<Claim[]> {
    try {
      const contextBlocks = citations.map(c => `[ID: ${c.citationId}] ${c.content}`).join('\n\n');
      const claimsList = claims.map((c, i) => `Claim ${i + 1}: "${c}"`).join('\n');

      const prompt: Message[] = [
        {
          role: 'system',
          content: `You are an NLI (Natural Language Inference) auditor. Compare each "Claim" against the trusted "Context" chunks.
For each claim, classify its status as:
- SUPPORTED: If the context explicitly confirms the claim.
- PARTIALLY_SUPPORTED: If the context supports part of the claim but is missing details.
- UNSUPPORTED: If the context does not contain this information or contradicts it.

Respond ONLY with a JSON object containing a "verifications" array matching the order of claims:
{
  "verifications": [
    {
      "status": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED",
      "explanation": "Why this decision was made",
      "citationId": "The ID (e.g. cit_1 or web_1) that confirms this claim (if supported/partially supported)"
    },
    ...
  ]
}
Do not return any other text, explanations or markdown formatting outside the JSON.`
        },
        {
          role: 'user',
          content: `Context:\n${contextBlocks}\n\nClaims to verify:\n${claimsList}`
        }
      ];

      const res = await this.provider.chat(prompt);
      const cleaned = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed && Array.isArray(parsed.verifications)) {
        return claims.map((claim, idx) => {
          const ver = parsed.verifications[idx] || {};
          return {
            claim,
            status: ver.status || 'UNSUPPORTED',
            explanation: ver.explanation || 'No validation explanation provided.',
            citationId: ver.citationId || undefined
          };
        });
      }
    } catch (err: any) {
      console.warn('[VerificationEngine] Batch NLI verification failed. Falling back to heuristic overlap check.', err.message);
    }

    // Fallback: individual heuristic validation
    const verifiedClaims: Claim[] = [];
    for (const claim of claims) {
      let hasOverlap = false;
      let matchingCitId = '';
      for (const cit of citations) {
        const words = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (words.length === 0) continue;
        const matches = words.filter(w => cit.content.toLowerCase().includes(w));
        if (matches.length / words.length > 0.4) {
          hasOverlap = true;
          matchingCitId = cit.citationId;
          break;
        }
      }

      verifiedClaims.push({
        claim,
        status: hasOverlap ? 'SUPPORTED' : 'UNSUPPORTED',
        explanation: hasOverlap 
          ? 'Supported based on high semantic keyword overlap with retrieved chunks.' 
          : 'Unsupported: No matching keywords or clauses found in retrieved context.',
        citationId: matchingCitId || undefined
      });
    }
    return verifiedClaims;
  }

  // End-to-end verification scoring pipeline
  async verify(text: string, citations: Citation[]): Promise<VerificationResult> {
    if (citations.length === 0) {
      // If no context was retrieved, all assertions are technically unsupported by grounding docs
      const claims = await this.extractClaims(text);
      return {
        claims: claims.map(c => ({
          claim: c,
          status: 'UNSUPPORTED' as const,
          explanation: 'No grounding documents retrieved to support this claim.'
        })),
        hallucinationScore: claims.length > 0 ? 100 : 0,
        riskLevel: claims.length > 0 ? 'CRITICAL' as const : 'LOW' as const
      };
    }

    // 1. Extract claims
    const claimTexts = await this.extractClaims(text);
    if (claimTexts.length === 0) {
      return { claims: [], hallucinationScore: 0, riskLevel: 'LOW' };
    }

    // 2. Verify claims in batch to minimize LLM rate limiting
    const verifiedClaims = await this.verifyClaimsBatch(claimTexts, citations);

    // 3. Score calculations
    const unsupportedCount = verifiedClaims.filter(c => c.status === 'UNSUPPORTED').length;
    const partialCount = verifiedClaims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length;
    const totalClaims = verifiedClaims.length;

    // Aggregated Score: Unsupported gets weight 1.0, Partially Supported weight 0.5
    const rawScore = ((unsupportedCount + (0.5 * partialCount)) / totalClaims) * 100;
    const hallucinationScore = Math.round(rawScore);

    // Risk Classification
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (hallucinationScore >= 50) riskLevel = 'CRITICAL';
    else if (hallucinationScore >= 30) riskLevel = 'HIGH';
    else if (hallucinationScore >= 10) riskLevel = 'MEDIUM';

    return {
      claims: verifiedClaims,
      hallucinationScore,
      riskLevel
    };
  }
}
