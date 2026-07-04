import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';

const router = Router();

/**
 * GET /api/config
 * Returns the active provider and model configuration loaded from .env.
 * Used by the client to display the currently active model in the UI.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultModel,
  });
});

export default router;
