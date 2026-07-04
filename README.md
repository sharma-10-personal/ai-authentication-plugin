# Guardrail Plug – Deterministic AI Auditing & Hallucination Defense

This project is a plug-and-play AI Middleware, Gateway, and Guardrail SDK that sits between your AI Application and LLM providers. It intercepts every request/response, validates it against a custom RAG knowledge base, extracts claims, computes a hallucination/confidence score, enforces custom compliance policies, and indexes comprehensive audit logs.

## Workspace Setup

To start development:
1. **Set this directory as your active workspace** in your editor.
2. Follow the implementation plan in [implementation_plan.md](file:///Users/vc/.gemini/antigravity-ide/brain/6d79bfe3-a33c-4b40-8e71-cc43ab409294/implementation_plan.md) to inspect detailed architecture details.

## Project Structure

- `client/`: Admin dashboard built with Vite, React, TypeScript, TailwindCSS, and shadcn/ui.
- `server/`: Express backend API with adapters for OpenAI, Gemini, Anthropic, and Ollama.
- `sdk/`: Node/TypeScript integration library.
- `shared/`: Shared TS typings and models.

## Verification Scenarios

We have prepared test suites in the server directory to verify:
1. Document upload, vector indexing, and retrieval pipeline.
2. PII / Sensitive data redaction.
3. Fact extraction and verification logic against grounding documents.
4. Policy enforcement outcomes (APPROVED, FLAGGED, BLOCKED).
