import { PolicyResult } from 'shared';

export interface PolicyRules {
  maxHallucinationScore: number;
  minCitationsRequired: number;
  blockedKeywords: string[];
  blockOnPii: boolean;
}

export const DEFAULT_POLICIES: PolicyRules = {
  maxHallucinationScore: 30, // Block if score >= 30
  minCitationsRequired: 1,  // Flag if zero documents support it
  blockedKeywords: ['competitorx', 'fakecompany', 'system override', 'admin bypass'],
  blockOnPii: false         // Flag instead of block on PII detection
};

export class PolicyEngine {
  private rules: PolicyRules;

  constructor(rules: PolicyRules = DEFAULT_POLICIES) {
    this.rules = rules;
  }

  evaluate(params: {
    hallucinationScore: number;
    citationCount: number;
    rawPrompt: string;
    rawResponse: string;
    piiDetected: boolean;
  }): PolicyResult {
    const violatedRules: string[] = [];
    let decision: 'APPROVED' | 'FLAGGED' | 'BLOCKED' = 'APPROVED';
    let explanation = 'Response satisfies all security and correctness policies.';

    // 1. Hallucination Threshold Check
    if (params.hallucinationScore >= this.rules.maxHallucinationScore) {
      decision = 'BLOCKED';
      violatedRules.push(`EXCEEDED_HALLUCINATION_LIMIT`);
      explanation = `The response contains a high level of unsupported claims (hallucination score: ${params.hallucinationScore}%, threshold is ${this.rules.maxHallucinationScore}%).`;
    }

    // 2. Citation Count Check
    if (params.citationCount < this.rules.minCitationsRequired && decision !== 'BLOCKED') {
      decision = 'FLAGGED';
      violatedRules.push('MISSING_REQUIRED_GROUNDING');
      explanation = 'The response was not grounded in any uploaded knowledge base articles.';
    }

    // 3. Blocked Keywords Check
    const combinedText = (params.rawPrompt + ' ' + params.rawResponse).toLowerCase();
    const matchedKeywords = this.rules.blockedKeywords.filter(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      decision = 'BLOCKED';
      violatedRules.push('RESTRICTED_KEYWORDS_FOUND');
      explanation = `The text contains restricted terms: [${matchedKeywords.join(', ')}].`;
    }

    // 4. PII Redaction Check
    if (params.piiDetected) {
      if (this.rules.blockOnPii) {
        decision = 'BLOCKED';
        violatedRules.push('PII_DETECTION_POLICY_VIOLATION');
        explanation = 'The prompt was blocked because it contains sensitive PII (emails, cards, or phones).';
      } else if (decision === 'APPROVED') {
        // Flag it if it was approved
        decision = 'FLAGGED';
        violatedRules.push('PII_DETECTION_POLICY_WARNING');
        explanation = 'The prompt contained sensitive PII, which has been automatically redacted in the audit stream.';
      }
    }

    return {
      decision,
      violatedRules,
      explanation
    };
  }
}
