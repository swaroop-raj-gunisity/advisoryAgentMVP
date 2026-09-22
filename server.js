import 'dotenv/config';
import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { listFiles, getFileContent, uploadFile, deleteFile, testConnection } from './server/google-drive.js';
import { processAlphaVantageToDigest } from './server/research-digest-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// n8n AI Agent Configuration
const N8N_CHAT_WEBHOOK_URL = process.env.N8N_CHAT_WEBHOOK_URL || 'http://localhost:5678/webhook/adc88d97-9fee-439a-ae55-569d2ceb7c45';
const N8N_RESEARCH_DIGEST_PROCESS_URL = process.env.N8N_RESEARCH_DIGEST_PROCESS_URL || 'http://localhost:5678/webhook/1b98a77b-fb76-4603-b879-01ee748fb5f3';
const N8N_TIMEOUT_MS = parseInt(process.env.N8N_TIMEOUT_MS || '15000', 10);
const N8N_DIGEST_TIMEOUT_MS = parseInt(process.env.N8N_DIGEST_TIMEOUT_MS || '120000', 10);

// Alpha Vantage Configuration
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'RVSXZXCE3Q5YS6MQ';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const ALPHA_VANTAGE_ARTICLE_LIMIT = process.env.ALPHA_VANTAGE_ARTICLE_LIMIT || '10';

app.use(cors());
app.use(express.json());

// Multer config for PDF uploads (max 25MB, PDF only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Google Drive folder ID from env
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// SQLite Database Connection
const dbPath = path.join(__dirname, 'sourceData', 'advisor_portal.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("Connected to advisor_portal.db SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS research_digest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_json TEXT NOT NULL,
      source_article_count INTEGER,
      market_sentiment TEXT,
      generated_at TEXT NOT NULL,
      alpha_vantage_fetched_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }
});

// Helper for DB Queries
const dbQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// Get Advisor details
app.get('/api/advisor', async (req, res) => {
  try {
    const advisor = await dbGet("SELECT * FROM advisor LIMIT 1");
    res.json(advisor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Account with Holdings
app.get('/api/account', async (req, res) => {
  try {
    const account = await dbGet("SELECT * FROM account LIMIT 1");
    if (!account) return res.status(404).json({ error: "No account found" });
    
    const holdings = await dbQuery("SELECT * FROM holding WHERE account_id = ?", [account.account_id]);
    res.json({ account, holdings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await dbQuery("SELECT * FROM task ORDER BY activity_date DESC");
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Asset Allocation targets
app.get('/api/targets', async (req, res) => {
  try {
    const targets = await dbQuery("SELECT * FROM asset_allocation_target");
    res.json(targets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete Task
app.post('/api/tasks/complete', async (req, res) => {
  const { task_id } = req.body;
  try {
    await dbRun("UPDATE task SET status = 'Completed', flag_status = 'GREEN_FLAG' WHERE task_id = ?", [task_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Task
app.post('/api/tasks/add', async (req, res) => {
  const { subject, description, priority, task_type, flag_status } = req.body;
  const taskId = "TSK_" + Date.now();
  const dateStr = new Date().toISOString().split('T')[0];
  try {
    await dbRun(
      "INSERT INTO task VALUES (?, 'ACC_001', ?, ?, 'In Progress', ?, ?, ?, ?)",
      [taskId, subject, dateStr, description, priority, task_type, flag_status]
    );
    const newTask = await dbGet("SELECT * FROM task WHERE task_id = ?", [taskId]);
    res.json(newTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DUAL-PATH PDF INGESTION SIMULATOR
// ----------------------------------------------------
app.post('/api/upload-plan', async (req, res) => {
  const { fileName, isVault } = req.body;
  
  // Simulate plan parsing
  const planSummary = {
    retirementReadiness: 82,
    targetDate: "2033-03-14",
    goals: [
      "Retire at age 65 (Both Robert & Patricia) with $12,500/month after-tax spend",
      "Fund Emily's college at UC Berkeley ($60,000/yr for 4 years starting Fall 2027)",
      "Maintain a 5% Cash reserve limit ($90,000)"
    ],
    gaps: [
      "Significant cash drag: $900,000 in checking earning 0.0%",
      "Equity underweight by -30.0% ($540,000 below target)",
      "KYC Document Review is overdue by 45 days"
    ]
  };

  if (isVault) {
    // Persistent Vault Upload: update DB allocations
    try {
      // Simulate database update for allocations to match target setup
      await dbRun("UPDATE account SET next_review_date = ? WHERE account_id = 'ACC_001'", [
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days out
      ]);
      res.json({
        success: true,
        message: `Plan '${fileName}' uploaded persistently to Vault. Database updated.`,
        summary: planSummary,
        persisted: true
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    // Session Temporary upload: do not write to DB
    res.json({
      success: true,
      message: `Plan '${fileName}' parsed temporarily for chat context. Not written to database.`,
      summary: planSummary,
      persisted: false
    });
  }
});

// ----------------------------------------------------
// CORE PORTFOLIO REBALANCING & DRAFT COMPILER
// ----------------------------------------------------
app.post('/api/rebalance', async (req, res) => {
  const { actionType } = req.body; // e.g. "rebalance_all", "reallocate_cash", "swap_fees"
  
  try {
    const account = await dbGet("SELECT * FROM account LIMIT 1");
    const advisor = await dbGet("SELECT * FROM advisor LIMIT 1");
    
    // Read Memo templates from filesystem
    const suitabilityPath = path.join(__dirname, 'templates', 'suitability_memo_template.txt');
    const rationalePath = path.join(__dirname, 'templates', 'trade_rationale_memo_template.txt');
    const docPath = path.join(__dirname, 'templates', 'compliance_document_template.txt');
    
    let suitabilityTemplate = fs.readFileSync(suitabilityPath, 'utf8');
    let rationaleTemplate = fs.readFileSync(rationalePath, 'utf8');
    let docTemplate = fs.readFileSync(docPath, 'utf8');
    
    let rebalanceMsg = "";
    let draftMemoText = "";
    
    if (actionType === "reallocate_cash") {
      // Reallocate $810,000 cash to target
      // Target Cash target is 5%, we have 50%. Drift is 45%.
      // Let's populate the placeholders
      const placeHolders = {
        client_risk_tolerance: account.risk_tolerance,
        investment_objective: account.investment_objective,
        time_horizon: "7", // Target retirement in 7 years (2033)
        rebalance_trigger_event: "portfolio cash drag reallocation",
        drift_percentage: "45.0",
        tax_loss_harvested_amount: "0.00"
      };
      
      // Update local database to simulate rebalancing execution
      // Update actuals to targets: cash to 5%, equity to 65%, bonds to 30%
      await dbRun("UPDATE asset_allocation_target SET actual_pct = 65.0, drift_pct = 0.0, flag_status = 'GREEN_FLAG' WHERE asset_class = 'Equity'");
      await dbRun("UPDATE asset_allocation_target SET actual_pct = 30.0, drift_pct = 0.0, flag_status = 'GREEN_FLAG' WHERE asset_class = 'Fixed Income'");
      await dbRun("UPDATE asset_allocation_target SET actual_pct = 5.0, drift_pct = 0.0, flag_status = 'GREEN_FLAG' WHERE asset_class = 'Cash'");
      
      // Update actual holdings positions (increase IVV, AGG, reduce CASH)
      await dbRun("UPDATE holding SET market_value = 1170000.00, shares = 2110 WHERE ticker = 'IVV'");
      await dbRun("UPDATE holding SET market_value = 540000.00, shares = 5520 WHERE ticker = 'AGG'");
      await dbRun("UPDATE holding SET market_value = 90000.00, shares = 1 WHERE ticker = 'CASH'");
      
      // Recalculate AUM
      await dbRun("UPDATE account SET total_aum = 1800000.00 WHERE account_id = 'ACC_001'");
      
      // Swap out the placeholders in suitability template
      let suitMemo = suitabilityTemplate
        .replace("{client_risk_tolerance}", placeHolders.client_risk_tolerance)
        .replace("{investment_objective}", placeHolders.investment_objective)
        .replace("{time_horizon}", placeHolders.time_horizon);
        
      let tradMemo = rationaleTemplate
        .replace("{rebalance_trigger_event}", placeHolders.rebalance_trigger_event)
        .replace("{drift_percentage}", placeHolders.drift_percentage)
        .replace("{tax_loss_harvested_amount}", placeHolders.tax_loss_harvested_amount);
        
      // Assembles Document Template
      draftMemoText = docTemplate
        .replace("{client_name}", "Robert & Patricia Chen")
        .replace("{client_household}", account.household_name)
        .replace("{primary_advisor}", `${advisor.first_name} ${advisor.last_name}`)
        .replace("{account_numbers}", "****-7821")
        .replace("{service_model_tier}", account.service_tier)
        .replace("{total_aum}", "$1,800,000.00")
        .replace("[INSERT_MEMO: MEMO_SUIT_001]", suitMemo)
        .replace("[INSERT_MEMO: MEMO_TRAD_001]", tradMemo);
        
      // Add a task indicating rebalance was executed and compliance logged
      await dbRun(
        "INSERT INTO task VALUES (?, 'ACC_001', ?, ?, 'Completed', ?, 'Medium', 'Compliance', 'GREEN_FLAG')",
        ["TSK_" + Date.now(), "Log Cash Drag Suitability Memo (COMP_DOC_001)", new Date().toISOString().split('T')[0], "Completed rebalance cash drag re-allocation. Logged COMP_DOC_001."]
      );
      
      rebalanceMsg = "Successfully reallocated cash drag. Portfolio aligned to Moderate 65/30/5 model. Synced suitability memo to account files.";
    } else if (actionType === "swap_fees") {
      // Swap Active Bond fund ACT_BND (0.85%) for AGG (0.03%)
      const placeHolders = {
        client_risk_tolerance: account.risk_tolerance,
        investment_objective: account.investment_objective,
        time_horizon: "7",
        rebalance_trigger_event: "active-to-passive exchange for fee drag optimization",
        drift_percentage: "5.0",
        tax_loss_harvested_amount: "0.00"
      };
      
      // Update database: remove ACT_BND, add market value to AGG
      await dbRun("DELETE FROM holding WHERE ticker = 'ACT_BND'");
      await dbRun("UPDATE holding SET market_value = 190000.00, shares = 1940 WHERE ticker = 'AGG'");
      
      let suitMemo = suitabilityTemplate
        .replace("{client_risk_tolerance}", placeHolders.client_risk_tolerance)
        .replace("{investment_objective}", placeHolders.investment_objective)
        .replace("{time_horizon}", placeHolders.time_horizon);
        
      let tradMemo = rationaleTemplate
        .replace("{rebalance_trigger_event}", placeHolders.rebalance_trigger_event)
        .replace("{drift_percentage}", placeHolders.drift_percentage)
        .replace("{tax_loss_harvested_amount}", placeHolders.tax_loss_harvested_amount);
        
      draftMemoText = docTemplate
        .replace("{client_name}", "Robert & Patricia Chen")
        .replace("{client_household}", account.household_name)
        .replace("{primary_advisor}", `${advisor.first_name} ${advisor.last_name}`)
        .replace("{account_numbers}", "****-7821")
        .replace("{service_model_tier}", account.service_tier)
        .replace("{total_aum}", "$1,800,000.00")
        .replace("[INSERT_MEMO: MEMO_SUIT_001]", suitMemo)
        .replace("[INSERT_MEMO: MEMO_TRAD_001]", tradMemo);
        
      await dbRun(
        "INSERT INTO task VALUES (?, 'ACC_001', ?, ?, 'Completed', ?, 'Medium', 'Compliance', 'GREEN_FLAG')",
        ["TSK_" + Date.now(), "Log Expense Ratio Swap suitability Memo", new Date().toISOString().split('T')[0], "Completed swap of active yield bond for AGG. Logged compliance memo."]
      );
      
      rebalanceMsg = "Successfully swapped active mutual fund ACT_BND (0.85% expense ratio) for passive AGG (0.03% expense ratio). Savings of $738/yr logged.";
    }
    
    res.json({
      success: true,
      message: rebalanceMsg,
      complianceDocument: draftMemoText
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// GMAIL & CALENDAR MCP SIMULATORS (For lightweight frontend)
// ----------------------------------------------------

// Retrieve emails
app.get('/api/gmail/messages', (req, res) => {
  const emails = [
    {
      id: "MSG_001",
      sender: "Robert Chen <robert.chen@email.com>",
      subject: "Questions on Roth Conversion limits",
      date: "2026-08-08T09:30:00Z",
      snippet: "Hi Sarah, can you run the numbers on what happens if we convert $100K instead of $75K? Also, Patricia wants to confirm the tax bracket threshold...",
      body: "Hi Sarah,\n\nHope you're doing well. As we prep for our review meeting, I wanted to ask if we can look at some larger Roth conversion scenarios. Can you run the numbers on what happens if we convert $100K instead of $75K? Also, Patricia wants to confirm the tax bracket threshold so we don't accidentally push ourselves into the highest tier.\n\nBest,\nRobert"
    },
    {
      id: "MSG_002",
      sender: "Emily Chen <emily.chen@berkeley.edu>",
      subject: "529 verification documents",
      date: "2026-08-05T14:15:00Z",
      snippet: "Hey Sarah! Here are my enrollment confirmations for UC Berkeley. Let me know if you need anything else to release the 529 funds for Fall tuition...",
      body: "Hey Sarah!\n\nHere are my enrollment confirmations and tuition invoice for UC Berkeley. Let me know if you need anything else to release the 529 funds for Fall tuition. Exciting to get started!\n\nThanks,\nEmily"
    }
  ];
  res.json(emails);
});

// Retrieve calendar
app.get('/api/calendar/events', (req, res) => {
  const events = [
    {
      id: "CAL_EVENT_1",
      summary: "Staff Morning Alignment Meeting",
      start: "2026-08-10T09:00:00+05:30",
      end: "2026-08-10T09:45:00+05:30",
      location: "Office Room A"
    },
    {
      id: "CAL_EVENT_2",
      summary: "Annual Review - Chen Household",
      start: "2026-08-10T10:00:00+05:30",
      end: "2026-08-10T11:30:00+05:30",
      location: "Conference Room B / Zoom",
      attendees: ["Sarah Mitchell", "Robert Chen", "Patricia Chen"]
    },
    {
      id: "CAL_EVENT_3",
      summary: "Paraplanning & Operations Sync",
      start: "2026-08-10T14:00:00+05:30",
      end: "2026-08-10T14:30:00+05:30",
      location: "Sarah's Office",
      attendees: ["Sarah Mitchell", "Marcus Vance"]
    }
  ];
  res.json(events);
});

// Create Calendar Review Booking
app.post('/api/calendar/create', (req, res) => {
  const { summary, start_time, attendees } = req.body;
  res.json({
    success: true,
    message: `Event '${summary}' successfully created in Google Calendar for ${start_time}.`,
    event: {
      id: "CAL_EVENT_" + Date.now(),
      summary,
      start: start_time,
      attendees
    }
  });
});

// Draft email
app.post('/api/gmail/draft', (req, res) => {
  const { to, subject, body } = req.body;
  res.json({
    success: true,
    message: `Gmail draft successfully created in G Suite Drafts folder for '${to}'.`,
    draft: {
      id: "DRAFT_" + Date.now(),
      to,
      subject,
      body
    }
  });
});

// ----------------------------------------------------
// DOCUMENT VAULT — GOOGLE DRIVE VIA MCP
// ----------------------------------------------------

// Test Google Drive connection
app.get('/api/vault/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (err) {
    console.error('[Vault Test Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload PDF to Google Drive vault
app.post('/api/vault/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const file = await uploadFile(req.file.buffer, req.file.originalname);
    res.json({ success: true, file, folderId: GOOGLE_DRIVE_FOLDER_ID });
  } catch (err) {
    console.error('[Vault Upload Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List vault files — no filters, returns all files in the configured folder
app.get('/api/vault/files', async (req, res) => {
  try {
    const files = await listFiles();
    res.json({ success: true, files, folderId: GOOGLE_DRIVE_FOLDER_ID });
  } catch (err) {
    console.error('[Vault List Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get file content for PDF viewer (streams as PDF)
app.get('/api/vault/files/:fileId/view', async (req, res) => {
  try {
    const result = await getFileContent(req.params.fileId);
    const pdfBuffer = Buffer.from(result.content, 'base64');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': `inline; filename="${result.file.name}"`,
      'Cache-Control': 'private, max-age=300'
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Vault View Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a vault file
app.delete('/api/vault/files/:fileId', async (req, res) => {
  try {
    const deleted = await deleteFile(req.params.fileId);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[Vault Delete Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send selected vault files to n8n for summarization
app.post('/api/vault/summarize', async (req, res) => {
  const { selectedFiles, advisorId, sessionId, conversationHistory } = req.body;

  if (!selectedFiles || selectedFiles.length === 0) {
    return res.status(400).json({ error: 'No files selected for summarization' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS * 2);

    const n8nPayload = {
      message: `Please summarize the following documents: ${selectedFiles.map(f => `Document Name : ${f.name} - File ID : ${f.id}`).join(', ')}`,
      sessionId: sessionId || `vault_${Date.now()}`,
      timestamp: new Date().toISOString(),
      advisorId: advisorId || 'EMP_9021',
      accountId: 'ACC_001',
      activeTab: 'vault',
      vaultContext: {
        folderId: GOOGLE_DRIVE_FOLDER_ID,
        selectedFiles: selectedFiles.map(f => ({ id: f.id, name: f.name })),
        action: 'summarize'
      },
      conversationHistory: conversationHistory || []
    };

    const n8nRes = await fetch(N8N_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!n8nRes.ok) {
      throw new Error(`n8n returned HTTP ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json();
    res.json({
      response: n8nData.response || 'Document summarization request sent.',
      metadata: n8nData.metadata || null
    });
  } catch (err) {
    console.error('[Vault Summarize Error]', err.message);
    res.json({
      response: `I received your summarization request for ${selectedFiles.length} document(s): ${selectedFiles.map(f => f.name).join(', ')}. The AI agent is currently offline — please try again later.`,
      metadata: { offline: true }
    });
  }
});

// ----------------------------------------------------
// CHAT INTERACTION & GROUNDED CALCULATION AGENT
// ----------------------------------------------------

function getFallbackResponse(message, activeContext) {
  const msgLower = message.toLowerCase();
  let aiResponse = "";
  let uiAction = null;

  if (msgLower.includes("cash") && msgLower.includes("drag")) {
    aiResponse = "Robert Chen currently has **$900,000 in CASH** (representing 50.0% of the household allocation vs. a 5.0% target). This creates a drift of **+45.0%**.\n\n### Calculation:\n*   **Target cash (5%):** $90,000\n*   **Actual cash (50%):** $900,000\n*   **Excess Idle cash:** $810,000\n\n### yield Opportunity:\n*   If we swap $810,000 to **SGOV** (Short-Term Treasuries yielding **5.15%**), the client reclaims **$41,715 in annual yield**.\n*   If we rebalance into the core moderate target portfolio (target yield ~4.05%), it will generate **$32,805 in annual interest**.\n\n*Click `[Resolve Cash Drag]` in the quick actions to reallocate Cash to targets.*";
    uiAction = { type: "NAVIGATE_TO", payload: { tab: "allocation", highlight: "cash" } };
  }
  else if (msgLower.includes("roth") || msgLower.includes("conversion")) {
    aiResponse = "Robert and Patricia discussed Roth Conversion ladders. Here are the 3 calculated scenarios based on their plan:\n\n*   **Scenario A ($50K/yr):** Pushes retirement funded ratio to **85%**. Low tax bracket risk.\n*   **Scenario B ($75K/yr - Baseline):** Pushes funded ratio to **89%**. Tax bracket stays in the 24% ordinary tier.\n*   **Scenario C ($100K/yr - Proposed):** Pushes funded ratio to **91%**, but carries a risk of pushing their joint income into the 32% bracket in active years, reducing tax leverage.\n\n### Recommendation:\nKeep the baseline at $75,000/yr. We can review tax harvesting on AGG/IEMG to offset conversion gains.";
    uiAction = { type: "NAVIGATE_TO", payload: { tab: "gaps", highlight: "roth" } };
  }
  else if (msgLower.includes("explain duration")) {
    aiResponse = "### Compliance Term: Duration\n**Duration** measures a bond fund's price sensitivity to interest rate shifts. It is expressed in years.\n\n*   **AGG (iShares Core U.S. Bond):** Duration is **6.2 years**.\n*   **SGOV (iShares 0-3 Month Treasury):** Duration is **0.1 years**.\n\n**Plain Language Explanation:** If interest rates rise by 1.0%, AGG's price is expected to decline by approximately 6.2%. SGOV, having a shorter duration, is virtually immune to interest rate fluctuations, losing only 0.1% for a 1.0% interest rate spike. For moderate profile clients like the Chens, combining short SGOV cash alternatives and intermediate AGG yields optimal risk balancing.";
  }
  else if (msgLower.includes("kyc") || msgLower.includes("compliance")) {
    aiResponse = "There is **1 Overdue Compliance Flag**:\n\n*   **Overdue KYC Document Review:** Overdue by **45 days** (Deadline was 2026-06-15).\n\nTo resolve this compliance flag, I have drafted a template email to Robert Chen requesting KYC document updates. Click `[Draft KYC Request Email]` to sync this draft directly into your Workspace Gmail inbox.";
    uiAction = { type: "NAVIGATE_TO", payload: { tab: "notes", highlight: "kyc" } };
  }
  else if (msgLower.includes("active bond") || msgLower.includes("fee drag") || msgLower.includes("act_bnd")) {
    aiResponse = "The portfolio holds **$90,000** in `ACT_BND` (Active Yield Opportunity Bond Mutual Fund) carrying an expense ratio of **0.85%**.\n\n### Fee Optimization Math:\n*   **ACT_BND Annual Fee:** $90,000 * 0.85% = **$765**\n*   **AGG Annual Fee (Passive Alternative):** $90,000 * 0.03% = **$27**\n*   **Net Advisor Reclaim:** Swapping `ACT_BND` for `AGG` reclaims **$738 per year** in asset fee drag directly back to client returns.\n\n*Click `[Optimize Bond Fees]` in the sidebar to compile the compliance memos and execute the swap.*";
    uiAction = { type: "NAVIGATE_TO", payload: { tab: "allocation", highlight: "ACT_BND" } };
  }
  else if (msgLower.includes("rebalance")) {
    aiResponse = "### Rebalance Summary: Chen Portfolio\nDue to heavy cash drag, the portfolio has drifted from its Moderate target:\n\n*   **Equity:** 35% actual vs 65% target (**-30% Underweight**)\n*   **Fixed Income:** 15% actual vs 30% target (**-15% Underweight**)\n*   **Cash:** 50% actual vs 5% target (**+45% Overweight**)\n\n### Suggested trades:\n1. Sell $810,000 cash.\n2. Buy $540,000 IVV (S&P 500 ETF).\n3. Buy $270,000 AGG (Core Bond ETF).\n4. Compile the Suitability Memo and Trade Rationale compliance documents.\n\n*Click `[Execute Cash Rebalance]` below to reallocate cash and compile memos.*";
  }
  else {
    aiResponse = `I have loaded context for the **${activeContext || 'Chen Household'}**. You can ask me to run cash drag reallocations, optimize fund fees, check compliance tasks, list emails, or draft follow-up review correspondence.`;
  }

  return { response: aiResponse, action: uiAction };
}

app.post('/api/chat', async (req, res) => {
  const { message, activeContext, sessionId, timestamp, advisorId, accountId, activeTab, context, conversationHistory, vaultContext } = req.body;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);

    const n8nPayload = {
      message,
      sessionId: sessionId || `fallback_${Date.now()}`,
      timestamp: timestamp || new Date().toISOString(),
      advisorId: advisorId || 'ADV_001',
      accountId: accountId || 'ACC_001',
      activeTab: activeTab || 'allocation',
      context: context || {},
      conversationHistory: conversationHistory || [],
      vaultContext: vaultContext || null
    };

    const n8nRes = await fetch(N8N_CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!n8nRes.ok) {
      throw new Error(`n8n returned HTTP ${n8nRes.status}`);
    }

    const n8nRaw = await n8nRes.json();
    // n8n returns either an array with output wrapper or a flat object
    const n8nData = Array.isArray(n8nRaw)
      ? (n8nRaw[0]?.output || n8nRaw[0] || {})
      : (n8nRaw.output || n8nRaw);

    res.json({
      response: n8nData.response || "I received your message but couldn't generate a detailed response.",
      action: n8nData.action || null,
      suggestedActions: n8nData.suggestedActions || null,
      emailDraft: n8nData.emailDraft || null,
      complianceDocument: n8nData.complianceDocument || null,
      metadata: n8nData.metadata || null
    });

  } catch (err) {
    console.error(`[n8n fallback] ${err.message} at ${new Date().toISOString()}`);
    const fallback = getFallbackResponse(message, activeContext);
    fallback.response += '\n\n---\n_⚠️ AI assistant is in offline mode — limited capabilities available._';
    res.json(fallback);
  }
});

// ----------------------------------------------------
// RESEARCH DIGEST — STRUCTURED WIDGET DATA
// ----------------------------------------------------

// GET: Return cached digest from SQLite (no external API call)
app.get('/api/research-digest', async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM research_digest ORDER BY created_at DESC LIMIT 1");
    if (!row) {
      return res.json({
        research_digest: null,
        holdings_news_ticker: [],
        market_narratives: [],
        generated_at: null,
        stale: true
      });
    }

    const parsed = JSON.parse(row.digest_json);
    res.json({
      ...parsed,
      generated_at: row.generated_at,
      stale: false
    });
  } catch (err) {
    console.error(`[Research Digest GET] ${err.message}`);
    res.json({ research_digest: null, holdings_news_ticker: [], market_narratives: [], generated_at: null, stale: true });
  }
});

// POST: Manual refresh — fetch from Alpha Vantage, process via N8N (or fallback), persist
app.post('/api/research-digest/refresh', async (req, res) => {
  try {
    // Step 1: Call Alpha Vantage NEWS_SENTIMENT API
    const avUrl = `${ALPHA_VANTAGE_BASE_URL}?function=NEWS_SENTIMENT&topics=financial_markets&sort=LATEST&limit=${ALPHA_VANTAGE_ARTICLE_LIMIT}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const avRes = await fetch(avUrl);
    if (!avRes.ok) {
      throw new Error(`Alpha Vantage returned HTTP ${avRes.status}`);
    }
    const avData = await avRes.json();

    if (avData.Note || avData.Information) {
      return res.status(429).json({
        error: 'Alpha Vantage API rate limit reached. Please try again later.',
        message: avData.Note || avData.Information
      });
    }

    const feed = avData.feed;
    if (!feed || feed.length === 0) {
      return res.status(400).json({ error: 'No articles returned from Alpha Vantage' });
    }

    const fetchedAt = new Date().toISOString();
    let digestResult;

    // Step 2: Try N8N processing (longer timeout for LLM processing)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), N8N_DIGEST_TIMEOUT_MS);

      const n8nPayload = {
        sessionId: `digest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        feed_text: JSON.stringify(feed),
        feed_article_count: feed.length,
        holdings_context: [],
        request_type: 'process_digest'
      };

      const n8nRes = await fetch(N8N_RESEARCH_DIGEST_PROCESS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!n8nRes.ok) {
        throw new Error(`N8N returned HTTP ${n8nRes.status}`);
      }

      const n8nRaw = await n8nRes.json();
      digestResult = Array.isArray(n8nRaw) ? (n8nRaw[0]?.output || n8nRaw[0] || n8nRaw) : (n8nRaw.output || n8nRaw);

      if (!digestResult.research_digest || !digestResult.holdings_news_ticker) {
        throw new Error('N8N response missing required fields');
      }

      console.log(`[Research Digest] Processed via N8N — ${feed.length} articles`);
    } catch (n8nErr) {
      // Step 3: Fallback to local processor
      console.log(`[Research Digest] N8N unavailable (${n8nErr.message}), using local fallback processor`);
      digestResult = processAlphaVantageToDigest(feed);
    }

    // Step 4: Persist to SQLite
    const generatedAt = new Date().toISOString();
    const digestJson = JSON.stringify(digestResult);
    const sentiment = digestResult.research_digest?.market_sentiment || 'Neutral';
    const articleCount = feed.length;

    await dbRun(
      "INSERT INTO research_digest (digest_json, source_article_count, market_sentiment, generated_at, alpha_vantage_fetched_at) VALUES (?, ?, ?, ?, ?)",
      [digestJson, articleCount, sentiment, generatedAt, fetchedAt]
    );

    // Step 5: Return to frontend
    res.json({
      ...digestResult,
      generated_at: generatedAt,
      stale: false
    });

  } catch (err) {
    console.error(`[Research Digest Refresh] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend assets in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`Advisor MVP Backend Dev Server listening at http://localhost:${PORT}`);
});
