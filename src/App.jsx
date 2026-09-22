import React, { useState, useEffect } from 'react';
import {
  Home,
  Users,
  TrendingUp,
  FolderOpen,
  Settings,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Calendar,
  Mail,
  Sparkles,
  Send,
  Copy,
  Upload,
  Check,
  Plus
} from 'lucide-react';
import DocumentVault from './components/DocumentVault.jsx';
import ResearchNewsTicker from './components/ResearchNewsTicker.jsx';
import MarketNarratives from './components/MarketNarratives.jsx';

export default function App() {
  const [theme, setTheme] = useState('light');
  const [activeClient, setActiveClient] = useState('Robert & Patricia Chen');
  const [activeTab, setActiveTab] = useState('allocation'); // allocation, gaps, crm, vault
  
  // Database States
  const [advisor, setAdvisor] = useState(null);
  const [account, setAccount] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [targets, setTargets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  
  // Interaction/UI states
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('vault');
  const [sendHighlight, setSendHighlight] = useState(false); 
  const [chatInput, setChatInput] = useState('');

  // n8n integration state
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [researchDigestData, setResearchDigestData] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestRefreshing, setDigestRefreshing] = useState(false);
  const [digestStatus, setDigestStatus] = useState('');

  // Vault-to-chat integration
  const [vaultFilesForChat, setVaultFilesForChat] = useState(null);

  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'copilot',
      text: "Hello Sarah, I have loaded context for the **Chen Household**. I detected **2 Red Flags** (Cash Drag, Equity Underweight) and **2 Yellow Flags** (Overdue KYC, Active Fund Fee Drag). What would you like to review first?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  // Fetch SQLite records from Express backend
  const fetchData = async () => {
    try {
      const advRes = await fetch('/api/advisor');
      const advData = await advRes.json();
      setAdvisor(advData);

      const accRes = await fetch('/api/account');
      const accData = await accRes.json();
      setAccount(accData.account);
      setHoldings(accData.holdings);

      const tskRes = await fetch('/api/tasks');
      const tskData = await tskRes.json();
      setTasks(tskData);

      const tgtRes = await fetch('/api/targets');
      const tgtData = await tgtRes.json();
      setTargets(tgtData);

      const calRes = await fetch('/api/calendar/events');
      const calData = await calRes.json();
      setCalendarEvents(calData);
    } catch (err) {
      console.error("Error loading advisor data:", err);
    }
  };

  const fetchResearchDigest = async () => {
    setDigestLoading(true);
    try {
      const res = await fetch('/api/research-digest');
      const data = await res.json();
      setResearchDigestData(data);
    } catch (err) {
      console.error("Error loading research digest:", err);
    } finally {
      setDigestLoading(false);
    }
  };

  const refreshResearchDigest = async () => {
    setDigestRefreshing(true);
    setDigestStatus('Connecting to Alpha Vantage NEWS_SENTIMENT API...');

    const statusSteps = [
      { msg: 'Fetching latest financial market news (50 articles)...', delay: 2000 },
      { msg: 'Sending news feed to AI Research Agent via N8N...', delay: 6000 },
      { msg: 'AI Agent parsing article sentiment & ticker relevance...', delay: 14000 },
      { msg: 'AI Agent identifying dominant market themes & narratives...', delay: 24000 },
      { msg: 'Generating holdings ticker insights & narrative summaries...', delay: 34000 },
      { msg: 'Persisting digest to database for cache...', delay: 42000 },
    ];

    const timers = statusSteps.map(step =>
      setTimeout(() => setDigestStatus(step.msg), step.delay)
    );

    try {
      const res = await fetch('/api/research-digest/refresh', { method: 'POST' });
      timers.forEach(clearTimeout);

      if (res.status === 429) {
        const errData = await res.json();
        setDigestStatus('');
        setChatMessages(prev => [...prev, {
          sender: 'copilot',
          text: `**API Rate Limit:** ${errData.message || 'Alpha Vantage free tier limit reached. Please wait and try again.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setDigestStatus('');
        setChatMessages(prev => [...prev, {
          sender: 'copilot',
          text: `**Digest Error:** ${data.error}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }
      setDigestStatus('Rendering ticker widget & market narrative cards...');
      await new Promise(r => setTimeout(r, 800));
      setResearchDigestData(data);
      setDigestStatus('Digest complete — ' + (data.research_digest?.generated_from_articles || 0) + ' articles processed');
      await new Promise(r => setTimeout(r, 1500));
      setDigestStatus('');
    } catch (err) {
      console.error("Error refreshing research digest:", err);
      timers.forEach(clearTimeout);
      setDigestStatus('');
    } finally {
      setDigestRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchResearchDigest();
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Rebalance/Optimizations API calls
  const handleExecuteAction = async (actionType) => {
    setLoading(true);
    try {
      const res = await fetch('/api/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType })
      });
      const data = await res.json();
      
      await fetchData(); // Refresh visual canvas grids
      
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'copilot',
          text: `**Portfolio Rebalance Complete!**\n\n${data.message}\n\nHere is the generated Compliance Document for your records:\n\n\`\`\`text\n${data.complianceDocument}\n\`\`\``,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          complianceDoc: data.complianceDocument
        }
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Chat queries submit
  const handleSendChat = async (textToSend) => {
    const prompt = textToSend || chatInput;
    if (!prompt.trim()) return;

    const userMsg = {
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    if (!textToSend) setChatInput('');

    setLoading(true);
    try {
      const contextSummary = {
        advisor_name: advisor ? `${advisor.first_name} ${advisor.last_name}` : '',
        advisor_role: advisor?.role || '',
        household_name: activeClient || '',
        total_aum: account?.total_aum || 0,
        investment_objective: account?.investment_objective || '',
        risk_tolerance: account?.risk_tolerance || '',
        service_tier: account?.service_tier || '',
        next_review_date: account?.next_review_date || ''
      };

      const recentHistory = conversationHistory.slice(-10);

      const chatPayload = {
        message: prompt,
        activeContext: activeClient,
        sessionId,
        timestamp: new Date().toISOString(),
        advisorId: advisor?.employee_id || 'ADV_001',
        accountId: account?.account_id || 'ACC_001',
        activeTab,
        context: contextSummary,
        conversationHistory: recentHistory
      };

      if (vaultFilesForChat && vaultFilesForChat.length > 0) {
        chatPayload.vaultContext = {
          folderId: '1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz',
          selectedFiles: vaultFilesForChat.map(f => ({ id: f.id, name: f.name })),
          action: 'summarize'
        };
        setVaultFilesForChat(null);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload)
      });
      const data = await res.json();

      setChatMessages(prev => [
        ...prev,
        {
          sender: 'copilot',
          text: data.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          complianceDoc: data.complianceDocument || null,
          suggestedActions: data.suggestedActions || null,
          emailDraft: data.emailDraft || null
        }
      ]);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: prompt },
        { role: 'assistant', content: data.response }
      ]);

      if (data.action && data.action.type === 'NAVIGATE_TO') {
        setActiveTab(data.action.payload.tab);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Gmail sync draft API call
  const handleCreateGmailDraft = async (to, subject, bodyText) => {
    setLoading(true);
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body: bodyText })
      });
      const data = await res.json();
      
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'copilot',
          text: `📧 **Workspace Gmail Draft Created**\n${data.message}\n\n*Synced under Workspace ID ${data.draft.id}*`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Lightweight markdown renderer for copilot messages
  const renderMarkdown = (text) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<strong style="font-size:13px;display:block;margin:8px 0 4px;">$1</strong>')
      .replace(/^## (.+)$/gm, '<strong style="font-size:14px;display:block;margin:10px 0 4px;">$1</strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--surface-alt, #f0f0f0);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>')
      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border, #e0e0e0);margin:8px 0;"/>')
      .replace(/^\*\s{1,3}(.+)$/gm, '<span style="display:block;padding-left:12px;">• $1</span>')
      .replace(/^- (.+)$/gm, '<span style="display:block;padding-left:12px;">• $1</span>')
      .replace(/^(\d+)\. (.+)$/gm, '<span style="display:block;padding-left:12px;">$1. $2</span>')
      .replace(/\n/g, '<br/>');
    return html;
  };

  // Plan PDF upload simulator
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await fetch('/api/upload-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, isVault: uploadTarget === 'vault' })
      });
      const data = await res.json();
      await fetchData();

      setChatMessages(prev => [
        ...prev,
        {
          sender: 'copilot',
          text: `📁 **Plan PDF Ingested (${file.name}):**\n*   **Readiness:** ${data.summary.retirementReadiness}%\n*   **Target Date:** ${data.summary.targetDate}\n\n**Identified Gaps:**\n${data.summary.gaps.map(g => `*   ${g}`).join('\n')}\n\n*Context loaded to ${data.persisted ? 'Document Vault (Persistent)' : 'Chat Session (Temporary)'}*`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      if (uploadTarget === 'vault') setActiveTab('vault');
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // ----------------------------------------------------
  // DYNAMIC CHART RENDERING LOGIC (SVG Native)
  // ----------------------------------------------------

  // Calculate actual holdings percentages
  const totalVal = holdings.reduce((sum, h) => sum + h.market_value, 0) || 1.8e6;
  const equityVal = holdings.filter(h => ['IVV', 'IEFA', 'IEMG', 'IJH', 'IJR'].includes(h.ticker)).reduce((sum, h) => sum + h.market_value, 0);
  const fiVal = holdings.filter(h => ['AGG', 'IEF', 'SGOV', 'ACT_BND'].includes(h.ticker)).reduce((sum, h) => sum + h.market_value, 0);
  const cashVal = holdings.filter(h => h.ticker === 'CASH').reduce((sum, h) => sum + h.market_value, 0);

  const actEquityPct = Math.round((equityVal / totalVal) * 100);
  const actFiPct = Math.round((fiVal / totalVal) * 100);
  const actCashPct = Math.round((cashVal / totalVal) * 100);

  // SVG Donut slice calculators
  const radius = 50;
  const circum = 2 * Math.PI * radius; // ~314.16

  const getDonutSlices = (equity, fi, cash) => {
    const cashLen = (cash / 100) * circum;
    const fiLen = (fi / 100) * circum;
    const eqLen = (equity / 100) * circum;

    return {
      cash: { len: cashLen, offset: 0 },
      fi: { len: fiLen, offset: -cashLen },
      equity: { len: eqLen, offset: -(cashLen + fiLen) }
    };
  };

  const targetSlices = getDonutSlices(65, 30, 5);
  const actualSlices = getDonutSlices(actEquityPct, actFiPct, actCashPct);

  return (
    <div className="app-container">
      
      {/* ----------------------------------------------------
          TOP GLOBAL CONTEXT RIBBON
          ---------------------------------------------------- */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="brand-text">
            <h1>Advisor AI Copilot Portal</h1>
            {advisor && (
              <p>
                {advisor.first_name} {advisor.last_name} • {advisor.role} • <span className="font-mono">{advisor.employee_id}</span>
              </p>
            )}
          </div>
        </div>

        <div className="header-meta">
          {advisor && (
            <>
              <div className="meta-item hidden md:block">
                Book AUM: <span className="meta-val">${(advisor.aum_managed / 1000000).toFixed(1)}M</span>
              </div>
              <div className="meta-item hidden md:block">
                Manager: <span className="meta-val">{advisor.employee_manager.split(',')[0]}</span>
              </div>
            </>
          )}
          <button onClick={toggleTheme} className="btn-chat-action secondary">
            {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
        </div>
      </header>

      {/* Main Core Body Container */}
      <div className="main-workspace">

        {/* ----------------------------------------------------
            COLUMN 1: NAVIGATION & CONTEXT SELECTOR
            ---------------------------------------------------- */}
        <aside className="sidebar-col">
          <div className="sidebar-search">
            <div className="search-wrapper">
              <Search className="search-icon w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search clients..." 
                className="search-input"
              />
            </div>
          </div>

          <nav className="sidebar-nav">
            <button 
              onClick={() => { setActiveClient(''); setActiveTab('overview'); }}
              className={`nav-link ${!activeClient && activeTab === 'overview' ? 'active' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <Home className="w-4 h-4" />
                Book Overview
              </span>
            </button>
            
            <span className="nav-heading">Households (Active)</span>

            <button 
              onClick={() => { setActiveClient('Robert & Patricia Chen'); if (activeTab === 'overview') setActiveTab('allocation'); }}
              className={`nav-link ${activeClient === 'Robert & Patricia Chen' ? 'active' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                Chen Household
              </span>
              {holdings.some(h => h.ticker === 'CASH' && h.market_value > 500000) && (
                <span className="nav-dot"></span>
              )}
            </button>
          </nav>

          {/* Google Calendar Sync Widget (Column 1 Base) */}
          <div className="sidebar-calendar">
            <div className="calendar-header">
              <Calendar className="w-3 h-3" />
              Calendar Schedule
            </div>
            <div className="calendar-list">
              {calendarEvents.slice(0, 3).map(evt => (
                <div 
                  key={evt.id} 
                  onClick={() => {
                    if (evt.summary.includes("Chen")) {
                      setActiveClient("Robert & Patricia Chen");
                      setActiveTab("allocation");
                    }
                  }}
                  className={`calendar-item ${evt.summary.includes("Chen") ? 'urgent' : ''}`}
                >
                  <div className="calendar-item-title">{evt.summary}</div>
                  <div className="calendar-item-time">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(evt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ----------------------------------------------------
            COLUMN 2: DYNAMIC DASHBOARD CANVAS
            ---------------------------------------------------- */}
        <main className="canvas-col">
          
          {/* If Book Overview is active */}
          {!activeClient ? (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 className="font-title" style={{ fontSize: '22px', fontWeight: 600 }}>Practice Overview</h2>
                <p style={{ color: 'var(--ink-secondary)', fontSize: '13px' }}>Practice-wide aggregate alerts and dashboard opportunities.</p>
              </div>

              {/* Book Metrics */}
              <div className="dashboard-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Total Book AUM</span>
                  <span className="kpi-value">$180.0M</span>
                  <span className="kpi-subtext text-success">+4.2% YTD Return</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Active Households</span>
                  <span className="kpi-value">130</span>
                  <span className="kpi-subtext">Average $1.38M/Client</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Urgent System Flags</span>
                  <span className="kpi-value critical flex items-center gap-1.5">
                    4
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <span className="kpi-subtext text-critical">2 Red Flags, 2 Yellow Flags</span>
                </div>
              </div>

              {/* Research Digest Agent Section */}
              <div className="content-card research-digest-section" style={{ marginBottom: '20px' }}>
                <div className="digest-header">
                  <h3 className="card-title" style={{ margin: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      Research Digest Agent
                    </span>
                  </h3>
                  <div className="digest-meta">
                    {researchDigestData?.research_digest && (
                      <>
                        <span className={`sentiment-pill digest-sentiment ${researchDigestData.research_digest.market_sentiment?.toLowerCase().includes('bearish') ? 'bearish' : researchDigestData.research_digest.market_sentiment?.toLowerCase().includes('bullish') ? 'bullish' : 'neutral'}`}>
                          {researchDigestData.research_digest.market_sentiment}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                          {researchDigestData.research_digest.generated_from_articles} articles
                        </span>
                      </>
                    )}
                    {researchDigestData?.generated_at && (
                      <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                        Updated: {new Date(researchDigestData.generated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={refreshResearchDigest}
                    disabled={digestRefreshing}
                    className="btn-chat-action secondary"
                    style={{ fontSize: '9px', padding: '3px 8px', opacity: digestRefreshing ? 0.6 : 1 }}
                  >
                    {digestRefreshing ? 'Processing...' : 'Refresh Digest'}
                  </button>
                </div>

                {digestRefreshing && digestStatus && (
                  <div className="digest-processing-status">
                    <span className="digest-status-dot"></span>
                    <span>{digestStatus}</span>
                  </div>
                )}

                {digestLoading ? (
                  <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', padding: '12px 0' }} className="animate-pulse">
                    Loading research digest...
                  </p>
                ) : (
                  <>
                    <ResearchNewsTicker items={researchDigestData?.holdings_news_ticker} />
                    <MarketNarratives
                      narratives={researchDigestData?.market_narratives}
                      onCardClick={(message) => {
                        setChatInput(message);
                        setSendHighlight(true);
                        setTimeout(() => setSendHighlight(false), 3000);
                      }}
                    />
                  </>
                )}
              </div>

              {/* Practice Alert list */}
              <div className="content-card">
                <h3 className="card-title">Urgent Actions & Book Anomalies</h3>
                
                {holdings.some(h => h.ticker === 'CASH' && h.market_value > 500000) && (
                  <div className="alert-banner critical">
                    <div className="alert-content">
                      <AlertTriangle className="w-4 h-4 text-critical" style={{ marginTop: '2px' }} />
                      <div>
                        <span className="alert-title critical">RED FLAG: Cash Drag Drift Alert</span>
                        <p className="alert-desc">Chen Household is holding {actCashPct}% cash (${cashVal.toLocaleString()}) against a target limit of 5.0%. Excess Cash: ${(cashVal - 90000).toLocaleString()}.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setActiveClient('Robert & Patricia Chen'); setActiveTab('allocation'); }}
                      className="btn-alert-action"
                    >
                      Resolve
                    </button>
                  </div>
                )}

                {holdings.some(h => h.ticker === 'ACT_BND') && (
                  <div className="alert-banner caution">
                    <div className="alert-content">
                      <AlertTriangle className="w-4 h-4 text-caution" style={{ marginTop: '2px' }} />
                      <div>
                        <span className="alert-title caution">YELLOW FLAG: Fee Optimization Drag</span>
                        <p className="alert-desc">Chen Household holds ACT_BND active mutual fund (expense ratio 0.85%) representing $90,000. Recommending swap for passive AGG (expense ratio 0.03%).</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setActiveClient('Robert & Patricia Chen'); setActiveTab('allocation'); }}
                      className="btn-alert-action"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            
            // Client view dashboard
            <div>
              {/* Client header banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 className="font-title" style={{ fontSize: '22px', fontWeight: 600 }}>{activeClient}</h2>
                    <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--accent)', background: 'var(--accent-light)', color: 'var(--accent)' }}>
                      Tier 1 — Wealth
                    </span>
                  </div>
                  {account && (
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--ink-secondary)', marginTop: '4px' }}>
                      <span>Objective: <strong>{account.investment_objective}</strong></span>
                      <span>Risk Profile: <strong>{account.risk_tolerance}</strong></span>
                      <span>Next Review: <strong>{account.next_review_date}</strong></span>
                    </div>
                  )}
                </div>

                {account && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ink-muted)', uppercase: 'true', letterSpacing: '0.8px' }}>HOUSEHOLD AUM</span>
                    <h3 className="font-title" style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>${account.total_aum.toLocaleString()}</h3>
                  </div>
                )}
              </div>

              {/* Navigation Tabs */}
              <div className="tab-bar">
                <button 
                  onClick={() => setActiveTab('allocation')}
                  className={`tab-btn ${activeTab === 'allocation' ? 'active' : ''}`}
                >
                  Portfolio Allocation & Holdings
                </button>
                <button 
                  onClick={() => setActiveTab('gaps')}
                  className={`tab-btn ${activeTab === 'gaps' ? 'active' : ''}`}
                >
                  Financial Plan Gaps & Scenarios
                </button>
                <button 
                  onClick={() => setActiveTab('crm')}
                  className={`tab-btn ${activeTab === 'crm' ? 'active' : ''}`}
                >
                  CRM Activity & Flags
                </button>
                <button 
                  onClick={() => setActiveTab('vault')}
                  className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
                >
                  Document Vault
                </button>
              </div>

              {/* ----------------------------------------------------
                  TAB 1: PORTFOLIO ALLOCATION
                  ---------------------------------------------------- */}
              {activeTab === 'allocation' && (
                <div>
                  
                  {/* Allocation Target vs Actual display */}
                  <div className="content-card">
                    <h3 className="card-title" style={{ fontSize: '11px', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Asset Class Target Allocation Drift</h3>
                    
                    <div className="chart-container" style={{ marginBottom: '24px' }}>
                      {/* Donut Chart Target Model */}
                      <div className="donut-chart-wrapper">
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-secondary)' }}>Target Model (65/30/5)</span>
                        <svg width="140" height="140" viewBox="0 0 140 140">
                          {/* Cash Slice (5%) */}
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--highlight)" strokeWidth="14" 
                            strokeDasharray={`${targetSlices.cash.len} ${circum}`} 
                            strokeDashoffset={targetSlices.cash.offset}
                            transform="rotate(-90 70 70)"
                          />
                          {/* Fixed Income Slice (30%) */}
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--ink-secondary)" strokeWidth="14" 
                            strokeDasharray={`${targetSlices.fi.len} ${circum}`} 
                            strokeDashoffset={targetSlices.fi.offset}
                            transform="rotate(-90 70 70)"
                          />
                          {/* Equity Slice (65%) */}
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--accent)" strokeWidth="14" 
                            strokeDasharray={`${targetSlices.equity.len} ${circum}`} 
                            strokeDashoffset={targetSlices.equity.offset}
                            transform="rotate(-90 70 70)"
                          />
                          <circle cx="70" cy="70" r="42" fill="var(--surface)" />
                          <text x="70" y="75" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">MODERATE</text>
                        </svg>
                      </div>

                      {/* Donut Chart Actual Position */}
                      <div className="donut-chart-wrapper">
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-secondary)' }}>Actual Portfolio Position</span>
                        <svg width="140" height="140" viewBox="0 0 140 140">
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--highlight)" strokeWidth="14" 
                            strokeDasharray={`${actualSlices.cash.len} ${circum}`} 
                            strokeDashoffset={actualSlices.cash.offset}
                            transform="rotate(-90 70 70)"
                          />
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--ink-secondary)" strokeWidth="14" 
                            strokeDasharray={`${actualSlices.fi.len} ${circum}`} 
                            strokeDashoffset={actualSlices.fi.offset}
                            transform="rotate(-90 70 70)"
                          />
                          <circle cx="70" cy="70" r="50" fill="transparent" stroke="var(--accent)" strokeWidth="14" 
                            strokeDasharray={`${actualSlices.equity.len} ${circum}`} 
                            strokeDashoffset={actualSlices.equity.offset}
                            transform="rotate(-90 70 70)"
                          />
                          <circle cx="70" cy="70" r="42" fill="var(--surface)" />
                          <text x="70" y="75" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
                            {actCashPct > 10 ? 'DRIFTED' : 'ALIGNED'}
                          </text>
                        </svg>
                      </div>

                      {/* Legend */}
                      <div className="donut-legend">
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: 'var(--accent)' }}></div>
                          <span>Equities (Target: 65% | Actual: {actEquityPct}%)</span>
                        </div>
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: 'var(--ink-secondary)' }}></div>
                          <span>Fixed Income (Target: 30% | Actual: {actFiPct}%)</span>
                        </div>
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: 'var(--highlight)' }}></div>
                          <span>Cash (Target: 5% | Actual: {actCashPct}%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ marginTop: '16px' }}>
                      {targets.map(tgt => {
                        const isRed = tgt.flag_status === 'RED_FLAG';
                        return (
                          <div 
                            key={tgt.allocation_id} 
                            style={{ padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: isRed ? 'var(--critical-light)' : 'var(--surface-alt)', transition: 'all 0.2s' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{tgt.asset_class}</span>
                              {isRed && (
                                <span style={{ fontSize: '8px', fontWeight: 700, bg: 'var(--critical)', color: '#fff', padding: '2px 6px', borderRadius: '3px', background: 'var(--critical)' }}>
                                  DRIFT
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                              <span>Target: <strong>{tgt.target_pct}%</strong></span>
                              <span>Actual: <strong className={isRed ? 'text-critical' : ''}>{tgt.actual_pct}%</strong></span>
                              <span>Drift: <strong className={isRed ? 'text-critical' : 'text-success'}>{tgt.drift_pct > 0 ? `+${tgt.drift_pct}` : tgt.drift_pct}%</strong></span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Portfolio Holdings Table */}
                  <div className="table-wrapper">
                    <table className="holdings-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Fund Name</th>
                          <th style={{ textAlign: 'right' }}>Shares</th>
                          <th style={{ textAlign: 'right' }}>Market Value</th>
                          <th style={{ textAlign: 'right' }}>Cost Basis</th>
                          <th style={{ textAlign: 'right' }}>Expense Ratio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map(hld => {
                          const isCashDrag = hld.ticker === 'CASH' && hld.market_value > 500000;
                          const isFeeDrag = hld.ticker === 'ACT_BND';
                          return (
                            <tr key={hld.holding_id} className={isCashDrag || isFeeDrag ? 'highlight' : ''}>
                              <td className="ticker-label">{hld.ticker}</td>
                              <td className="fund-name-label">{hld.fund_name}</td>
                              <td style={{ textAlign: 'right' }}>{hld.shares.toLocaleString()}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>${hld.market_value.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              <td style={{ textAlign: 'right' }}>${hld.cost_basis.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: hld.expense_ratio > 0.5 ? 'var(--critical)' : 'var(--ink)' }}>{hld.expense_ratio}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------
                  TAB 2: PLAN GAPS & SCENARIOS
                  ---------------------------------------------------- */}
              {activeTab === 'gaps' && (
                <div>
                  
                  {/* Financial planning progress */}
                  <div className="content-card">
                    <h3 className="card-title">Retirement Wealth Accumulation Projection</h3>
                    
                    {/* SVG Retirement line chart */}
                    <div className="line-chart-wrapper">
                      <svg width="100%" height="220" viewBox="0 0 400 220" style={{ overflow: 'visible' }}>
                        {/* Grids */}
                        <line x1="50" y1="30" x2="370" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="50" y1="80" x2="370" y2="80" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="50" y1="130" x2="370" y2="130" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="50" y1="180" x2="370" y2="180" stroke="var(--border-strong)" strokeWidth="1.5" />
                        
                        {/* Axes label lines */}
                        <line x1="50" y1="30" x2="50" y2="180" stroke="var(--border-strong)" strokeWidth="1.5" />
                        
                        {/* Y-axis Labels */}
                        <text x="40" y="35" textAnchor="end" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">$4.5M</text>
                        <text x="40" y="85" textAnchor="end" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">$3.0M</text>
                        <text x="40" y="135" textAnchor="end" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">$1.5M</text>
                        
                        {/* X-axis Labels */}
                        <text x="50" y="200" textAnchor="middle" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">2026</text>
                        <text x="210" y="200" textAnchor="middle" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">2030</text>
                        <text x="370" y="200" textAnchor="middle" fontSize="9" fill="var(--ink-secondary)" fontFamily="var(--font-mono)">2035</text>
                        
                        {/* Baseline curve (Muted Gold) */}
                        <path d="M 50 140 Q 210 130 330 110" fill="none" stroke="var(--highlight)" strokeWidth="3" />
                        <text x="335" y="115" fontSize="8" fill="var(--highlight)" fontWeight="600">Baseline (2033)</text>
                        
                        {/* Simulated Curve (Pine Green) */}
                        <path d="M 50 140 Q 210 100 370 45" fill="none" stroke="var(--accent)" strokeWidth="3" />
                        <text x="350" y="35" fontSize="8" fill="var(--accent)" fontWeight="600">Rebalanced & Delayed (2035)</text>
                        
                        {/* Points */}
                        <circle cx="50" cy="140" r="4" fill="var(--ink)" />
                        <circle cx="330" cy="110" r="4" fill="var(--highlight)" />
                        <circle cx="370" cy="45" r="4" fill="var(--accent)" />
                      </svg>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center" style={{ marginTop: '24px' }}>
                      <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-alt)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--ink-secondary)', block: 'true' }}>Retirement Readiness</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--highlight)', display: 'block', marginTop: '4px' }}>82% Funded</span>
                        <p style={{ fontSize: '9px', color: 'var(--ink-muted)', marginTop: '2px' }}>Target age: 65 (2033)</p>
                      </div>
                      <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-alt)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--ink-secondary)', block: 'true' }}>College Fund Gap</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--critical)', display: 'block', marginTop: '4px' }}>Underfunded</span>
                        <p style={{ fontSize: '9px', color: 'var(--ink-muted)', marginTop: '2px' }}>UC Berkeley tuition 2027</p>
                      </div>
                      <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-alt)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--ink-secondary)', block: 'true' }}>Annual Roth Target</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)', display: 'block', marginTop: '4px' }}>$75,000 / Yr</span>
                        <p style={{ fontSize: '9px', color: 'var(--ink-muted)', marginTop: '2px' }}>Pre-retirement ladder</p>
                      </div>
                    </div>
                  </div>

                  {/* Configurable Scenario Selector Workspace */}
                  <div className="content-card">
                    <h3 className="card-title">Simulate What-If Planning Scenarios</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--ground)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Scenario A: Delay Retirement by 2 Years</span>
                        <p style={{ color: 'var(--ink-secondary)', fontSize: '12px', marginTop: '4px' }}>Simulates retirement in 2035 (age 67). Increases Readiness score to 94% due to extra compound growth.</p>
                        <button 
                          onClick={() => handleSendChat("What if Robert delays retirement to 67?")}
                          className="btn-chat-action secondary"
                          style={{ marginTop: '12px' }}
                        >
                          Run Simulation
                        </button>
                      </div>
                      <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--ground)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Scenario B: Increase Roth Conversion to $100k/yr</span>
                        <p style={{ color: 'var(--ink-secondary)', fontSize: '12px', marginTop: '4px' }}>Check potential tax brackets limits. Converts pre-tax balances faster but increases active tax exposure.</p>
                        <button 
                          onClick={() => handleSendChat("What if we convert $100k to Roth IRA instead of $75k?")}
                          className="btn-chat-action secondary"
                          style={{ marginTop: '12px' }}
                        >
                          Run Simulation
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------
                  TAB 3: CRM TIMELINE & TASKS
                  ---------------------------------------------------- */}
              {activeTab === 'crm' && (
                <div className="flex flex-col gap-6">
                  
                  {/* Task list with compliance flags */}
                  <div className="table-wrapper">
                    <div style={{ padding: '14px 16px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '11px', color: 'var(--ink-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      Compliance & Administrative Flags
                    </div>
                    <div>
                      {tasks.map(task => {
                        const isOverdue = task.status === 'Overdue';
                        const isYellow = task.flag_status === 'YELLOW_FLAG';
                        return (
                          <div 
                            key={task.task_id} 
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border)', background: isOverdue ? 'var(--critical-light)' : 'var(--surface)' }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                              {task.flag_status === 'RED_FLAG' || isOverdue ? (
                                <AlertTriangle className="w-5 h-5 text-critical" style={{ marginTop: '2px' }} />
                              ) : isYellow ? (
                                <AlertTriangle className="w-5 h-5 text-caution" style={{ marginTop: '2px' }} />
                              ) : (
                                <CheckCircle className="w-5 h-5 text-success" style={{ marginTop: '2px' }} />
                              )}
                              <div>
                                <span style={{ fontWeight: 700, fontSize: '13px' }}>{task.subject}</span>
                                <p style={{ color: 'var(--ink-secondary)', fontSize: '12px', marginTop: '2px' }}>{task.description}</p>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: 'var(--ink-muted)', marginTop: '8px' }}>
                                  <span>Type: <strong>{task.task_type}</strong></span>
                                  <span>Due: <strong>{task.activity_date}</strong></span>
                                </div>
                              </div>
                            </div>
                            
                            {task.status !== 'Completed' && (
                              <button 
                                onClick={async () => {
                                  await fetch('/api/tasks/complete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ task_id: task.task_id })
                                  });
                                  fetchData();
                                }}
                                className="btn-alert-action"
                              >
                                Mark Complete
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------
                  TAB 4: DOCUMENT VAULT / PDF DROPZONE
                  ---------------------------------------------------- */}
              {activeTab === 'vault' && (
                <DocumentVault
                  advisorId={advisor?.employee_id || 'EMP_9021'}
                  sessionId={sessionId}
                  onSendToChat={(selectedFiles) => {
                    const fileDetails = selectedFiles.map(f => `Document Name : ${f.name} - File ID : ${f.id}`).join(', ');
                    const vaultMessage = `Please summarize these documents: ${fileDetails}`;
                    setChatInput(vaultMessage);
                    setVaultFilesForChat(selectedFiles);
                  }}
                />
              )}
            </div>
          )}
        </main>

        {/* ----------------------------------------------------
            COLUMN 3: CONVERSATIONAL COPILOT SIDEBAR
            ---------------------------------------------------- */}
        <aside className="copilot-col">
          
          <div className="copilot-header">
            <span className="copilot-title">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              {activeClient ? `COPILOT: ${activeClient.toUpperCase()}` : 'COPILOT: GENERAL MODE'}
            </span>
          </div>

          {/* Quick Alert actions list (At the top of chat) */}
          {activeClient === 'Robert & Patricia Chen' && (
            <div className="alert-feed">
              <div className="alert-feed-title">
                <AlertTriangle className="w-3.5 h-3.5" />
                Urgent Alerts ({holdings.some(h => h.ticker === 'CASH' && h.market_value > 500000) ? '2' : '1'} Red/Yellow Flags)
              </div>
              <div className="alert-feed-chips">
                {holdings.some(h => h.ticker === 'CASH' && h.market_value > 500000) && (
                  <button 
                    onClick={() => handleSendChat("Show me the cash drag alert and rebalance targets")}
                    className="feed-chip critical"
                  >
                    Resolve Cash Drag
                  </button>
                )}
                {holdings.some(h => h.ticker === 'ACT_BND') && (
                  <button 
                    onClick={() => handleSendChat("Explain active bond mutual fund fee drag swap")}
                    className="feed-chip caution"
                  >
                    Optimize Bond Fees
                  </button>
                )}
                {tasks.some(t => t.subject.includes("KYC") && t.status === 'Overdue') && (
                  <button 
                    onClick={() => handleSendChat("Check Overdue KYC Review")}
                    className="feed-chip caution"
                  >
                    KYC Due Alert
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Chat Messages scroll area */}
          <div className="chat-history">
            {chatMessages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`chat-msg ${msg.sender === 'user' ? 'user' : 'copilot'}`}
              >
                <div className="chat-bubble">
                  {msg.sender === 'copilot' ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                  ) : (
                    msg.text
                  )}

                  {/* Embedded action button for draft copies */}
                  {msg.complianceDoc && (
                    <div className="chat-actions">
                      <button
                        onClick={() => handleCopyText(msg.complianceDoc)}
                        className="btn-chat-action primary"
                      >
                        {copiedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedText ? 'Copied' : 'Copy Memo'}
                      </button>
                      <button
                        onClick={() => handleCreateGmailDraft('robert.chen@email.com', 'Wealth Rebalancing & Cash Allocation Proposal', `Hi Robert,\n\nFollowing our review, here is our suitability memo rationale.\n\n${msg.complianceDoc}`)}
                        className="btn-chat-action secondary"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Create Gmail Draft
                      </button>
                    </div>
                  )}

                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="chat-actions" style={{ marginTop: '8px' }}>
                      {msg.suggestedActions.map((action, actionIdx) => {
                        const isString = typeof action === 'string';
                        const label = isString ? action : action.label;
                        const description = isString ? action : action.description;
                        const actionType = isString ? null : action.actionType;
                        return (
                          <button
                            key={actionIdx}
                            onClick={() => {
                              if (isString) {
                                handleSendChat(action);
                              } else if (actionType === 'reallocate_cash' || actionType === 'swap_fees') {
                                handleExecuteAction(actionType);
                              } else if (actionType === 'draft_email' && msg.emailDraft) {
                                handleCreateGmailDraft(msg.emailDraft.to, msg.emailDraft.subject, msg.emailDraft.body);
                              } else if (actionType === 'schedule_meeting') {
                                handleSendChat(`Schedule a meeting: ${description}`);
                              } else if (actionType === 'complete_task') {
                                handleSendChat(`Mark task complete: ${description}`);
                              } else {
                                handleSendChat(label || description);
                              }
                            }}
                            className="btn-chat-action secondary"
                            title={description}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {msg.emailDraft && !msg.suggestedActions && (
                    <div className="chat-actions" style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => handleCreateGmailDraft(msg.emailDraft.to, msg.emailDraft.subject, msg.emailDraft.body)}
                        className="btn-chat-action secondary"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Create Gmail Draft
                      </button>
                    </div>
                  )}
                </div>
                <span className="chat-time">{msg.timestamp}</span>
              </div>
            ))}
            {loading && (
              <div className="chat-msg copilot animate-pulse">
                <div className="chat-bubble">Thinking... Grounding AI calculations...</div>
              </div>
            )}
          </div>

          {/* Quick chip options */}
          <div className="copilot-input-area" style={{ borderTop: 'none', paddingBottom: '4px' }}>
            <div className="chip-bar">
              {activeClient === 'Robert & Patricia Chen' ? (
                <>
                  <button 
                    onClick={() => handleExecuteAction('reallocate_cash')}
                    className="input-chip"
                  >
                    Execute Cash Rebalance
                  </button>
                  <button 
                    onClick={() => handleExecuteAction('swap_fees')}
                    className="input-chip"
                  >
                    Swap Active Bond Fees
                  </button>
                  <button 
                    onClick={() => handleSendChat("Explain duration mapping")}
                    className="input-chip"
                  >
                    Explain Duration
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handleSendChat("Summarize AGV Book holdings")}
                  className="input-chip"
                >
                  Summarize Book
                </button>
              )}
            </div>
          </div>

          {/* Chat text input */}
          <div className="copilot-input-area">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
              className="input-form"
            >
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask Copilot: e.g. 'rebalance targets' or 'explain duration'..."
                className="chat-text-input"
              />
              <button
                type="submit"
                className={`btn-send ${sendHighlight ? 'btn-send-highlight' : ''}`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </aside>

      </div>
    </div>
  );
}
