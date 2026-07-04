import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Activity,
  Database,
  ListTodo,
  Settings2,
  Send,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  RefreshCw,
  Trash2,
  FileText,
  DollarSign,
  Clock,
  ExternalLink,
  Lock,
  Eye,
  AlertOctagon
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import { SDKChatResponse, UploadedDocument, ProviderConfig } from 'shared';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'playground' | 'documents' | 'audits' | 'providers'>('dashboard');

  // Dashboard Metrics state
  const [metrics, setMetrics] = useState<any>({
    totalRequests: 0,
    avgLatencyMs: 0,
    totalCostUsd: 0,
    avgHallucinationScore: 0,
    blockedCount: 0,
    flaggedCount: 0,
    approvedCount: 0,
    riskDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    providerDistribution: {}
  });

  // Data lists state
  const [audits, setAudits] = useState<any[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);

  // Playground state
  const [chatMessages, setChatMessages] = useState<any[]>([
    { role: 'assistant', content: 'Hello! I am protected by the Guardrail SDK middleware. Ask me anything, or try testing HR guidelines or PII data.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [playgroundAppName, setPlaygroundAppName] = useState('HR Chat Play');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [lastGuardrailResponse, setLastGuardrailResponse] = useState<SDKChatResponse | null>(null);
  const [selectedGroundingSource, setSelectedGroundingSource] = useState<'kb' | 'web'>('kb');

  // Document upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Detail Modal state
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

  // Refresh helper
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch default config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.defaultProvider) {
          setSelectedProvider(data.defaultProvider);
        }
        if (data.defaultModel) {
          setSelectedModel(data.defaultModel);
        }
      })
      .catch(err => console.error('Failed to load default config:', err));
  }, []);

  // Fetch metrics and data
  useEffect(() => {
    fetch('/api/metrics')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(err => console.error(err));

    fetch('/api/audits')
      .then(res => res.json())
      .then(data => setAudits(data))
      .catch(err => console.error(err));

    fetch('/api/documents')
      .then(res => res.json())
      .then(data => setDocuments(data))
      .catch(err => console.error(err));

    fetch('/api/providers')
      .then(res => res.json())
      .then(data => setProviders(data))
      .catch(err => console.error(err));
  }, [refreshTrigger, activeTab]);

  // Trigger global data refresh
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleExportAuditCertificate = () => {
    document.body.classList.add('printing-audit-certificate');
    const cleanup = () => {
      document.body.classList.remove('printing-audit-certificate');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  // Upload handler
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setUploadFile(null);
        handleRefresh();
      } else {
        alert('Upload failed.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document? All vector indices will be deleted.')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        handleRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Chat/Playground interaction
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer gr_sec_mock_token_123' // sdk standard key structure
        },
        body: JSON.stringify({
          messages: [...chatMessages.map(m => ({ role: m.role, content: m.content })), userMsg],
          provider: selectedProvider,
          model: selectedModel,
          applicationName: playgroundAppName,
          userId: 'user_playground_demo',
          sessionId: 'session_demo_play',
          groundingSource: selectedGroundingSource
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json() as SDKChatResponse;
      setLastGuardrailResponse(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.text, auditData: data }]);
    } catch (err: any) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Save Provider Config changes
  const toggleProvider = async (p: ProviderConfig) => {
    const updated = { ...p, enabled: !p.enabled };
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        handleRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Chart preparation
  const chartData = audits.slice(0, 10).reverse().map((a, i) => ({
    name: `Req ${i + 1}`,
    latency: a.metrics?.totalLatencyMs || 0,
    cost: (a.metrics?.costUsd || 0) * 1000, // micro dollars
    score: a.verification?.hallucinationScore || 0
  }));

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#dc2626'];
  const pieData = [
    { name: 'Low Risk', value: metrics.riskDistribution?.LOW || 0 },
    { name: 'Medium Risk', value: metrics.riskDistribution?.MEDIUM || 0 },
    { name: 'High Risk', value: metrics.riskDistribution?.HIGH || 0 },
    { name: 'Critical Risk', value: metrics.riskDistribution?.CRITICAL || 0 }
  ].filter(p => p.value > 0);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-section">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">HalluciNOT</span>
        </div>

        <ul className="nav-links">
          <li
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            Overview Dashboard
          </li>
          <li
            className={`nav-item ${activeTab === 'playground' ? 'active' : ''}`}
            onClick={() => setActiveTab('playground')}
          >
            <Cpu size={18} />
            Chat Playground
          </li>
          <li
            className={`nav-item ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <Database size={18} />
            Knowledge Base
          </li>
          <li
            className={`nav-item ${activeTab === 'audits' ? 'active' : ''}`}
            onClick={() => setActiveTab('audits')}
          >
            <ListTodo size={18} />
            Audit Logs
          </li>
          <li
            className={`nav-item ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            <Settings2 size={18} />
            AI Providers
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="workspace-badge" title="/Users/vc/.gemini/antigravity-ide/scratch/guardrail-plug">
            📁 active-workspace: guardrail-plug
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="content-header">
          <div>
            <h1 className="page-title">
              {activeTab === 'dashboard' && 'Gateway Analytics'}
              {activeTab === 'playground' && 'System Testing Playground'}
              {activeTab === 'documents' && 'Document Grounding Store'}
              {activeTab === 'audits' && 'Audited Transactions'}
              {activeTab === 'providers' && 'Model Providers Configuration'}
            </h1>
            <p className="page-subtitle">
              {activeTab === 'dashboard' && 'Monitor response trust indexes, hallucination scores, and latencies.'}
              {activeTab === 'playground' && 'Submit queries to verify SDK behavior and intercept pipeline.'}
              {activeTab === 'documents' && 'Index corporate policies and markdown archives for RAG retrieval.'}
              {activeTab === 'audits' && 'Audit full request-response lifecycles with strict claim lineages.'}
              {activeTab === 'providers' && 'Toggle models, default endpoints, and manage API keys.'}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <RefreshCw size={16} />
            Sync
          </button>
        </header>

        {/* ---------------------------------------------------- */}
        {/* OVERVIEW DASHBOARD VIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Top Cards Bar */}
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

            {/* Graphics Grid */}
            <div className="visual-grid">
              <div className="glass-card">
                <div className="panel-header">
                  <h3 className="panel-title">Latency Timeline & Claim Safety (Recent Requests)</h3>
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
                      <Tooltip
                        contentStyle={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.08)' }}
                        labelStyle={{ color: '#9ca3af' }}
                      />
                      <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#3b82f6" fillOpacity={1} fill="url(#latencyGlow)" />
                      <Area type="monotone" dataKey="score" name="Hallucination Score (%)" stroke="#f59e0b" fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="panel-header">
                  <h3 className="panel-title">Risk Levels</h3>
                </div>
                {pieData.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                    No risk audits logged yet.
                  </div>
                ) : (
                  <div style={{ margin: 'auto', position: 'relative', width: '100%', height: 180 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
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

            {/* Recent Transaction Log */}
            <div className="glass-card">
              <div className="panel-header">
                <h3 className="panel-title">Recent Audit Stream</h3>
              </div>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Audit ID</th>
                      <th>Application</th>
                      <th>Provider</th>
                      <th>Decision</th>
                      <th>Hallucination</th>
                      <th>Risk</th>
                      <th>Latency</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.slice(0, 5).map(a => (
                      <tr key={a.auditId}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.auditId}</td>
                        <td>{a.applicationName}</td>
                        <td style={{ textTransform: 'capitalize' }}>{a.provider} ({a.model})</td>
                        <td>
                          <span className={`badge ${a.policy?.decision?.toLowerCase()}`}>
                            {a.policy?.decision}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.verification?.hallucinationScore}%</td>
                        <td>
                          <span className={`badge ${(a.verification?.riskLevel || 'LOW').toLowerCase()}`}>
                            {a.verification?.riskLevel}
                          </span>
                        </td>
                        <td>{a.metrics?.totalLatencyMs} ms</td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedAudit(a)}>
                            <Eye size={12} style={{ marginRight: '4px' }} /> View Trace
                          </button>
                        </td>
                      </tr>
                    ))}
                    {audits.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
                          No audit entries logged yet. Initiate requests in the Chat Playground.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* PLAYGROUND VIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'playground' && (
          <div className="playground-container">
            {/* Playground Configuration sidebar */}
            <div className="settings-panel">
              <div className="glass-card form-group">
                <h3 className="panel-title" style={{ marginBottom: '16px' }}>Configuration</h3>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Client App Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={playgroundAppName}
                    onChange={(e) => setPlaygroundAppName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">AI Provider</label>
                  <select
                    className="select-field"
                    value={selectedProvider}
                    onChange={(e) => {
                      setSelectedProvider(e.target.value);
                      if (e.target.value === 'gemini') setSelectedModel('gemini-2.5-flash');
                      else if (e.target.value === 'openrouter') setSelectedModel('google/gemini-2.5-flash');
                      else if (e.target.value === 'openai') setSelectedModel('gpt-4o-mini');
                      else if (e.target.value === 'ollama') setSelectedModel('llama3');
                      else setSelectedModel('mock-model');
                    }}
                  >
                    <option value="openrouter">OpenRouter (API)</option>
                    <option value="openai">OpenAI (REST)</option>
                    <option value="gemini">Google Gemini (REST)</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="mock">Offline Mock Adapter</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label">Model Target</label>
                  <input
                    type="text"
                    className="input-field"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Grounding Source</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className={`btn ${selectedGroundingSource === 'kb' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '8px 4px', fontSize: '11px', justifyContent: 'center' }}
                      onClick={() => setSelectedGroundingSource('kb')}
                    >
                      📁 Files (KB)
                    </button>
                    <button
                      type="button"
                      className={`btn ${selectedGroundingSource === 'web' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '8px 4px', fontSize: '11px', justifyContent: 'center' }}
                      onClick={() => setSelectedGroundingSource('web')}
                    >
                      🌐 Web Search
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time guardrail logs trace panel */}
              <div className="glass-card" style={{ flexGrow: 1 }}>
                <h3 className="panel-title" style={{ marginBottom: '12px' }}>Real-time Trace</h3>
                {lastGuardrailResponse ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>Audit Token:</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#fff', marginTop: '2px' }}>{lastGuardrailResponse.auditId}</div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Policy Outcome:</span>
                      <div style={{ marginTop: '4px' }}>
                        <span className={`badge ${lastGuardrailResponse.decision.toLowerCase()}`}>
                          {lastGuardrailResponse.decision}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Hallucination Index:</span>
                      <div style={{ fontWeight: 700, color: lastGuardrailResponse.hallucinationScore > 30 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                        {lastGuardrailResponse.hallucinationScore}% ({lastGuardrailResponse.riskLevel} Risk)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>RAG Citations Match:</span>
                      <div style={{ color: '#fff', fontWeight: 600, marginTop: '2px' }}>{lastGuardrailResponse.citations?.length || 0} Chunks Retrieved</div>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Metrics:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }}>
                        <div>Latency: {lastGuardrailResponse.metrics?.totalLatencyMs} ms</div>
                        <div>Cost: ${lastGuardrailResponse.metrics?.costUsd?.toFixed(5)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '24px' }}>
                    Send a query to view detailed verification pipelines.
                  </div>
                )}
              </div>
            </div>

            {/* Chat Play space */}
            <div className="chat-panel">
              <div className="chat-messages">
                {chatMessages.map((msg: any, index: number) => (
                  <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                    <div className={`message-bubble ${msg.role}`} style={{ width: '100%', maxWidth: '100%', margin: 0, position: 'relative', overflow: 'hidden' }}>
                      {msg.role === 'assistant' && msg.auditData?.decision === 'BLOCKED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', padding: '8px 12px', borderRadius: '4px', color: '#fca5a5', fontSize: '12px', fontWeight: 600 }}>
                            ⚠️ Guardrail Block: The response below was flagged for high hallucinations ({msg.auditData.hallucinationScore}% Unsupported Claims) and blocked from the final user output.
                          </div>
                          <div style={{ textDecoration: 'line-through', opacity: 0.6, color: '#f3f4f6', paddingLeft: '4px' }}>
                            {msg.auditData.rawResponseBeforeBlock || msg.content}
                          </div>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === 'assistant' && msg.auditData && (
                      <div className="glass-card" style={{ padding: '12px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, color: msg.auditData.decision === 'APPROVED' ? '#10b981' : msg.auditData.decision === 'FLAGGED' ? '#f59e0b' : '#ef4444' }}>
                            🛡️ Guardrail Verdict: {msg.auditData.decision}
                          </span>
                          <span style={{ color: '#9ca3af', fontWeight: 600 }}>
                            Trust Score: {(msg.auditData.factualTrustScore !== undefined ? msg.auditData.factualTrustScore : (1.0 - (msg.auditData.hallucinationScore || 0) / 100)).toFixed(2)} / 1.0
                          </span>
                        </div>
                        {msg.auditData.policyExplanation && (
                          <div style={{ color: '#d1d5db', marginBottom: '6px', fontStyle: 'italic', lineHeight: '1.4' }}>
                            Reasoning: "{msg.auditData.policyExplanation}"
                          </div>
                        )}
                        {msg.auditData.rawThinking && (
                          <details style={{ marginTop: '8px', cursor: 'pointer', outline: 'none' }} open>
                            <summary style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                              🔍 View Split Thought Trace vs Fact-Audited Path
                            </summary>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                              {/* Left Panel: Raw thoughts */}
                              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '6px' }}>💭 Raw Agent Thoughts:</span>
                                <div style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                  {msg.auditData.rawThinking}
                                </div>
                              </div>
                              {/* Right Panel: Audited Thoughts */}
                              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <span style={{ fontSize: '10px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '6px' }}>⚖️ Fact-Audited Ground Truth Path:</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {msg.auditData.thinkingClaims && msg.auditData.thinkingClaims.length > 0 ? (
                                    msg.auditData.thinkingClaims.map((claim: any, cIdx: number) => (
                                      <div key={cIdx} style={{ background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                        <div style={{ color: '#fff', fontSize: '11px', marginBottom: '4px' }}>"{claim.claim}"</div>
                                        <span className={`badge ${claim.status.toLowerCase()}`} style={{ fontSize: '8px', padding: '1px 4px' }}>
                                          {claim.status}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ color: '#6b7280', fontSize: '11px', fontStyle: 'italic' }}>No checkable factual assertions in thoughts.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </details>
                        )}
                        {msg.auditData.claims && msg.auditData.claims.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Final Output Claim Audits:</span>
                            {msg.auditData.claims.map((claim: any, cIdx: number) => (
                              <div key={cIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', gap: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <span style={{ color: '#fff', wordBreak: 'break-all' }}>"{claim.claim}"</span>
                                <span className={`badge ${claim.status.toLowerCase()}`} style={{ fontSize: '9px', padding: '2px 6px', height: 'fit-content' }}>
                                  {claim.status}
                                </span>
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
                    <RefreshCw className="animate-spin" size={16} /> Intercepting & evaluating grounding claims...
                  </div>
                )}
              </div>

              <form className="chat-input-area" onSubmit={handleSendChat}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Type a factual query (e.g. 'How many leave days do employees get?')"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isLoadingChat}
                />
                <button type="submit" className="btn" disabled={isLoadingChat || !chatInput.trim()}>
                  <Send size={16} />
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* KNOWLEDGE BASE VIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'documents' && (
          <div>
            <div className="glass-card" style={{ marginBottom: '24px' }}>
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Index Knowledge Files</h3>
              <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="upload-dropzone" onClick={() => document.getElementById('file-upload-input')?.click()}>
                  <div className="upload-icon">📁</div>
                  <p style={{ fontWeight: 600, marginBottom: '6px' }}>Select document file to upload</p>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>Supports PDF, TXT, MD, DOCX. PDF files will be automatically parsed.</p>
                  {uploadFile && (
                    <div style={{ marginTop: '16px', color: '#10b981', fontWeight: 600, fontSize: '13px' }}>
                      Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
                <input
                  id="file-upload-input"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }} disabled={isUploading || !uploadFile}>
                  {isUploading ? 'Extracting, Chunking & Embedding Chunks...' : 'Upload & Build Vector Index'}
                </button>
              </form>
            </div>

            <div className="glass-card">
              <h3 className="panel-title" style={{ marginBottom: '16px' }}>Active Knowledge Context</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Doc ID</th>
                      <th>Document Title</th>
                      <th>Extension</th>
                      <th>Filesize</th>
                      <th>Upload Timestamp</th>
                      <th>Status</th>
                      <th>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id}>
                        <td style={{ fontFamily: 'monospace' }}>{doc.id}</td>
                        <td style={{ fontWeight: 600, color: '#fff' }}>{doc.name}</td>
                        <td style={{ textTransform: 'uppercase', fontSize: '11px' }}>{doc.type}</td>
                        <td>{(doc.size / 1024).toFixed(1)} KB</td>
                        <td>{new Date(doc.uploadedAt).toLocaleString()}</td>
                        <td>
                          <span className={`badge ${doc.status === 'indexed' ? 'approved' : 'flagged'}`}>
                            {doc.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => handleDeleteDoc(doc.id)}>
                            <Trash2 size={12} style={{ color: '#ef4444' }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {documents.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
                          No grounding files uploaded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* AUDIT LOGS LIST VIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'audits' && (
          <div className="glass-card">
            <h3 className="panel-title" style={{ marginBottom: '16px' }}>Chronological Audit Vault</h3>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Audit ID</th>
                    <th>App Name</th>
                    <th>Prompt Snippet</th>
                    <th>Decision</th>
                    <th>Risk</th>
                    <th>Latency</th>
                    <th>Cost</th>
                    <th>Auditor Trace</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map(a => (
                    <tr key={a.auditId}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.auditId}</td>
                      <td>{a.applicationName}</td>
                      <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.request?.rawPrompt}
                      </td>
                      <td>
                        <span className={`badge ${a.policy?.decision?.toLowerCase()}`}>
                          {a.policy?.decision}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${(a.verification?.riskLevel || 'LOW').toLowerCase()}`}>
                          {a.verification?.riskLevel} ({a.verification?.hallucinationScore}%)
                        </span>
                      </td>
                      <td>{a.metrics?.totalLatencyMs} ms</td>
                      <td>${a.metrics?.costUsd?.toFixed(5)}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedAudit(a)}>
                          <Eye size={12} style={{ marginRight: '4px' }} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {audits.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
                        No audits generated yet. Submit requests in the playground interface.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* PROVIDERS MANAGER VIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'providers' && (
          <div className="glass-card">
            <h3 className="panel-title" style={{ marginBottom: '16px' }}>AI Model Routing Configuration</h3>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Provider Name</th>
                    <th>Default Model</th>
                    <th>Configured Key</th>
                    <th>Latency</th>
                    <th>Status</th>
                    <th>Status Action</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map(p => (
                    <tr key={p.providerId}>
                      <td style={{ fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.defaultModel}</td>
                      <td style={{ color: '#6b7280' }}>
                        {p.providerId === 'openai' || p.providerId === 'gemini' || p.providerId === 'openrouter' ? '••••••••••••••••' : 'None Required'}
                      </td>
                      <td>{p.latency} ms</td>
                      <td>
                        <span className={`badge ${p.healthStatus === 'healthy' ? 'approved' : 'flagged'}`}>
                          {p.healthStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`btn ${p.enabled ? 'btn-danger' : ''}`}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => toggleProvider(p)}
                        >
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

      {/* ---------------------------------------------------- */}
      {/* AUDIT DETAILS TRACE MODAL */}
      {/* ---------------------------------------------------- */}
      {selectedAudit && (
        <div className="modal-overlay audit-certificate-modal">
          <div className="modal-content audit-certificate-content">
            <div className="audit-certificate-print-header">
              <h1>Guardrail Plug — Audit Compliance Certificate</h1>
              <p>Audit ID: {selectedAudit.auditId} · {selectedAudit.applicationName} · {new Date(selectedAudit.timestamp).toLocaleString()}</p>
            </div>
            <div className="modal-header">
              <h3 className="panel-title">Audit Trace: {selectedAudit.auditId}</h3>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary audit-export-btn"
                  style={{ marginRight: '16px', padding: '6px 12px', fontSize: '12px' }}
                  onClick={handleExportAuditCertificate}
                >
                  🖨️ Export Audit Certificate
                </button>
                <button className="modal-close-btn" onClick={() => setSelectedAudit(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              {/* Visual Execution Pipeline Flowchart Graph */}
              <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
                <h4 style={{ color: '#fff', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '16px' }}>
                  Gateway Pipeline Execution Graph
                </h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflowX: 'auto', padding: '10px 0' }}>
                  {/* Node 1: Prompt Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 0 12px rgba(59,130,246,0.6)', border: '2px solid #60a5fa' }}>📥</div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>Prompt Input</span>
                  </div>

                  <div style={{ flexGrow: 1, height: '3px', background: 'linear-gradient(90deg, #3b82f6, #10b981)', minWidth: '20px' }}></div>

                  {/* Node 2: Interceptor Sanitizer */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 0 12px rgba(16,185,129,0.6)', border: '2px solid #34d399' }}>🛡️</div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>Sanitization</span>
                  </div>

                  <div style={{ flexGrow: 1, height: '3px', background: selectedAudit.retrieval?.length > 0 ? 'linear-gradient(90deg, #10b981, #3b82f6)' : '#374151', minWidth: '20px' }}></div>

                  {/* Node 3: RAG Retrieval */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: selectedAudit.retrieval?.length > 0 ? '#3b82f6' : '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', border: selectedAudit.retrieval?.length > 0 ? '2px solid #60a5fa' : '2px solid #374151' }}>🗄️</div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>RAG Context</span>
                  </div>

                  <div style={{ flexGrow: 1, height: '3px', background: 'linear-gradient(90deg, #3b82f6, #a78bfa)', minWidth: '20px' }}></div>

                  {/* Node 4: LLM Invocation */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 0 12px rgba(167,139,250,0.6)', border: '2px solid #c084fc' }}>🤖</div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>LLM Exec</span>
                  </div>

                  <div style={{ flexGrow: 1, height: '3px', background: 'linear-gradient(90deg, #a78bfa, #f59e0b)', minWidth: '20px' }}></div>

                  {/* Node 5: Fact Verification */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: (1.0 - (selectedAudit.verification?.hallucinationScore || 0) / 100) >= 0.7 ? '#10b981' : (1.0 - (selectedAudit.verification?.hallucinationScore || 0) / 100) >= 0.4 ? '#f59e0b' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', border: '2px solid rgba(255,255,255,0.1)' }}>⚖️</div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>Fact Audit</span>
                  </div>

                  <div style={{ flexGrow: 1, height: '3px', background: selectedAudit.policy?.decision === 'APPROVED' ? '#10b981' : '#ef4444', minWidth: '20px' }}></div>

                  {/* Node 6: Policy Engine Gate */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2, minWidth: '80px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: selectedAudit.policy?.decision === 'APPROVED' ? '#10b981' : selectedAudit.policy?.decision === 'FLAGGED' ? '#f59e0b' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: selectedAudit.policy?.decision === 'APPROVED' ? '0 0 12px rgba(16,185,129,0.6)' : '0 0 12px rgba(239,68,68,0.6)', border: selectedAudit.policy?.decision === 'APPROVED' ? '2px solid #34d399' : '2px solid #f87171' }}>
                      {selectedAudit.policy?.decision === 'APPROVED' ? '✅' : selectedAudit.policy?.decision === 'FLAGGED' ? '⚠️' : '🚫'}
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af' }}>Policy Gate</span>
                  </div>
                </div>
              </div>
              {/* Factual Trust Score Panel */}
              <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px', background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
                <div>
                  <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 600 }}>Factual Grounding Trust Score</h4>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '2px' }}>
                    Mathematical confidence of model assertions grounded in knowledge base.
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '32px', fontWeight: 800, color: selectedAudit.verification?.factualTrustScore >= 0.7 ? '#10b981' : selectedAudit.verification?.factualTrustScore >= 0.4 ? '#f59e0b' : '#ef4444' }}>
                    {selectedAudit.verification?.factualTrustScore !== undefined ? selectedAudit.verification.factualTrustScore.toFixed(2) : (1.0 - (selectedAudit.verification?.hallucinationScore || 0) / 100).toFixed(2)}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', fontWeight: 600 }}> / 1.0</span>
                </div>
              </div>

              {/* Side-by-Side Auditing Panel */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
                {/* Left Side: Raw Agent Thought Processes */}
                <div className="glass-card" style={{ background: 'rgba(239,68,68,0.02)', borderColor: 'rgba(239,68,68,0.15)' }}>
                  <h4 style={{ color: '#ef4444', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <XCircle size={14} /> Raw Agent Thought Processes
                  </h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)', minHeight: '150px', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#9ca3af', fontStyle: 'italic' }}>
                    {selectedAudit.response?.rawThinking || "No raw thought patterns logged for this request."}
                  </div>
                </div>

                {/* Right Side: Fact-Audited Ground Truth Path */}
                <div className="glass-card" style={{ background: 'rgba(16,185,129,0.02)', borderColor: 'rgba(16,185,129,0.15)' }}>
                  <h4 style={{ color: '#10b981', fontSize: '13px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} /> Fact-Audited Ground Truth Path
                  </h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)', minHeight: '150px' }}>
                    {selectedAudit.policy?.decision === 'BLOCKED' ? (
                      <div style={{ color: '#ef4444', fontWeight: 600 }}>
                        🚫 REDIRECTED: Response blocked by policy engine.
                        <div style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginTop: '8px', fontSize: '12px', fontStyle: 'italic' }}>
                          "I cannot verify this information because it is unsupported by the corporate knowledge files."
                        </div>
                      </div>
                    ) : (
                      <div>
                        {selectedAudit.response?.sanitizedText}
                        {selectedAudit.retrieval && selectedAudit.retrieval.length > 0 && (
                          <div style={{ marginTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                            <span style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 600 }}>Verified Citations: </span>
                            {selectedAudit.retrieval.map((cit: any) => (
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

              <div style={{ borderBottom: '1px solid var(--glass-border)', marginBottom: '24px', paddingBottom: '8px' }}>
                <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Detailed Auditor Timeline</h4>
              </div>

              {/* Timeline display */}
              <div className="audit-details-timeline">

                {/* 1. Input Interceptor */}
                <div className="timeline-step">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot active">1</div>
                    <div className="timeline-line"></div>
                  </div>
                  <div className="timeline-content">
                    <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lock size={14} style={{ color: '#10b981' }} /> Input Interceptor (PII Scan & Sanitization)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: '#6b7280' }}>Raw Prompt:</span>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                          {selectedAudit.request?.rawPrompt}
                        </div>
                      </div>
                      {selectedAudit.request?.rawPrompt !== selectedAudit.request?.sanitizedPrompt && (
                        <div>
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>Sanitized Prompt (Redacted PII):</span>
                          <div style={{ background: 'rgba(245,158,11,0.05)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(245,158,11,0.1)' }}>
                            {selectedAudit.request?.sanitizedPrompt}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. RAG Context Retrieval */}
                <div className="timeline-step">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot active">2</div>
                    <div className="timeline-line"></div>
                  </div>
                  <div className="timeline-content">
                    <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Database size={14} style={{ color: '#3b82f6' }} /> RAG Context Retrieval
                    </h4>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#6b7280' }}>Retrieved Chunks:</span>
                      {selectedAudit.retrieval && selectedAudit.retrieval.length > 0 ? (
                        <div style={{ marginTop: '6px' }}>
                          {selectedAudit.retrieval.map((c: any) => (
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

                {/* 3. LLM Completion Output */}
                <div className="timeline-step">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot active">3</div>
                    <div className="timeline-line"></div>
                  </div>
                  <div className="timeline-content">
                    <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cpu size={14} style={{ color: '#a78bfa' }} /> LLM Target Execution
                    </h4>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#6b7280' }}>Model Output:</span>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                        {selectedAudit.response?.rawText}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Fact verification claims */}
                <div className="timeline-step">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot active">4</div>
                    <div className="timeline-line"></div>
                  </div>
                  <div className="timeline-content">
                    <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={14} style={{ color: '#f59e0b' }} /> Fact Verification Engine
                    </h4>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: '#6b7280' }}>Extracted Claims & Grounding Status:</span>
                      <div style={{ marginTop: '8px' }}>
                        {selectedAudit.verification?.extractedClaims?.map((c: any, i: number) => {
                          const matchingCitation = selectedAudit.retrieval?.find((r: any) => r.citationId === c.citationId);
                          const sourceName = matchingCitation ? matchingCitation.documentName : (c.citationId ? `Source: ${c.citationId}` : '');
                          const sourceScore = matchingCitation ? matchingCitation.score : null;
                          return (
                            <div key={i} className="claim-row">
                              <div className="claim-indicator">
                                <span className={`badge ${c.status.toLowerCase()}`}>
                                  {c.status}
                                </span>
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#fff' }}>"{c.claim}"</div>
                                <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
                                  {c.explanation}
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', minHeight: '56px', justifyContent: 'center' }}>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grounding Source</div>
                                {c.citationId ? (
                                  <>
                                    <div style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '176px' }} title={sourceName}>
                                      📄 {sourceName}
                                    </div>
                                    {sourceScore !== null && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                        <span style={{
                                          fontWeight: 800,
                                          color: sourceScore >= 0.8 ? '#10b981' : sourceScore >= 0.5 ? '#f59e0b' : '#ef4444',
                                          fontSize: '11px'
                                        }}>
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
                        {(!selectedAudit.verification?.extractedClaims || selectedAudit.verification.extractedClaims.length === 0) && (
                          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No claim evaluations run (e.g. prompt was blocked or zero context retrieved).</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Policy Engine Decision */}
                <div className="timeline-step">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot active">5</div>
                  </div>
                  <div className="timeline-content" style={{ borderLeft: '4px solid', borderLeftColor: selectedAudit.policy?.decision === 'APPROVED' ? '#10b981' : selectedAudit.policy?.decision === 'FLAGGED' ? '#f59e0b' : '#ef4444' }}>
                    <h4 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertOctagon size={14} style={{ color: '#ef4444' }} /> Policy Evaluator Decision
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                      <div>
                        <span className={`badge ${selectedAudit.policy?.decision?.toLowerCase()}`}>
                          {selectedAudit.policy?.decision}
                        </span>
                      </div>
                      <div style={{ color: '#fff', fontWeight: 500 }}>{selectedAudit.policy?.explanation}</div>
                      {selectedAudit.policy?.violatedRules?.length > 0 && (
                        <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>
                          Violated: {selectedAudit.policy?.violatedRules.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
