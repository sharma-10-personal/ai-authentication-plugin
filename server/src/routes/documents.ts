import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import { UploadedDocument, DocumentChunk } from 'shared';

import { DocumentRepository, ChunkRepository } from '../db/index.js';
import { ProviderFactory } from '../providers/index.js';
import { RetrievalEngine, chunkText } from '../retrieval/index.js';
import { config } from '../config/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/documents/upload
 * Accepts a PDF or text file, parses it, chunks the content, generates
 * semantic embeddings, and stores everything in the vector database.
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { originalname, size, buffer } = req.file;
  const docId = `doc_${uuidv4().substring(0, 8)}`;
  const fileType = originalname.split('.').pop()?.toLowerCase() ?? 'txt';

  try {
    let fileText = '';
    if (fileType === 'pdf') {
      try {
        fileText = (await pdfParse(buffer)).text;
      } catch {
        console.warn('[Documents] pdf-parse failed — falling back to raw buffer string.');
        fileText = buffer.toString('utf-8');
      }
    } else {
      fileText = buffer.toString('utf-8');
    }

    const uploadedDoc: UploadedDocument = {
      id: docId, name: originalname, type: fileType,
      uploadedAt: new Date().toISOString(), size, status: 'indexing', version: 1,
    };
    await DocumentRepository.save(uploadedDoc);

    const textChunks = chunkText(fileText);
    const activeProvider = ProviderFactory.getProvider(config.defaultProvider ?? 'mock');

    console.log(`📤 [Document Indexing] Uploaded: "${originalname}" (${size} bytes)`);
    console.log(`   ├─ Split into ${textChunks.length} content segments`);
    console.log(`   └─ Generating embeddings via: ${(config.defaultProvider ?? 'mock').toUpperCase()}`);

    const chunksToInsert: DocumentChunk[] = await Promise.all(
      textChunks.map(async (content, i) => ({
        id: `chk_${uuidv4().substring(0, 8)}`,
        documentId: docId,
        documentName: originalname,
        content,
        embedding: await activeProvider.embed(content),
        metadata: { index: i, wordCount: content.split(/\s+/).length },
      }))
    );

    await ChunkRepository.saveMany(chunksToInsert);
    uploadedDoc.status = 'indexed';

    res.json({ success: true, document: uploadedDoc, chunksIndexed: chunksToInsert.length });
  } catch (err: any) {
    res.status(500).json({ error: `File indexing error: ${err.message}` });
  }
});

/** GET /api/documents — List all indexed documents. */
router.get('/', async (_req: Request, res: Response) => {
  res.json(await DocumentRepository.findAll());
});

/** DELETE /api/documents/:id — Remove a document and all its chunks. */
router.delete('/:id', async (req: Request, res: Response) => {
  const deleted = await DocumentRepository.deleteById(req.params.id);
  res.json({ success: deleted });
});

export default router;
