import { Router, Request, Response } from 'express';
import { AuditRepository } from '../db/index.js';

const router = Router();

/** GET /api/audits — Return all audit logs, newest first. */
router.get('/', async (_req: Request, res: Response) => {
  res.json(await AuditRepository.findAll());
});

/** GET /api/audits/:id — Return a single audit log by its auditId. */
router.get('/:id', async (req: Request, res: Response) => {
  const audit = await AuditRepository.findById(req.params.id);
  if (!audit) return res.status(404).json({ error: 'Audit log not found.' });
  res.json(audit);
});

export default router;
