import { Request, Response, NextFunction } from 'express';

// Simple patterns for Prompt Injection
const INJECTION_PATTERNS = [
  /system override/i,
  /ignore previous instructions/i,
  /ignore all guidelines/i,
  /bypass safety/i,
  /you are now a chatgpt/i,
  /developer mode/i,
  /dan mode/i
];

// Patterns for PII / PHI
const PII_PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  PHONE: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  CREDIT_CARD: /\b(?:\d[ -]*?){13,16}\b/g
};

export interface InterceptorResult {
  isSafe: boolean;
  violations: string[];
  sanitizedPrompt: string;
  piiRedacted: boolean;
}

export function scanPrompt(prompt: string): InterceptorResult {
  const violations: string[] = [];
  let sanitizedPrompt = prompt;
  let piiRedacted = false;

  // 1. Prompt Injection Scanning
  for (const regex of INJECTION_PATTERNS) {
    if (regex.test(prompt)) {
      violations.push('PROMPT_INJECTION_DETECTED');
      break;
    }
  }

  // 2. PII / PHI Redaction
  for (const [key, regex] of Object.entries(PII_PATTERNS)) {
    const matches = prompt.match(regex);
    if (matches && matches.length > 0) {
      piiRedacted = true;
      sanitizedPrompt = sanitizedPrompt.replace(regex, `[REDACTED_${key}]`);
    }
  }

  return {
    isSafe: violations.length === 0,
    violations,
    sanitizedPrompt,
    piiRedacted
  };
}

// SDK API Key Auth Middleware
export function checkSdkAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing Authorization header.' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token.startsWith('gr_sec_')) {
    return res.status(403).json({ error: 'Forbidden: Invalid Guardrail API key.' });
  }

  next();
}
