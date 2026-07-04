/**
 * @module routes
 *
 * Mounts all domain-specific route modules onto a single Express router.
 * Import this file in the server entry-point and mount it at `/api`.
 */
import { Router } from 'express';

import chatRouter from './chat.js';
import documentsRouter from './documents.js';
import auditsRouter from './audits.js';
import metricsRouter from './metrics.js';
import providersRouter from './providers.js';
import configRouter from './serverConfig.js';

const router = Router();

router.use('/chat', chatRouter);
router.use('/documents', documentsRouter);
router.use('/audits', auditsRouter);
router.use('/metrics', metricsRouter);
router.use('/providers', providersRouter);
router.use('/config', configRouter);

export default router;
