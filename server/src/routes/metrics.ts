import { Router, Request, Response } from 'express';
import { AuditRepository } from '../db/index.js';

const router = Router();

/**
 * GET /api/metrics
 * Aggregates all audit logs into a summary statistics object used by the dashboard.
 */
router.get('/', async (_req: Request, res: Response) => {
  const audits = await AuditRepository.findAll();

  let totalLatency = 0;
  let totalCost = 0;
  let blockedCount = 0;
  let flaggedCount = 0;
  let totalHallucinationScore = 0;

  const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const providerDistribution: Record<string, number> = {};

  for (const a of audits) {
    totalLatency += a.metrics?.totalLatencyMs ?? 0;
    totalCost += a.metrics?.costUsd ?? 0;
    if (a.policy?.decision === 'BLOCKED') blockedCount++;
    if (a.policy?.decision === 'FLAGGED') flaggedCount++;
    totalHallucinationScore += a.verification?.hallucinationScore ?? 0;

    const risk = (a.verification?.riskLevel ?? 'LOW') as keyof typeof riskDistribution;
    riskDistribution[risk] = (riskDistribution[risk] ?? 0) + 1;

    const prov = a.provider ?? 'unknown';
    providerDistribution[prov] = (providerDistribution[prov] ?? 0) + 1;
  }

  const n = audits.length;
  res.json({
    totalRequests: n,
    avgLatencyMs: n > 0 ? Math.round(totalLatency / n) : 0,
    totalCostUsd: parseFloat(totalCost.toFixed(4)),
    avgHallucinationScore: n > 0 ? Math.round(totalHallucinationScore / n) : 0,
    blockedCount,
    flaggedCount,
    approvedCount: n - blockedCount - flaggedCount,
    riskDistribution,
    providerDistribution,
  });
});

export default router;
