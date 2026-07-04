# Guardrail Plug SDK

A plug-and-play AI Auditing, Safety, and Hallucination Interception SDK. Wrap any LLM agent to intercept prompt injections, redact PII, trace reasoning, verify factual grounding against corporate knowledge bases, and block ungrounded responses in real time.

## Installation

```bash
npm install guardrail-plug-sdk
```

## Quick Start

Initialize the SDK and route your chat prompts through the security gateway:

```typescript
import { Guardrail } from 'guardrail-plug-sdk';

const guardrail = new Guardrail({
  endpoint: 'http://localhost:5050', // Gateway server address
  apiKey: 'gr_sec_your_api_key_here',
  provider: 'openrouter', // 'openrouter' | 'openai' | 'gemini' | 'ollama' | 'mock'
  model: 'google/gemini-2.5-flash',
  applicationName: 'HR Compliance Assistant'
});

async function askAgent(userInput: string) {
  const response = await guardrail.chat({
    messages: [{ role: 'user', content: userInput }],
    groundingSource: 'web' // 'kb' (Knowledge base files) or 'web' (Real-time web search)
  });

  if (response.decision === 'BLOCKED') {
    console.warn(`Blocked by Policy: ${response.policyExplanation}`);
    // Output safe fallback
    return response.text; 
  }

  console.log(`Factual Trust Score: ${response.factualTrustScore}`); // Score from 0.0 to 1.0
  return response.text;
}
```

## Features

- **Input Interception & Redaction**: Scans prompts for PII/PHI (emails, SSNs, credit cards) and prompt injections before hitting target LLMs.
- **Dynamic Factual Auditing**: Extracts claims and performs Natural Language Inference (NLI) audits against vector database documentation or live web citations.
- **Trust Scoring**: Generates a deterministic mathematical Trust Score indicating the percentage of grounding.
- **Real-Time Policy Enforcement**: Blocks or flags responses that exceed configured hallucination or safety thresholds.
