import { useState, useEffect } from 'react';
import { UploadedDocument, ProviderConfig } from 'shared';

export interface AuditData {
  metrics: any;
  audits: any[];
  documents: UploadedDocument[];
  providers: ProviderConfig[];
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Custom hook that fetches and refreshes all dashboard data.
 * Triggers a re-fetch whenever `activeTab` changes or `refresh()` is called.
 */
export function useAuditData(activeTab: string): AuditData {
  const [metrics, setMetrics] = useState<any>({
    totalRequests: 0, avgLatencyMs: 0, totalCostUsd: 0, avgHallucinationScore: 0,
    blockedCount: 0, flaggedCount: 0, approvedCount: 0,
    riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    providerDistribution: {},
  });
  const [audits, setAudits] = useState<any[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/metrics').then(r => r.json()),
      fetch('/api/audits').then(r => r.json()),
      fetch('/api/documents').then(r => r.json()),
      fetch('/api/providers').then(r => r.json()),
    ])
      .then(([m, a, d, p]) => {
        setMetrics(m);
        setAudits(a);
        setDocuments(d);
        setProviders(p);
      })
      .catch(err => console.error('[useAuditData] fetch error:', err))
      .finally(() => setIsLoading(false));
  }, [activeTab, refreshTrigger]);

  const refresh = () => setRefreshTrigger(t => t + 1);

  return { metrics, audits, documents, providers, isLoading, refresh };
}
