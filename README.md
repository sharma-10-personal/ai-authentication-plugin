# 🛡️ HalluciNOT — AI Guardrail Gateway

> **HalluciNOT** is a plug-and-play AI safety middleware that wraps any LLM call inside a 5-step verification pipeline — intercepting PII, grounding responses in a vector knowledge base, auditing every factual claim, and enforcing enterprise policies before a single token reaches the user.

Built for hackathons. Designed for production.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🛡️ **Input Interceptor** | Detects PII, prompt injection, and policy violations before the LLM ever sees the query |
| 🗄️ **RAG Grounding** | Semantic vector search over uploaded knowledge base documents (PDF, TXT, MD) |
| 🤖 **Multi-Provider** | OpenAI, Google Gemini (with Thinking), OpenRouter, Ollama, or offline Mock |
| ⚖️ **Fact Verification** | NLI-based claim extraction and hallucination scoring for every response |
| 🚦 **Policy Engine** | APPROVED / FLAGGED / BLOCKED decisions with configurable rules |
| 📋 **Full Audit Trail** | Every request persisted to MongoDB with a structured, exportable compliance certificate |
| 💻 **Dashboard UI** | Real-time analytics, risk charts, audit vault, and chat playground |

---

## 🏗️ Architecture

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Guardrail Gateway (Express)                │
│                                                             │
│  Step 1 ── Input Interceptor (PII scan, injection check)   │
│      │                                                      │
│  Step 2 ── RAG Retrieval (vector search / web search)      │
│      │                                                      │
│  Step 3 ── LLM Inference (grounded prompt → provider)      │
│      │                                                      │
│  Step 4 ── Fact Verification (NLI claim audit)             │
│      │                                                      │
│  Step 5 ── Policy Engine (APPROVED / FLAGGED / BLOCKED)    │
│                                                             │
│  → Audit log saved to MongoDB                               │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
Safe, grounded, audited response
```

---

## 📁 Project Structure

```
guardrail-plug/
├── server/src/
│   ├── config/          # Environment variable loader
│   ├── db/              # MongoDB + JSON fallback repositories
│   ├── middleware/       # PII & prompt injection interceptor
│   ├── providers/        # AI provider adapters (one file per provider)
│   │   ├── types.ts      # AIProvider interface & ProviderResponse
│   │   ├── MockProvider.ts
│   │   ├── OpenAIProvider.ts
│   │   ├── GeminiProvider.ts
│   │   ├── OllamaProvider.ts
│   │   ├── OpenRouterProvider.ts
│   │   └── index.ts      # ProviderFactory + re-exports
│   ├── retrieval/        # Semantic vector search + web search
│   ├── verification/     # Claim extraction & NLI audit engine
│   ├── policy/           # Policy rule evaluation engine
│   ├── services/
│   │   └── auditBuilder.ts  # Audit log & thinking trace construction
│   └── routes/
│       ├── chat.ts        # POST /api/chat  — core pipeline
│       ├── documents.ts   # Document upload & management
│       ├── audits.ts      # Audit log retrieval
│       ├── metrics.ts     # Aggregated statistics
│       ├── providers.ts   # Provider config management
│       ├── serverConfig.ts # Active provider/model config
│       └── index.ts       # Route mount orchestrator
│
├── client/src/
│   ├── components/
│   │   └── AuditModal.tsx   # Full audit trace detail modal
│   ├── hooks/
│   │   └── useAuditData.ts  # Dashboard data fetching hook
│   ├── App.tsx              # Top-level orchestrator
│   └── index.css            # Global design system
│
├── sdk/src/                 # Embeddable TypeScript SDK
│   ├── Guardrail.ts
│   ├── types.ts
│   └── index.ts
│
└── shared/                  # Shared types (server ↔ client ↔ SDK)
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in at least one AI provider key
```

### 3. Build the workspaces
```bash
npm run build:all
```

### 4. Start gateway + UI
```bash
# In terminal 1 — Gateway server (port 5050)
node server/dist/index.js

# In terminal 2 — React dashboard (port 3000)
npm run dev:client
```

Open **http://localhost:3000** and navigate to the Chat Playground to test the pipeline.

---

## 🔑 Provider Configuration

| Provider | Env Key | Notes |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini |
| Google Gemini | `GEMINI_API_KEY` | Gemini 2.5 Flash with native Thinking |
| OpenRouter | `OPEN_ROUTER_API_KEY` | Access 200+ models via one key |
| Anthropic | `ANTHROPIC_API_KEY` | Coming soon |
| Ollama | *(none)* | Requires local Ollama server |
| Mock | *(none)* | Fully offline, deterministic |

---

## 🧪 SDK Usage

```typescript
import { Guardrail } from 'guardrail-plug';

const guardrail = new Guardrail({
  gatewayUrl: 'http://localhost:5050',
  applicationName: 'My HR Bot',
  apiKey: 'gr_sec_your_key_here',
});

const response = await guardrail.chat([
  { role: 'user', content: 'How many sick leaves do employees get?' }
]);

console.log(response.text);           // Grounded response
console.log(response.decision);       // APPROVED | FLAGGED | BLOCKED
console.log(response.factualTrustScore); // 0.0 – 1.0
console.log(response.auditId);        // Traceable audit reference
```

---

## 📊 Trust Score

The **Factual Trust Score** is a 0–1 score computed as:

```
Trust Score = 1.0 − (Unsupported Claims / Total Claims)
```

- **1.0** — All claims fully grounded in the knowledge base
- **0.7+** — LOW risk, response approved
- **0.4–0.7** — MEDIUM risk, response flagged with warnings
- **< 0.4** — HIGH/CRITICAL risk, response blocked by policy engine

---

## 📝 License

MIT — Built with ❤️ for the hackathon.
