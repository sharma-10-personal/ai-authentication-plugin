import { Router, Request, Response } from 'express';
import { ProviderRepository } from '../db/index.js';

const router = Router();

/** GET /api/providers — List all registered AI provider configurations. */
router.get('/', async (_req: Request, res: Response) => {
  res.json(await ProviderRepository.findAll());
});

/** POST /api/providers — Create or update a provider configuration. */
router.post('/', async (req: Request, res: Response) => {
  const updated = await ProviderRepository.save(req.body);
  res.json(updated);
});

export default router;
