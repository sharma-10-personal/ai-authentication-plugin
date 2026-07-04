import React from 'react';
import {
  CheckCircle2, XCircle, Lock, Database, Cpu,
  ShieldAlert, AlertOctagon
} from 'lucide-react';

interface AuditModalProps {
  /** The full audit log document to display. */
  audit: any;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Called when the user requests a print/export of the audit certificate. */
  onExport: () => void;
}

/**
 * AuditModal
 * Full-screen overlay showing the detailed guardrail pipeline trace for a
 * single audit log entry. Includes:
 *  - Visual pipeline execution flow graph
 *  - Factual Trust Score banner
 *  - Side-by-side raw thoughts vs fact-audited ground truth panel
 *  - 5-step auditor timeline with claim-level detail
 */
export function AuditModal({ audit, onClose, onExport }: AuditModalProps) {
  const trustScore: number =
    audit.verification?.factualTrustScore ??
    (1.0 - (audit.verification?.hallucinationScore ?? 0) / 100);

  const trustColor = trustScore >= 0.7 ? '#10b981' : trustScore >= 0.4 ? '#f59e0b' : '#ef4444';

  const decisionColor =
    audit.policy?.decision === 'APPROVED' ? '#10b981' :
    audit.policy?.decision === 'FLAGGED' ? '#f59e0b' : '#ef4444';

  const decisionEmoji =
    audit.policy?.decision === 'APPROVED' ? '✅' :
    audit.policy?.decision === 'FLAGGED' ? '⚠️' : '🚫';

  const hallucinationNodeColor = trustScore >= 0.7 ? '#10b981' : trustScore >= 0.4 ? '#f59e0b' : '#ef4444';

  return (
    <div className="modal-overlay audit-certificate-modal">
      <div className="modal-content audit-certificate-content">

        {/* Print-only certificate header */}
        <div className="audit-certificate-print-header">
          <h1>Guardrail Plug — Audit Compliance Certificate</h1>
          <p>Audit ID: {audit.auditId} · {audit.applicationName} · {new Date(audit.timestamp).toLocaleString()}</p>
        </div>

        {/* Modal header */}
        <div className="modal-header">
          <h3 className="panel-title">Audit Trace: {audit.auditId}</h3>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="btn btn-secondary audit-export-btn"
              style={{ marginRight: '16px', padding: '6px 12px', fontSize: '12px' }}
              onClick={onExport}
            >
              🖨️ Export Audit Certificate
            </button>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="modal-body">

          {/* ── Pipeline Execution Flow Graph ──────────────────────────── */}
          <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
            <h4 style={{ color: '#fff', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '16px' }}>
              Gateway Pipeline Execution Graph
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflowX: 'auto', padding: '10px 0' }}>

              {/* Node helpers */}
              {([
                { emoji: '📥', label: 'Prompt Input', color: '#3b82f6', glow: 'rgba(59,130,246,0.6)', border: '#60a5fa' },
                { emoji: '🛡️', label: 'Sanitization', color: '#10b981', glow: 'rgba(16,185,129,0.6)', border: '#34d399' },
              ] as const).map(({ emoji, label, color, glow, border }) => (
                <React.Fragment key={label}>
                  <PipelineNode emoji={emoji} label={label} color={color} glow={glow} border={border} />
                  <PipelineConnector gradient={`linear-gradient(90deg, ${color}, #3b82f6)`} />
                </React.Fragment>
              ))}

              <PipelineNode
                emoji="🗄️"
                label="RAG Context"
                color={audit.retrieval?.length > 0 ? '#3b82f6' : '#1f2937'}
                border={audit.retrieval?.length > 0 ? '#60a5fa' : '#374151'}
              />
              <PipelineConnector gradient="linear-gradient(90deg, #3b82f6, #a78bfa)" />

              <PipelineNode emoji="🤖" label="LLM Exec" color="#a78bfa" glow="rgba(167,139,250,0.6)" border="#c084fc" />
              <PipelineConnector gradient="linear-gradient(90deg, #a78bfa, #f59e0b)" />

              <PipelineNode emoji="⚖️" label="Fact Audit" color={hallucinationNodeColor} />
              <PipelineConnector gradient={audit.policy?.decision === 'APPROVED' ? '#10b981' : '#ef4444'} />

              <PipelineNode
                emoji={decisionEmoji}
                label="Policy Gate"
                color={decisionColor}
                glow={`${decisionColor}99`}
                border={audit.policy?.decision === 'APPROVED' ? '#34d399' : '#f87171'}
              />
            </div>
          </div>

          {/* ── Trust Score Banner ─────────────────────────────────────── */}
          <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px', background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <div>
              <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 600 }}>Factual Grounding Trust Score</h4>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
                Mathematical confidence of model assertions grounded in knowledge base.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '32px', fontWeight: 800, color: trustColor }}>{trustScore.toFixed(2)}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', fontWeight: 600 }}> / 1.0</span>
            </div>
          </div>

          {/* ── Side-by-Side: Raw Thoughts vs Audited Truth ────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
            <div className="glass-card" style={{ background: 'rgba(239,68,68,0.02)', borderColor: 'rgba(239,68,68,0.15)' }}>
              <h4 style={{ color: '#ef4444', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <XCircle size={14} /> Raw Agent Thought Processes
              </h4>
              <div style={{ fontSize: '13px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)', minHeight: '150px', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#9ca3af', fontStyle: 'italic' }}>
                {audit.response?.rawThinking || 'No raw thought patterns logged for this request.'}
              </div>
            </div>

            <div className="glass-card" style={{ background: 'rgba(16,185,129,0.02)', borderColor: 'rgba(16,185,129,0.15)' }}>
              <h4 style={{ color: '#10b981', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} /> Fact-Audited Ground Truth Path
              </h4>
              <div style={{ fontSize: '13px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)', minHeight: '150px' }}>
                {audit.policy?.decision === 'BLOCKED' ? (
                  <div style={{ color: '#ef4444', fontWeight: 600 }}>
                    🚫 REDIRECTED: Response blocked by policy engine.
                    <div style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '8px', fontSize: '12px', fontStyle: 'italic' }}>
                      "I cannot verify this information because it is unsupported by the corporate knowledge files."
                    </div>
                  </div>
                ) : (
                  <div>
                    {audit.response?.sanitizedText}
                    {audit.retrieval?.length > 0 && (
                      <div style={{ marginTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                        <span style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 600 }}>Verified Citations: </span>
                        {audit.retrieval.map((cit: any) => (
                          <span key={cit.citationId} className="badge approved" style={{ fontSize: '9px', padding: '2px 6px', marginRight: '4px' }}>
                            {cit.documentName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Auditor Timeline ───────────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid var(--glass-border)', marginBottom: '24px', paddingBottom: '8px' }}>
            <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Detailed Auditor Timeline</h4>
          </div>

          <div className="audit-details-timeline">

            {/* Step 1 — Input Interceptor */}
            <div className="timeline-step">
              <div className="timeline-dot-wrapper">
                <div className="timeline-dot active">1</div>
                <div className="timeline-line" />
              </div>
              <div className="timeline-content">
                <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} style={{ color: '#10b981' }} /> Input Interceptor (PII Scan &amp; Sanitization)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>Raw Prompt:</span>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                      {audit.request?.rawPrompt}
                    </div>
                  </div>
                  {audit.request?.rawPrompt !== audit.request?.sanitizedPrompt && (
                    <div>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>Sanitized Prompt (Redacted PII):</span>
                      <div style={{ background: 'rgba(245,158,11,0.05)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(245,158,11,0.1)' }}>
                        {audit.request?.sanitizedPrompt}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2 — RAG Retrieval */}
            <div className="timeline-step">
              <div className="timeline-dot-wrapper">
                <div className="timeline-dot active">2</div>
                <div className="timeline-line" />
              </div>
              <div className="timeline-content">
                <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={14} style={{ color: '#3b82f6' }} /> RAG Context Retrieval
                </h4>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: '#6b7280' }}>Retrieved Chunks:</span>
                  {audit.retrieval?.length > 0 ? (
                    <div style={{ marginTop: '6px' }}>
                      {audit.retrieval.map((c: any) => (
                        <div key={c.citationId} className="citation-card">
                          <div className="citation-header">
                            <span>[{c.citationId}] Source: {c.documentName}</span>
                            <span>Overlap Score: {c.score}</span>
                          </div>
                          <p style={{ color: '#e5e7eb' }}>"{c.content}"</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#6b7280', fontStyle: 'italic', marginTop: '4px' }}>No documents retrieved for this request context.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3 — LLM Output */}
            <div className="timeline-step">
              <div className="timeline-dot-wrapper">
                <div className="timeline-dot active">3</div>
                <div className="timeline-line" />
              </div>
              <div className="timeline-content">
                <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} style={{ color: '#a78bfa' }} /> LLM Target Execution
                </h4>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: '#6b7280' }}>Model Output:</span>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    {audit.response?.rawText}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 — Fact Verification */}
            <div className="timeline-step">
              <div className="timeline-dot-wrapper">
                <div className="timeline-dot active">4</div>
                <div className="timeline-line" />
              </div>
              <div className="timeline-content">
                <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} style={{ color: '#f59e0b' }} /> Fact Verification Engine
                </h4>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: '#6b7280' }}>Extracted Claims &amp; Grounding Status:</span>
                  <div style={{ marginTop: '8px' }}>
                    {audit.verification?.extractedClaims?.map((c: any, i: number) => {
                      const matchingCitation = audit.retrieval?.find((r: any) => r.citationId === c.citationId);
                      const sourceName = matchingCitation ? matchingCitation.documentName : (c.citationId ? `Source: ${c.citationId}` : '');
                      const sourceScore: number | null = matchingCitation ? matchingCitation.score : null;
                      return (
                        <div key={i} className="claim-row">
                          <div className="claim-indicator">
                            <span className={`badge ${c.status.toLowerCase()}`}>{c.status}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#fff' }}>"{c.claim}"</div>
                            <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>{c.explanation}</div>
                          </div>
                          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '56px', justifyContent: 'center' }}>
                            <div style={{ color: 'var(--color-text-muted)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grounding Source</div>
                            {c.citationId ? (
                              <>
                                <div style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '176px' }} title={sourceName}>
                                  📄 {sourceName}
                                </div>
                                {sourceScore !== null && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                    <span style={{ fontWeight: 800, color: sourceScore >= 0.8 ? '#10b981' : sourceScore >= 0.5 ? '#f59e0b' : '#ef4444', fontSize: '11px' }}>
                                      {(sourceScore * 100).toFixed(0)}%
                                    </span>
                                    <span style={{ color: '#6b7280', fontSize: '9px', fontWeight: 600 }}>Trust Score</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: '11px' }}>No Source citation</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(!audit.verification?.extractedClaims || audit.verification.extractedClaims.length === 0) && (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No claim evaluations run (e.g. prompt was blocked or zero context retrieved).</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 — Policy Engine */}
            <div className="timeline-step">
              <div className="timeline-dot-wrapper">
                <div className="timeline-dot active">5</div>
              </div>
              <div className="timeline-content" style={{ borderLeft: '4px solid', borderLeftColor: decisionColor }}>
                <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertOctagon size={14} style={{ color: '#ef4444' }} /> Policy Evaluator Decision
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div><span className={`badge ${audit.policy?.decision?.toLowerCase()}`}>{audit.policy?.decision}</span></div>
                  <div style={{ color: '#fff', fontWeight: 500 }}>{audit.policy?.explanation}</div>
                  {audit.policy?.violatedRules?.length > 0 && (
                    <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>
                      Violated: {audit.policy?.violatedRules.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface PipelineNodeProps {
  emoji: string;
  label: string;
  color: string;
  glow?: string;
  border?: string;
}

function PipelineNode({ emoji, label, color, glow, border }: PipelineNodeProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '16px',
        boxShadow: glow ? `0 0 12px ${glow}` : undefined,
        border: `2px solid ${border ?? 'rgba(255,255,255,0.1)'}`,
      }}>
        {emoji}
      </div>
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>{label}</span>
    </div>
  );
}

function PipelineConnector({ gradient }: { gradient: string }) {
  return <div style={{ flexGrow: 1, height: '3px', background: gradient, minWidth: '20px' }} />;
}
