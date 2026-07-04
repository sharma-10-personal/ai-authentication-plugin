import { DocumentChunk, Citation } from 'shared';
import { ChunkRepository } from '../db/index.js';
import { AIProvider } from '../providers/index.js';

// Text Chunking Service
export function chunkText(text: string, chunkSize: number = 600, overlap: number = 150): string[] {
  const chunks: string[] = [];
  let index = 0;

  // Simple word-boundary chunker
  const words = text.split(/\s+/);
  let currentWords: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    currentWords.push(word);
    currentLength += word.length + 1; // approximate character length

    if (currentLength >= chunkSize) {
      chunks.push(currentWords.join(' '));
      // Overlap: keep the last N words
      const overlapWordsCount = Math.min(Math.round(overlap / 6), currentWords.length);
      currentWords = currentWords.slice(currentWords.length - overlapWordsCount);
      currentLength = currentWords.join(' ').length;
    }
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

// Vector Cosine Similarity Helper
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    mA += v1[i] * v1[i];
    mB += v2[i] * v2[i];
  }
  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

// Common stop words to exclude from keyword overlap calculations to increase keyword search accuracy
const STOP_WORDS = new Set([
  'what', 'how', 'many', 'days', 'are', 'present', 'the', 'and', 'for', 'this',
  'that', 'with', 'from', 'they', 'have', 'were', 'was', 'been', 'about', 'who',
  'will', 'would', 'could', 'should', 'their', 'there', 'them', 'your', 'our',
  'can', 'you', 'give', 'me', 'please', 'tell', 'show', 'get', 'any', 'some',
  'total', 'number', 'much', 'want', 'need', 'who', 'which', 'where', 'when'
]);

// Deterministic Keyword Token Overlap & Phrase Match Scoring
export function getKeywordOverlapScore(query: string, context: string): number {
  const clean = (str: string) => 
    (str.toLowerCase().match(/\w+/g) || []).filter(word => word.length > 2 && !STOP_WORDS.has(word));
  
  const qWords = clean(query);
  const cWords = clean(context);
  
  if (qWords.length === 0 || cWords.length === 0) return 0;
  
  const qSet = new Set(qWords);
  const cSet = new Set(cWords);
  
  let intersectionSize = 0;
  for (const word of qSet) {
    if (cSet.has(word)) {
      intersectionSize++;
    }
  }
  
  // Base score is the fraction of clean query terms matched
  let score = intersectionSize / qSet.size;
  
  // Phrase boost: check for bigrams in query matching the context (handling singular/plurals)
  const queryLower = query.toLowerCase();
  const contextLower = context.toLowerCase();
  
  let phraseMatches = 0;
  const rawQueryWords = queryLower.match(/\w+/g) || [];
  for (let i = 0; i < rawQueryWords.length - 1; i++) {
    const w1 = rawQueryWords[i];
    const w2 = rawQueryWords[i+1];
    if (w1.length > 2 && w2.length > 2 && !STOP_WORDS.has(w1) && !STOP_WORDS.has(w2)) {
      const bigram1 = `${w1} ${w2}`;
      const w1Singular = w1.endsWith('s') ? w1.slice(0, -1) : w1;
      const w2Singular = w2.endsWith('s') ? w2.slice(0, -1) : w2;
      const bigram2 = `${w1Singular} ${w2Singular}`;
      
      if (contextLower.includes(bigram1) || contextLower.includes(bigram2)) {
        phraseMatches++;
      }
    }
  }
  
  if (phraseMatches > 0) {
    score += phraseMatches * 0.3;
  }
  
  // Proximity/Density boost: If key terms appear very close to each other in the context
  // e.g. "sick" and "leave" appear within 5 words of each other
  let proximityBoost = 0;
  for (let i = 0; i < cWords.length - 4; i++) {
    const window = cWords.slice(i, i + 5);
    const windowSet = new Set(window);
    let matchesInWindow = 0;
    for (const qWord of qSet) {
      if (windowSet.has(qWord)) {
        matchesInWindow++;
      }
    }
    if (matchesInWindow >= 2) {
      proximityBoost = Math.max(proximityBoost, (matchesInWindow / qSet.size) * 0.2);
    }
  }
  score += proximityBoost;

  // Small penalty for very long context to break ties in favor of concise matching
  score -= (cWords.length * 0.0002);
  
  return Math.max(0, score);
}

export class RetrievalEngine {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  // Retrieve top K chunks matching the query
  async retrieve(query: string, topK: number = 3): Promise<Citation[]> {
    try {
      // 1. Generate query embedding
      const queryVec = await this.provider.embed(query);

      // 2. Fetch all chunks from DB
      const allChunks = await ChunkRepository.findAll();

      // 3. Score chunks
      const scored = allChunks.map((chunk, idx) => {
        const vecSim = chunk.embedding ? cosineSimilarity(queryVec, chunk.embedding) : 0;
        const kwSim = getKeywordOverlapScore(query, chunk.content);
        
        // Hybrid score: balance vector and token-overlap to be highly resilient offline
        const hybridScore = (vecSim * 0.4) + (kwSim * 0.6);

        return {
          chunk,
          score: hybridScore
        };
      });

      // 4. Sort and return top K
      const sorted = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return sorted.map((item, index) => ({
        citationId: `cit_${index + 1}`,
        documentId: item.chunk.documentId,
        documentName: item.chunk.documentName,
        content: item.chunk.content,
        score: parseFloat(item.score.toFixed(4))
      }));
    } catch (err) {
      console.error('[RetrievalEngine] Retrieval error:', err);
      return [];
    }
  }
}
