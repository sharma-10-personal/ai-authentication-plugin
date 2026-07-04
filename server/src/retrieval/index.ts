import { DocumentChunk, Citation } from 'shared';
import { ChunkRepository } from '../db/index.js';
import { AIProvider } from '../providers/Provider.js';

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
  'will', 'would', 'could', 'should', 'their', 'there', 'them', 'your', 'our'
]);

// Deterministic Keyword Token Overlap (Jaccard Similarity Fallback)
export function getKeywordOverlapScore(query: string, context: string): number {
  const clean = (str: string) => 
    new Set((str.toLowerCase().match(/\w+/g) || []).filter(word => word.length > 2 && !STOP_WORDS.has(word)));
  
  const qSet = clean(query);
  const cSet = clean(context);
  
  if (qSet.size === 0 || cSet.size === 0) return 0;
  
  let intersectionSize = 0;
  for (const word of qSet) {
    if (cSet.has(word)) {
      intersectionSize++;
    }
  }
  
  return intersectionSize / (qSet.size + cSet.size - intersectionSize);
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
