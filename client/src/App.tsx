import React from 'react';
import {
  ShieldAlert, Activity, Database, ListTodo, Settings2, Send,
  UploadCloud, CheckCircle2, AlertTriangle, XCircle, Cpu, RefreshCw,
  Trash2, FileText, DollarSign, Clock, ExternalLink, Lock, Eye, AlertOctagon
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell
} from 'recharts';
import { SDKChatResponse, UploadedDocument, ProviderConfig } from 'shared';
import { AuditModal } from './components/AuditModal';

// ── Types ──────────────────────────────────────────────────────────────────

type ActiveTab = 'dashboard' | 'playground' | 'documents' | 'audits' | 'providers';

// ── Page metadata maps ─────────────────────────────────────────────────────

const PAGE_TITLES: Record<ActiveTab, string> = {
  dashboard: 'Gateway Analytics',
  playground: 'System Testing Playground',
  documents: 'Document Grounding Store',
  audits: 'Audited Transactions',
  providers: 'Model Providers Configuration',
};

const PAGE_SUBTITLES: Record<ActiveTab, string> = {
  dashboard: 'Monitor response trust indexes, hallucination scores, and latencies.',
  playground: 'Submit queries to verify SDK behavior and intercept pipeline.',
  documents: 'Index corporate policies and markdown archives for RAG retrieval.',
  audits: 'Audit full request-response lifecycles with strict claim lineages.',
  providers: 'Toggle models, default endpoints, and manage API keys.',
};

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#dc2626'];

// ── Root Application Component ─────────────────────────────────────────────

export default function App() {
  // ── Navigation ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('dashboard');

  // ── Dashboard data ──────────────────────────────────────────────────────
  const [metrics, setMetrics] = React.useState<any>({
    totalRequests: 0, avgLatencyMs: 0, totalCostUsd: 0, avgHallucinationScore: 0,
    blockedCount: 0, flaggedCount: 0, approvedCount: 0,
    riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    providerDistribution: {},
  });
  const [audits, setAudits] = React.useState<any[]>([]);
  const [documents, setDocuments] = React.useState<UploadedDocument[]>([]);
  const [providers, setProviders] = React.useState<ProviderConfig[]>([]);
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  // ── Playground state ────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = React.useState<any[]>([
    { role: 'assistant', content: 'Hello! I am protected by the Guardrail SDK middleware. Ask me anything, or try testing HR guidelines or PII data.' }
  ]);
  const [chatInput, setChatInput] = React.useState('');
  const [selectedProvider, setSelectedProvider] = React.useState('openrouter');
  const [selectedModel, setSelectedModel] = React.useState('google/gemini-2.5-flash');
  const [playgroundAppName, setPlaygroundAppName] = React.useState('HR Chat Play');
  const [isLoadingChat, setIsLoadingChat] = React.useState(false);
  const [lastGuardrailResponse, setLastGuardrailResponse] = React.useState<SDKChatResponse | null>(null);
  const [selectedGroundingSource, setSelectedGroundingSource] = React.useState<'kb' | 'web'>('kb');

  // ── Documents state ─────────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  // ── Audit modal state ───────────────────────────────────────────────────
  const [selectedAudit, setSelectedAudit] = React.useState<any | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────

  // Load active provider/model defaults from server config on mount
  React.useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.defaultProvider) setSelectedProvider(data.defaultProvider);
        if (data.defaultModel) setSelectedModel(data.defaultModel);
      })
      .catch(err => console.error('[App] Failed to load server config:', err));
  }, []);

  // Refresh all dashboard data whenever the tab or refresh trigger changes
  React.useEffect(() => {
    Promise.all([
      fetch('/api/metrics').then(r => r.json()),
      fetch('/api/audits').then(r => r.json()),
      fetch('/api/documents').then(r => r.json()),
      fetch('/api/providers').then(r => r.json()),
    ])
      .then(([m, a, d, p]) => { setMetrics(m); setAudits(a); setDocuments(d); setProviders(p); })
      .catch(err => console.error('[App] Data fetch error:', err));
  }, [activeTab, refreshTrigger]);

  const handleRefresh = () => setRefreshTrigger(t => t + 1);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleExportAuditCertificate = () => {
    document.body.classList.add('printing-audit-certificate');
    const cleanup = () => {
      document.body.classList.remove('printing-audit-certificate');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('file', uploadFile);
      const res = await fetch('/api/documents/upload', { method: 'POST', body });
      if (res.ok) { setUploadFile(null); handleRefresh(); }
      else alert('Upload failed.');
    } catch (err) { console.error(err); }
    finally { setIsUploading(false); }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Delete this document and all its vector indices?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) handleRefresh();
    } catch (err) { console.error(err); }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    const currentInput = chatInput;
    setChatInput('');
    setIsLoadingChat(true);
    setLastGuardrailResponse(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer gr_sec_mock_token_123' },
        body: JSON.stringify({
          messages: [...chatMessages.map(m => ({ role: m.role, content: m.content })), userMsg],
          provider: selectedProvider,
          model: selectedModel,
          applicationName: playgroundAppName,
          userId: 'user_playground_demo',
          sessionId: 'session_demo_play',
          groundingSource: selectedGroundingSource,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as SDKChatResponse;
      setLastGuardrailResponse(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.text, auditData: data }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleToggleProvider = async (p: ProviderConfig) => {
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, enabled: !p.enabled }),
      });
      if (res.ok) handleRefresh();
    } catch (err) { console.error(err); }
  };

  // ── Chart data ───────────────────────────────────────────────────────────
  const chartData = audits.slice(0, 10).reverse().map((a, i) => ({
    name: `Req ${i + 1}`,
    latency: a.metrics?.totalLatencyMs ?? 0,
    score: a.verification?.hallucinationScore ?? 0,
  }));

  const pieData = [
    { name: 'Low Risk', value: metrics.riskDistribution?.LOW ?? 0 },
    { name: 'Medium Risk', value: metrics.riskDistribution?.MEDIUM ?? 0 },
    { name: 'High Risk', value: metrics.riskDistribution?.HIGH ?? 0 },
    { name: 'Critical Risk', value: metrics.riskDistribution?.CRITICAL ?? 0 },
  ].filter(p => p.value > 0);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* ── Sidebar Navigation ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="logo-section">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">HalluciNOT</span>
        </div>

        <ul className="nav-links">
          {([
            ['dashboard', 'Overview Dashboard', <Activity size={18} />],
            ['playground', 'Chat Playground', <Cpu size={18} />],
            ['documents', 'Knowledge Base', <Database size={18} />],
            ['audits', 'Audit Logs', <ListTodo size={18} />],
            ['providers', 'AI Providers', <Settings2 size={18} />],
          ] as [ActiveTab, string, React.ReactNode][]).map(([tab, label, icon]) => (
            <li
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {icon}
              {label}
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="workspace-badge" title="/Users/vc/.gemini/antigravity-ide/scratch/guardrail-plug">
            📁 active-workspace: guardrail-plug
          </div>
        </div>
      </aside>

      {/* ── Main Content Panel ────────────────────────────────────────────── */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <h1 className="page-title">{PAGE_TITLES[activeTab]}</h1>
            <p className="page-subtitle">{PAGE_SUBTITLES[activeTab]}</p>
          </div>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={16} /> Sync
          </button>
        </header>

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="stats-grid">
              <div className="glass-card stat-card">
                <span className="stat-label">Total Requests</span>
                <span className="stat-value">{metrics.totalRequests}</span>
                <span className="stat-footer neutral">Processed Transactions</span>
              </div>
              <div className="glass-card stat-card" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
                <span className="stat-label">Blocked Calls</span>
                <span className="stat-value" style={{ color: '#ef4444' }}>{metrics.blockedCount}</span>
                <span className="stat-footer down">Policy Violations</span>
              </div>
              <div className="glass-card stat-card" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
                <span className="stat-label">Avg Hallucination</span>
                <span className="stat-value" style={{ color: '#f59e0b' }}>{metrics.avgHallucinationScore}%</span>
                <span className="stat-footer neutral">Grounded Claim Index</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-label">Avg Latency</span>
                <span className="stat-value">{metrics.avgLatencyMs} ms</span>
                <span className="stat-footer neutral">End-to-End Pipeline</span>
              </div>
              <div className="glass-card stat-card">
                <span className="stat-label">Estimated Cost</span>
                <span className="stat-value">${metrics.totalCostUsd}</span>
                <span className="stat-footer neutral">Total Tokens Spent</span>
              </div>
            </div>

            <div className="visual-grid">
              <div className="glass-card">
                <div className="panel-header">
                  <h3 className="panel-title">Latency Timeline &amp; Claim Safety (Recent Requests)</h3>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="latencyGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.08)' }} labelStyle={{ color: '#9ca3af' }} />
                      <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#3b82f6" fillOpacity={1} fill="url(#latencyGlow)" />
                      <Area type="monotone" dataKey="score" name="Hallucination Score (%)" stroke="#f59e0b" fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="panel-header"><h3 className="panel-title">Risk Levels</h3></div>
                {pieData.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>No risk audits logged yet.</div>
                ) : (
                  <div style={{ margin: 'auto', width: '100%', height: 180 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
                  <span className="badge approved">Low Risk</span>
                  <span className="badge flagged">Medium</span>
                  <span className="badge blocked">High</span>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <div className="panel-header"><h3 className="panel-title">Recent Audit Stream</h3></div>
              <div className="table-container">
                <table className="custom-table">
                  <thead><tr>
                    <th>Audit ID</th><th>Application</th><th>Provider</th>
                    <th>Decision</th><th>Hallucination</th><th>Risk</th><th>Latency</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {audits.slice(0, 5).map(a => (
                      <tr key={a.auditId}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.auditId}</td>
                        <td>{a.applicationName}</td>
                        <td style={{ textTransform: 'capitalize' }}>{a.provider} ({a.model})</td>
                        <td><span className={`badge ${a.policy?.decision?.toLowerCase()}`}>{a.policy?.decision}</span></td>
                        <td style={{ fontWeight: 600 }}>{a.verification?.hallucinationScore}%</td>
                        <td><span className={`badge ${(a.verification?.riskLevel || 'LOW').toLowerCase()}`}>{a.verification?.riskLevel}</span></td>
                        <td>{a.metrics?.totalLatencyMs} ms</td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedAudit(a)}>
                            <Eye size={12} style={{ marginRight: '4px' }} /> View Trace
                          </button>
                        </td>
                      </tr>
                    ))}
                    {audits.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
                        No audit entries logged yet. Initiate requests in the Chat Playground.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PLAYGROUND ────────────────────────────────────────────────── */}
        {activeTab === 'playground' && (
          <div className="playground-container">
            <div className="settings-panel">
              <div className="glass-card form-group">
                <h3 className="panel-title" style={{ marginBottom: '16px' }}>Configuration</h3>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Client App Name</label>
                  <input type="text" className="input-field" value={playgroundAppName} onChange={e => setPlaygroundAppName(e.target.value)} />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">AI Provider</label>
                  <select className="select-field" value={selectedProvider} onChange={e => {
                    const p = e.target.value;
                    setSelectedProvider(p);
                    if (p === 'gemini') setSelectedModel('gemini-2.5-flash');
                    else if (p === 'openrouter') setSelectedModel('google/gemini-2.5-flash');
                    else if (p === 'openai') setSelectedModel('gpt-4o-mini');
                    else if (p === 'ollama') setSelectedModel('llama3');
                    else setSelectedModel('mock-model');
                  }}>
                    <option value="openrouter">OpenRouter (API)</option>
                    <option value="openai">OpenAI (REST)</option>
                    <option value="gemini">Google Gemini (REST)</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="mock">Offline Mock Adapter</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Model Target</label>
                  <input type="text" className="input-field" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Grounding Source</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                    <button type="button" className={`btn ${selectedGroundingSource === 'kb' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '8px 4px', fontSize: '11px', justifyContent: 'center' }} onClick={() => setSelectedGroundingSource('kb')}>📁 Files (KB)</button>
                    <button type="button" className={`btn ${selectedGroundingSource === 'web' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '8px 4px', fontSize: '11px', justifyContent: 'center' }} onClick={() => setSelectedGroundingSource('web')}>🌐 Web Search</button>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ flexGrow: 1 }}>
                <h3 className="panel-title" style={{ marginBottom: '12px' }}>Real-time Trace</h3>
                {lastGuardrailResponse ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                    <div><span style={{ color: '#6b7280' }}>Audit Token:</span><div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#fff', marginTop: '2px' }}>{lastGuardrailResponse.auditId}</div></div>
                    <div><span style={{ color: '#6b7280' }}>Policy Outcome:</span><div style={{ marginTop: '4px' }}><span className={`badge ${lastGuardrailResponse.decision.toLowerCase()}`}>{lastGuardrailResponse.decision}</span></div></div>
                    <div><span style={{ color: '#6b7280' }}>Hallucination Index:</span><div style={{ fontWeight: 700, color: lastGuardrailResponse.hallucinationScore > 30 ? '#ef4444' : '#10b981', marginTop: '2px' }}>{lastGuardrailResponse.hallucinationScore}% ({lastGuardrailResponse.riskLevel} Risk)</div></div>
                    <div><span style={{ color: '#6b7280' }}>RAG Citations Match:</span><div style={{ color: '#fff', fontWeight: 600, marginTop: '2px' }}>{lastGuardrailResponse.citations?.length ?? 0} Chunks Retrieved</div></div>
                    <div><span style={{ color: '#6b7280' }}>Metrics:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                        <div>Latency: {lastGuardrailResponse.metrics?.totalLatencyMs} ms</div>
                        <div>Cost: ${lastGuardrailResponse.metrics?.costUsd?.toFixed(5)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '24px' }}>Send a query to view detailed verification pipelines.</div>
                )}
              </div>
            </div>

            <div className="chat-panel">
              <div className="chat-messages">
                {chatMessages.map((msg: any, i: number) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                    <div className={`message-bubble ${msg.role}`} style={{ width: '100%', maxWidth: '100%', margin: 0, position: 'relative', overflow: 'hidden' }}>
                      {msg.role === 'assistant' && msg.auditData?.decision === 'BLOCKED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ background: 'rgba(239,68,68,0.1)', borderLeft: '4px solid #ef4444', padding: '8px 12px', borderRadius: '4px', color: '#fca5a5', fontSize: '12px', fontWeight: 600 }}>
                            ⚠️ Guardrail Block: The response below was flagged for high hallucinations ({msg.auditData.hallucinationScore}% Unsupported Claims) and blocked.
                          </div>
                          <div style={{ textDecoration: 'line-through', opacity: 0.6, color: '#f3f4f6', paddingLeft: '4px' }}>
                            {msg.auditData.rawResponseBeforeBlock || msg.content}
                          </div>
                        </div>
                      ) : msg.content}
                    </div>
                    {msg.role === 'assistant' && msg.auditData && (
                      <div className="glass-card" style={{ padding: '12px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, color: msg.auditData.decision === 'APPROVED' ? '#10b981' : msg.auditData.decision === 'FLAGGED' ? '#f59e0b' : '#ef4444' }}>
                            🛡️ Guardrail Verdict: {msg.auditData.decision}
                          </span>
                          <span style={{ color: '#9ca3af', fontWeight: 600 }}>
                            Trust Score: {(msg.auditData.factualTrustScore ?? (1.0 - (msg.auditData.hallucinationScore ?? 0) / 100)).toFixed(2)} / 1.0
                          </span>
                        </div>
                        {msg.auditData.policyExplanation && (
                          <div style={{ color: '#d1d5db', marginBottom: '6px', fontStyle: 'italic', lineHeight: '1.4' }}>
                            Reasoning: "{msg.auditData.policyExplanation}"
                          </div>
                        )}
                        {msg.auditData.rawThinking && (
                          <details style={{ marginTop: '8px', cursor: 'pointer' }} open>
                            <summary style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600, marginBottom: '8px' }}>
                              🔍 View Split Thought Trace vs Fact-Audited Path
                            </summary>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '6px' }}>💭 Raw Agent Thoughts:</span>
                                <div style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{msg.auditData.rawThinking}</div>
                              </div>
                              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <span style={{ fontSize: '10px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '6px' }}>⚖️ Fact-Audited Ground Truth Path:</span>
                                {msg.auditData.thinkingClaims?.length > 0 ? msg.auditData.thinkingClaims.map((c: any, ci: number) => (
                                  <div key={ci} style={{ background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)', marginBottom: '4px' }}>
                                    <div style={{ color: '#fff', fontSize: '11px', marginBottom: '4px' }}>"{c.claim}"</div>
                                    <span className={`badge ${c.status.toLowerCase()}`} style={{ fontSize: '8px', padding: '1px 4px' }}>{c.status}</span>
                                  </div>
                                )) : <div style={{ color: '#6b7280', fontSize: '11px', fontStyle: 'italic' }}>No checkable factual assertions in thoughts.</div>}
                              </div>
                            </div>
                          </details>
                        )}
                        {msg.auditData.claims?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Final Output Claim Audits:</span>
                            {msg.auditData.claims.map((c: any, ci: number) => (
                              <div key={ci} style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', gap: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <span style={{ color: '#fff', wordBreak: 'break-all' }}>"{c.claim}"</span>
                                <span className={`badge ${c.status.toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 6px', height: 'fit-content' }}>{c.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {isLoadingChat && (
                  <div className="message-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw className="animate-spin" size={16} /> Intercepting &amp; evaluating grounding claims...
                  </div>
                )}
              </div>
              <form className="chat-input-area" onSubmit={handleSendChat}>
                <input type="text" className="input-field" placeholder="Type a factual query (e.g. 'How many leave days do employees get?')" value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={isLoadingChat} />
                <button type="submit" className="btn" disabled={isLoadingChat || !chatInput.trim()}><Send size={16} /> Send</button>
              </form>
            </div>
          </div>
        )}

        {/* ── KNOWLEDGE BASE ────────────────────────────────────────────── */}
        {activeTab === 'documents' && (
          <div>
            <div className="glass-card" style={{ marginBottom: '24px' }}>
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Index Knowledge Files</h3>
              <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="upload-dropzone" onClick={() => document.getElementById('file-upload-input')?.click()}>
                  <div className="upload-icon">📁</div>
                  <p style={{ fontWeight: 600, marginBottom: '6px' }}>Select document file to upload</p>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>Supports PDF, TXT, MD, DOCX. PDF files will be automatically parsed.</p>
                  {uploadFile && <div style={{ marginTop: '16px', color: '#10b981', fontWeight: 600, fontSize: '13px' }}>Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</div>}
                </div>
                <input id="file-upload-input" type="file" style={{ display: 'none' }} onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }} disabled={isUploading || !uploadFile}>
                  {isUploading ? 'Extracting, Chunking & Embedding Chunks...' : 'Upload & Build Vector Index'}
                </button>
              </form>
            </div>

            <div className="glass-card">
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Active Knowledge Context</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead><tr>
                    <th>Doc ID</th><th>Document Title</th><th>Extension</th>
                    <th>Filesize</th><th>Upload Timestamp</th><th>Status</th><th>Delete</th>
                  </tr></thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id}>
                        <td style={{ fontFamily: 'monospace' }}>{doc.id}</td>
                        <td style={{ fontWeight: 600, color: '#fff' }}>{doc.name}</td>
                        <td style={{ textTransform: 'uppercase', fontSize: '11px' }}>{doc.type}</td>
                        <td>{(doc.size / 1024).toFixed(1)} KB</td>
                        <td>{new Date(doc.uploadedAt).toLocaleString()}</td>
                        <td><span className={`badge ${doc.status === 'indexed' ? 'approved' : 'flagged'}`}>{doc.status}</span></td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => handleDeleteDoc(doc.id)}>
                            <Trash2 size={12} style={{ color: '#ef4444' }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {documents.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>No grounding files uploaded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── AUDIT LOGS TABLE ──────────────────────────────────────────── */}
        {activeTab === 'audits' && (
          <div className="glass-card">
            <h3 className="panel-title" style={{ marginBottom: '16px' }}>Chronological Audit Vault</h3>
            <div className="table-container">
              <table className="custom-table">
                <thead><tr>
                  <th>Audit ID</th><th>App Name</th><th>Prompt Snippet</th>
                  <th>Decision</th><th>Risk</th><th>Latency</th><th>Cost</th><th>Auditor Trace</th>
                </tr></thead>
                <tbody>
                  {audits.map(a => (
                    <tr key={a.auditId}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.auditId}</td>
                      <td>{a.applicationName}</td>
                      <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.request?.rawPrompt}</td>
                      <td><span className={`badge ${a.policy?.decision?.toLowerCase()}`}>{a.policy?.decision}</span></td>
                      <td><span className={`badge ${(a.verification?.riskLevel || 'LOW').toLowerCase()}`}>{a.verification?.riskLevel} ({a.verification?.hallucinationScore}%)</span></td>
                      <td>{a.metrics?.totalLatencyMs} ms</td>
                      <td>${a.metrics?.costUsd?.toFixed(5)}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedAudit(a)}>
                          <Eye size={12} style={{ marginRight: '4px' }} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {audits.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>No audits generated yet. Submit requests in the playground interface.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PROVIDERS MANAGER ─────────────────────────────────────────── */}
        {activeTab === 'providers' && (
          <div className="glass-card">
            <h3 className="panel-title" style={{ marginBottom: '16px' }}>AI Model Routing Configuration</h3>
            <div className="table-container">
              <table className="custom-table">
                <thead><tr>
                  <th>Provider Name</th><th>Default Model</th><th>Configured Key</th>
                  <th>Latency</th><th>Status</th><th>Status Action</th>
                </tr></thead>
                <tbody>
                  {providers.map(p => (
                    <tr key={p.providerId}>
                      <td style={{ fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.defaultModel}</td>
                      <td style={{ color: '#6b7280' }}>
                        {['openai', 'gemini', 'openrouter'].includes(p.providerId) ? '••••••••••••••••' : 'None Required'}
                      </td>
                      <td>{p.latency} ms</td>
                      <td><span className={`badge ${p.healthStatus === 'healthy' ? 'approved' : 'flagged'}`}>{p.healthStatus}</span></td>
                      <td>
                        <button className={`btn ${p.enabled ? 'btn-danger' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleToggleProvider(p)}>
                          {p.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── Audit Detail Modal ────────────────────────────────────────────── */}
      {selectedAudit && (
        <AuditModal
          audit={selectedAudit}
          onClose={() => setSelectedAudit(null)}
          onExport={handleExportAuditCertificate}
        />
      )}
    </div>
  );
}
