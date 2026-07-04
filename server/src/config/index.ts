import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory or parent directory (workspace root support)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

export const config = {
  port: process.env.PORT || 5050,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/guardrail_plug',
  useLocalFallbackDb: process.env.USE_LOCAL_FALLBACK_DB !== 'false', // fallback to JSON file database if Mongo fails
  fallbackDbPath: path.join(process.cwd(), 'fallback_db.json'),
  
  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openRouterApiKey: process.env.OPEN_ROUTER_API_KEY || '',
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',

  // Default LLM configuration
  defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
};
