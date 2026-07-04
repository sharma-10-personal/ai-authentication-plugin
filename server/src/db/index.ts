import mongoose from 'mongoose';
import fs from 'fs';
import { config } from '../config/index.js';
import { SDKChatResponse, UploadedDocument, DocumentChunk } from 'shared';

// Winston logger placeholder or basic console log
const log = (msg: string) => console.log(`[Database] ${msg}`);

export let isMongoConnected = false;

export async function connectDb() {
  if (!config.mongoUri) {
    log('No MongoDB URI provided. Using JSON database fallback.');
    return;
  }
  try {
    log(`Connecting to MongoDB at: ${config.mongoUri}`);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 2000,
    });
    isMongoConnected = true;
    log('Connected to MongoDB successfully.');
  } catch (err) {
    log('Failed to connect to MongoDB. Falling back to local file database.');
    isMongoConnected = false;
    initFallbackDb();
  }
}

// Fallback JSON DB Implementation
interface FallbackSchema {
  auditLogs: any[];
  documents: UploadedDocument[];
  chunks: DocumentChunk[];
  providers: any[];
}

function initFallbackDb() {
  if (!fs.existsSync(config.fallbackDbPath)) {
    const defaultDb: FallbackSchema = {
      auditLogs: [],
      documents: [],
      chunks: [],
      providers: [
        { providerId: 'openai', name: 'OpenAI', enabled: true, defaultModel: 'gpt-4o-mini', healthStatus: 'healthy', latency: 45 },
        { providerId: 'gemini', name: 'Gemini', enabled: true, defaultModel: 'gemini-2.5-flash', healthStatus: 'healthy', latency: 60 },
        { providerId: 'anthropic', name: 'Anthropic', enabled: false, defaultModel: 'claude-3-haiku', healthStatus: 'unknown', latency: 0 },
        { providerId: 'ollama', name: 'Ollama', enabled: false, defaultModel: 'llama3', healthStatus: 'unknown', latency: 0 }
      ]
    };
    fs.writeFileSync(config.fallbackDbPath, JSON.stringify(defaultDb, null, 2), 'utf-8');
    log(`Initialized fallback database file at: ${config.fallbackDbPath}`);
  }
}

function readFallbackDb(): FallbackSchema {
  initFallbackDb();
  const raw = fs.readFileSync(config.fallbackDbPath, 'utf-8');
  return JSON.parse(raw);
}

function writeFallbackDb(db: FallbackSchema) {
  fs.writeFileSync(config.fallbackDbPath, JSON.stringify(db, null, 2), 'utf-8');
}

// Mongoose Schemas for MongoDB
const AuditLogSchema = new mongoose.Schema({
  auditId: { type: String, unique: true, index: true },
  applicationName: String,
  userId: String,
  sessionId: String,
  provider: String,
  model: String,
  timestamp: Date,
  request: {
    rawPrompt: String,
    sanitizedPrompt: String,
    metadata: Object
  },
  retrieval: [{
    documentName: String,
    content: String,
    score: Number,
    citationId: String
  }],
  response: {
    rawText: String,
    sanitizedText: String,
    rawThinking: String
  },
  verification: {
    extractedClaims: [{
      claim: String,
      status: { type: String, enum: ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED'] },
      explanation: String,
      citationId: String
    }],
    thinkingClaims: [{
      claim: String,
      status: { type: String, enum: ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED'] },
      explanation: String,
      citationId: String
    }],
    hallucinationScore: Number,
    factualTrustScore: Number,
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }
  },
  policy: {
    decision: { type: String, enum: ['APPROVED', 'FLAGGED', 'BLOCKED'] },
    violatedRules: [String],
    explanation: String
  },
  metrics: {
    totalLatencyMs: Number,
    llmLatencyMs: Number,
    ragLatencyMs: Number,
    verificationLatencyMs: Number,
    tokenUsage: {
      promptTokens: Number,
      completionTokens: Number,
      totalTokens: Number
    },
    costUsd: Number
  }
});

const DocumentSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: String,
  type: String,
  uploadedAt: Date,
  size: Number,
  status: String,
  version: Number,
});

const ChunkSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  documentId: String,
  documentName: String,
  content: String,
  embedding: [Number],
  metadata: Object
});

const ProviderSchema = new mongoose.Schema({
  providerId: { type: String, unique: true, index: true },
  name: String,
  enabled: Boolean,
  defaultModel: String,
  apiKey: String,
  healthStatus: String,
  latency: Number
});

const MongoAuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
const MongoDocument = mongoose.models.Document || mongoose.model('Document', DocumentSchema);
const MongoChunk = mongoose.models.Chunk || mongoose.model('Chunk', ChunkSchema);
const MongoProvider = mongoose.models.Provider || mongoose.model('Provider', ProviderSchema);

// Universal Database Repositories
export const AuditRepository = {
  async save(auditLog: any): Promise<any> {
    if (isMongoConnected) {
      return MongoAuditLog.create(auditLog);
    } else {
      const db = readFallbackDb();
      db.auditLogs.unshift(auditLog);
      writeFallbackDb(db);
      return auditLog;
    }
  },

  async findAll(): Promise<any[]> {
    if (isMongoConnected) {
      return MongoAuditLog.find().sort({ timestamp: -1 }).exec();
    } else {
      return readFallbackDb().auditLogs;
    }
  },

  async findById(id: string): Promise<any | null> {
    if (isMongoConnected) {
      return MongoAuditLog.findOne({ auditId: id }).exec();
    } else {
      return readFallbackDb().auditLogs.find(log => log.auditId === id) || null;
    }
  }
};

export const DocumentRepository = {
  async save(doc: UploadedDocument): Promise<UploadedDocument> {
    if (isMongoConnected) {
      const res = await MongoDocument.create(doc);
      return res.toObject();
    } else {
      const db = readFallbackDb();
      db.documents.unshift(doc);
      writeFallbackDb(db);
      return doc;
    }
  },

  async findAll(): Promise<UploadedDocument[]> {
    if (isMongoConnected) {
      const docs = await MongoDocument.find().sort({ uploadedAt: -1 }).exec();
      return docs.map(d => d.toObject());
    } else {
      return readFallbackDb().documents;
    }
  },

  async deleteById(id: string): Promise<boolean> {
    if (isMongoConnected) {
      const res = await MongoDocument.deleteOne({ id }).exec();
      await MongoChunk.deleteMany({ documentId: id }).exec();
      return res.deletedCount > 0;
    } else {
      const db = readFallbackDb();
      const initialLen = db.documents.length;
      db.documents = db.documents.filter(d => d.id !== id);
      db.chunks = db.chunks.filter(c => c.documentId !== id);
      writeFallbackDb(db);
      return db.documents.length < initialLen;
    }
  }
};

export const ChunkRepository = {
  async saveMany(chunks: DocumentChunk[]): Promise<DocumentChunk[]> {
    if (isMongoConnected) {
      const res = await MongoChunk.insertMany(chunks);
      return res.map(r => r.toObject());
    } else {
      const db = readFallbackDb();
      db.chunks.push(...chunks);
      writeFallbackDb(db);
      return chunks;
    }
  },

  async findByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    if (isMongoConnected) {
      const res = await MongoChunk.find({ documentId }).exec();
      return res.map(r => r.toObject());
    } else {
      return readFallbackDb().chunks.filter(c => c.documentId === documentId);
    }
  },

  async findAll(): Promise<DocumentChunk[]> {
    if (isMongoConnected) {
      const res = await MongoChunk.find().exec();
      return res.map(r => r.toObject());
    } else {
      return readFallbackDb().chunks;
    }
  }
};

export const ProviderRepository = {
  async save(provider: any): Promise<any> {
    if (isMongoConnected) {
      return MongoProvider.findOneAndUpdate(
        { providerId: provider.providerId },
        provider,
        { upsert: true, new: true }
      ).exec();
    } else {
      const db = readFallbackDb();
      const idx = db.providers.findIndex(p => p.providerId === provider.providerId);
      if (idx > -1) {
        db.providers[idx] = { ...db.providers[idx], ...provider };
      } else {
        db.providers.push(provider);
      }
      writeFallbackDb(db);
      return provider;
    }
  },

  async findAll(): Promise<any[]> {
    if (isMongoConnected) {
      return MongoProvider.find().exec();
    } else {
      return readFallbackDb().providers;
    }
  }
};
