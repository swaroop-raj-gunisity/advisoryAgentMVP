# Implementation Plan: n8n AI Agent Integration

## Context & Goal

Replace the hardcoded keyword-matching AI assistant (`server.js` → `POST /api/chat`) with a real n8n-powered AI agent. n8n handles all intelligence: LLM inference, context-aware memory, dynamic database queries, and structured response generation.

Additionally, introduce a **Research Digest Agent** as a second n8n workflow that monitors fund/market changes and surfaces book-relevant alerts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React - src/App.jsx)                                         │
│                                                                         │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐        │
│  │ Column 2: Dashboard  │   │ Column 3: Copilot Chat Sidebar   │        │
│  │                     │   │                                  │        │
│  │ • Research Digest   │   │  User message → POST /api/chat   │        │
│  │   Card (alerts)     │   │  Response → render + UI actions  │        │
│  │ • Portfolio/Holdings│   │  Suggested Actions → buttons     │        │
│  │ • Plan Gaps         │   │                                  │        │
│  └────────┬────────────┘   └──────────────┬───────────────────┘        │
│           │                                │                            │
│     GET /api/research-digest         POST /api/chat                     │
└───────────┼────────────────────────────────┼────────────────────────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  EXPRESS SERVER (server.js)                                              │
│                                                                         │
│  POST /api/chat ──────────────────→ n8n Chat Agent Webhook              │
│    • Sends: message, IDs, context summary, conversation history         │
│    • Receives: AI response, UI actions, suggested actions               │
│    • Fallback: keyword-matching if n8n unreachable                       │
│                                                                         │
│  GET /api/research-digest ────────→ n8n Research Digest Webhook         │
│    • Sends: advisor_id, book holdings summary                           │
│    • Receives: alerts array with priority, impact, suggested action     │
│                                                                         │
│  Separate Read/Write APIs (unchanged):                                  │
│    GET  /api/advisor, /api/account, /api/tasks, /api/targets            │
│    GET  /api/gmail/messages, /api/calendar/events                       │
│    POST /api/rebalance, /api/tasks/complete, /api/tasks/add             │
│    POST /api/gmail/draft, /api/calendar/create, /api/upload-plan        │
└─────────────────────────────────────────────────────────────────────────┘
            │                                │
            ▼                                ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────┐
│  n8n: RESEARCH DIGEST AGENT  │  │  n8n: CHAT COPILOT AGENT             │
│                              │  │                                      │
│  Webhook (GET/POST)          │  │  Webhook (POST)                      │
│  → Query advisor_portal.db   │  │  → Memory recall (sessionId)         │
│  → Query market data / ETF   │  │  → Query advisor_portal.db           │
│  → Compare holdings vs       │  │  → Build LLM prompt with context     │
│    fund changes              │  │  → LLM inference (Gemini/Claude)     │
│  → LLM: prioritize &        │  │  → Structured JSON output            │
│    summarize alerts          │  │  → Memory store                      │
│  → Return structured alerts  │  │  → Respond to webhook                │
└──────────────────────────────┘  └──────────────────────────────────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  advisor_portal.db (SQLite)                                             │
│  Tables: advisor, contact, account, holding, task, life_event,          │
│          etf, asset_allocation_target                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Chat Copilot Agent Integration

### Changes to `server.js`

1. Add environment variables at top:
   ```javascript
   const N8N_CHAT_WEBHOOK_URL = process.env.N8N_CHAT_WEBHOOK_URL || 'http://localhost:5678/webhook/05773270-b5e3-40aa-a278-b6732f0ece11';
   const N8N_RESEARCH_DIGEST_URL = process.env.N8N_RESEARCH_DIGEST_URL || 'http://localhost:5678/webhook/research-digest-placeholder';
   const N8N_TIMEOUT_MS = 15000;
   ```

2. Rewrite `POST /api/chat`:
   - Build lightweight request payload (IDs + summary + message + history)
   - POST to n8n with 15s AbortController timeout
   - Map n8n JSON response to frontend format
   - On failure: call `getFallbackResponse()` (existing keyword logic)

3. Extract existing keyword-matching into `getFallbackResponse(message, activeContext)` function.

4. Add new `GET /api/research-digest` endpoint that proxies to n8n Research Digest webhook.

### Request Payload: Express → n8n Chat Agent

```json
{
  "message": "Show me the cash drag alert and rebalance targets",
  "sessionId": "session_1723296000000",
  "timestamp": "2026-08-10T14:30:00.000Z",
  "advisorId": "ADV_001",
  "accountId": "ACC_001",
  "activeTab": "allocation",
  "context": {
    "advisor_name": "Sarah Mitchell",
    "advisor_role": "Senior Wealth Advisor & Practice Lead",
    "household_name": "Chen Household",
    "total_aum": 1800000.00,
    "investment_objective": "Growth & Income",
    "risk_tolerance": "Moderate",
    "service_tier": "Tier 1 — Wealth",
    "next_review_date": "2026-09-15"
  },
  "conversationHistory": [
    {"role": "assistant", "content": "Hello Sarah, I have loaded context for the Chen Household. I detected 2 Red Flags and 2 Yellow Flags."},
    {"role": "user", "content": "Show me the cash drag alert and rebalance targets"}
  ]
}
```

**Key design:** We send IDs (`advisorId`, `accountId`) so n8n can run dynamic queries against the DB. The `context` object provides a lightweight summary so the LLM has immediate grounding without requiring a DB round-trip for every response.

### Response Payload: n8n → Express → Frontend

```json
{
  "response": "Robert Chen currently has **$900,000 in CASH** representing 50.0% of the portfolio vs. a 5.0% target. This creates a drift of **+45.0%**.\n\n### Calculation:\n- **Target cash (5%):** $90,000\n- **Actual cash (50%):** $900,000\n- **Excess idle cash:** $810,000\n\n### Yield Opportunity:\n- Swapping $810,000 to **SGOV** (5.15% yield) reclaims **$41,715/year**\n- Rebalancing into the moderate target model (~4.05% yield) generates **$32,805/year**",
  "action": {
    "type": "NAVIGATE_TO",
    "payload": { "tab": "allocation", "highlight": "cash" }
  },
  "suggestedActions": [
    {
      "label": "Execute Cash Rebalance",
      "actionType": "reallocate_cash",
      "description": "Reallocate $810,000 excess cash to IVV and AGG per moderate target model"
    },
    {
      "label": "Draft Reallocation Proposal Email",
      "actionType": "draft_email",
      "description": "Send a cash reallocation proposal to Robert Chen"
    }
  ],
  "emailDraft": {
    "to": "robert.chen@email.com",
    "subject": "Wealth Review: Reallocating Idle Cash to Reclaim Yield",
    "body": "Hi Robert,\n\nFollowing our portfolio review, I'd like to discuss reallocating the $810,000 in idle cash..."
  },
  "complianceDocument": null,
  "metadata": {
    "model": "gemini-2.5-pro",
    "tokensUsed": 1250,
    "memoryUpdated": true
  }
}
```

### Response Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `response` | string | **Yes** | Markdown-formatted AI response text displayed in chat bubble |
| `action` | object \| null | No | UI navigation command. Valid tabs: `allocation`, `gaps`, `crm`, `vault`, `overview` |
| `suggestedActions` | array \| null | No | Dynamic action buttons rendered below the AI message |
| `emailDraft` | object \| null | No | Pre-composed email (`to`, `subject`, `body`). Renders "Create Gmail Draft" button |
| `complianceDocument` | string \| null | No | Generated compliance memo text (for copy/export) |
| `metadata` | object \| null | No | Diagnostic info — not rendered to user |

### Valid `actionType` values for `suggestedActions`

| actionType | Maps to Frontend Handler | Backend API Called |
|-----------|--------------------------|-------------------|
| `reallocate_cash` | `handleExecuteAction('reallocate_cash')` | `POST /api/rebalance` |
| `swap_fees` | `handleExecuteAction('swap_fees')` | `POST /api/rebalance` |
| `draft_email` | `handleCreateGmailDraft(emailDraft)` | `POST /api/gmail/draft` |
| `schedule_meeting` | New handler | `POST /api/calendar/create` |
| `complete_task` | Task complete handler | `POST /api/tasks/complete` |

---

## Part 2: Research Digest Agent

### Feature Description

The Research Digest Agent is a **proactive, ambient intelligence** layer. It monitors fund fact sheets, ETF characteristics, market data, and product updates — then cross-references changes against the advisor's book of business to surface relevant alerts.

### How It Works

1. **Frontend calls** `GET /api/research-digest` on page load (Home/Book Overview screen)
2. **Express proxies** the request to the n8n Research Digest webhook
3. **n8n workflow:**
   - Queries `advisor_portal.db` for the advisor's book holdings (all tickers, market values, clients)
   - Queries the `etf` table for current fund characteristics
   - Compares against monitored data sources (fund changes, fee updates, strategy shifts)
   - Uses LLM to prioritize and summarize which changes matter for this advisor's book
   - Returns structured alerts array
4. **Frontend renders** alerts as a "Morning Brief" card on the Home dashboard (Column 2)

### Request Payload: Express → n8n Research Digest

```json
{
  "advisorId": "ADV_001",
  "timestamp": "2026-08-10T08:00:00.000Z",
  "requestType": "daily_digest"
}
```

### Response Payload: n8n Research Digest → Express → Frontend

n8n returns a simple free-text response (markdown-formatted newsfeed). The Express server passes it through as-is; the frontend renders it as a "Morning Brief" card.

```json
{
  "content": "## Morning Brief — August 10, 2026\n\n**SGOV yield holds at 5.15%** — iShares 0-3 Month Treasury Bond ETF remains the top short-term yield option. Chen Household has $810,000 excess cash that could recapture ~$41,715/yr.\n\n**AGG duration shift to 6.2 years** — iShares Core U.S. Aggregate Bond moved to a higher duration posture. Monitor interest rate sensitivity for clients holding AGG. Consider IEF as a shorter-duration alternative if rates rise further.\n\n**Fee drag on ACT_BND: 0.85% vs. passive 0.03%** — Chen Household holds $90,000 in ACT_BND. Switching to AGG saves ~$738/yr in fees.\n\n---\n_Sources: iShares ETF feed, advisor_portal.db holdings, etf table | Last scan: 06:00 AM_"
}
```

### Response Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | **Yes** | Markdown-formatted free-text newsfeed generated by n8n's LLM. Contains prioritized alerts, observations, and recommendations as a single readable digest. |

### Frontend UI: Research Digest Card (Column 2 — Home Dashboard)

Renders on the Book Overview screen as a "Morning Brief" card showing:
- Date and count of alerts
- Priority-sorted alert list (HIGH → MEDIUM → LOW)
- Each alert shows: title, detail snippet, impacted AUM, and a "Review" button that navigates to the relevant client/tab

---

## Part 3: AI Agent Features & Use Cases

### Agent 1: Chat Copilot Agent (MVP — Sprint 1)

**Purpose:** Context-aware conversational assistant that answers advisor questions, performs calculations, and recommends actions.

| Use Case | User Intent | n8n Behavior |
|----------|-------------|-------------|
| Portfolio Analysis | "Show me the cash drag" | Query holdings + targets, compute drift, return analysis with yield calculations |
| Rebalance Recommendation | "What should I rebalance?" | Query all allocations, identify drift violations, suggest specific trades with dollar amounts |
| Term Explanation | "Explain duration for AGG" | Query ETF table for fund details, generate plain-language explanation with real data |
| Tax Loss Harvesting | "Can we harvest losses on AGG?" | Query holding cost_basis vs market_value, compute realized loss, apply tax rates |
| Roth Conversion Scenarios | "What if we convert $100K?" | Query life events + account details, compute funded ratio impact across scenarios |
| Compliance Status | "Any overdue compliance tasks?" | Query tasks WHERE status='Overdue', summarize with deadlines and suggested resolution |
| Email Drafting | "Draft a follow-up email to Robert" | Query contact + recent tasks/notes, compose contextual email using advisor tone |
| Meeting Scheduling | "Schedule a review next Tuesday at 2pm" | Return structured `suggestedAction` with calendar parameters for local API execution |

**n8n Capabilities Required:**
- LLM inference with structured JSON output
- Session-based conversation memory (keyed by `sessionId`)
- SQLite read access to `advisor_portal.db`
- System prompt with financial domain knowledge and calculation rules
- Compliance template awareness (reads from `/templates` directory)

---

### Agent 2: Research Digest Agent (MVP — Sprint 1)

**Purpose:** Proactive ambient monitoring that surfaces book-relevant fund/market changes daily.

| Use Case | Trigger | n8n Behavior |
|----------|---------|-------------|
| Fee Change Detection | Fund expense ratio changes | Compare ETF table current vs. previous; flag if advisor's clients hold the fund |
| Strategy/Duration Shift | Fund duration or strategy changes | Detect shifts in fund characteristics; assess risk impact on held positions |
| Yield Opportunity | New high-yield alternative available | Compare client cash/SGOV holdings to available short-term yield options |
| Expense Optimization | High-cost active fund vs. passive | Identify holdings with expense ratio > 0.50% where passive alternatives exist |
| Compliance Monitoring | KYC/IPS/review overdue | Scan task table for overdue compliance items; surface as digest alerts |

**n8n Capabilities Required:**
- SQLite access to `etf`, `holding`, `task`, `asset_allocation_target` tables
- Market data comparison logic (current vs. baseline thresholds)
- LLM for alert prioritization and natural-language summary generation
- Structured JSON output matching the alert schema

---

### Agent 3: Meeting Prep Brief Generator (Phase 2)

**Purpose:** Auto-generates a structured meeting prep brief when a calendar event is approaching.

| Use Case | Trigger | n8n Behavior |
|----------|---------|-------------|
| Calendar-triggered brief | Upcoming meeting detected (T-1 day or T-30 min) | Query CRM notes, holdings, life events, plan gaps; assemble structured brief |
| Portfolio snapshot | Part of meeting brief | Query holdings, compute YTD return, identify changes since last meeting |
| Talking points | Part of meeting brief | Cross-reference plan gaps, market events, and client life events to suggest discussion topics |
| Open items reminder | Part of meeting brief | Query incomplete tasks for this client; list action items from prior meeting |

**n8n Capabilities Required:**
- Calendar event awareness (triggered by time or on-demand)
- SQLite access to all client tables
- LLM for generating contextual talking points
- Template-based output (Meeting Prep Brief template from `mvp-recommendation.html`)
- Output format: structured JSON that the frontend renders as a brief card

**Request (on-demand trigger from frontend):**
```json
{
  "advisorId": "ADV_001",
  "accountId": "ACC_001",
  "meetingDate": "2026-08-10T10:00:00+05:30",
  "meetingSubject": "Annual Review - Chen Household"
}
```

**Response:**
```json
{
  "brief": {
    "clientName": "Robert & Patricia Chen",
    "meetingDate": "2026-08-10",
    "portfolioSnapshot": {
      "totalAUM": 1800000.00,
      "ytdReturn": 4.2,
      "cashPosition": 900000.00,
      "cashPct": 50.0,
      "lastRebalance": "2025-11-15"
    },
    "recentActivity": [
      "Modeled Roth conversion scenarios ($50k/$75k/$100k) — approved $75k",
      "529 distribution planning initiated for Emily's UC Berkeley enrollment"
    ],
    "lifeEvents": [
      {"event": "Daughter College Enrollment", "date": "2027-08-15", "flag": "upcoming"},
      {"event": "Planned Retirement", "date": "2033-03-14", "flag": "on_track"}
    ],
    "talkingPoints": [
      "Cash drag: $810,000 excess — propose SGOV reallocation for $41,715/yr yield",
      "Roth conversion: Execute approved $75K ladder — discuss timing",
      "ACT_BND fee swap: Save $738/yr by moving to passive AGG"
    ],
    "openItems": [
      {"task": "Overdue KYC Document Review", "status": "Overdue", "daysPast": 56},
      {"task": "IPS Signature", "status": "In Progress", "due": "2026-08-30"}
    ],
    "complianceNote": "Risk Profile: Moderate | Last KYC: Overdue 56 days | IPS Review Due: 2026-08-30"
  }
}
```

---

### Agent 4: Client Q&A Copilot — Real-Time (Phase 2)

**Purpose:** During a live client meeting, the advisor asks "what if" questions and gets instant, numerically accurate answers grounded in the client's actual plan data.

| Use Case | Example Query | n8n Behavior |
|----------|--------------|-------------|
| Retirement delay | "What if Robert delays retirement to 67?" | Compute funded ratio change (82% → 94%) from extra 2 years of compounding + shorter distribution |
| Roth conversion impact | "Show tax impact of $100K conversion" | Compute bracket exposure: 24% → 32% risk; compare net benefit across scenarios |
| Social Security optimization | "What if we claim at 70 vs 67?" | Compute breakeven age, lifetime benefit difference, impact on withdrawal rate |
| Cash reallocation yield | "How much yield if we move $500K to bonds?" | Compute: $500K × AGG yield (4.05%) = $20,250/yr; show vs. current 0% |
| College funding gap | "Can we fund 4 years at UC Berkeley?" | Compute: $60K/yr × 4 = $240K needed; 529 balance = $66,770; gap = $173,230 |

**n8n Capabilities Required:**
- Sub-3 second response time (LLM latency optimization)
- Financial calculation engine (can be LLM-computed with formula verification)
- Access to plan metrics, life events, tax brackets, and holding cost basis
- Confidence scoring (only respond if grounding data is sufficient)
- Formula citation in responses (for advisor verification)

**Key Risk (from mvp-recommendation.html):** A wrong number in a live meeting is worse than no number. Requires robust grounding and confidence scoring before it's demo-safe.

---

### Agent 5: Compliance Documentation Assistant (Phase 2)

**Purpose:** Auto-drafts suitability memos, trade rationale notes, and compliance documents from trade context + client profile + firm templates.

| Use Case | Trigger | n8n Behavior |
|----------|---------|-------------|
| Suitability Memo | After rebalance/trade action | Populate `suitability_memo_template.txt` with client risk profile, objective, time horizon |
| Trade Rationale | After rebalance/trade action | Populate `trade_rationale_memo_template.txt` with trigger event, drift %, tax harvest amount |
| Full Compliance Doc | Advisor clicks "Generate Compliance Document" | Assemble `compliance_document_template.txt` nesting both memos with account metadata |
| KYC Request Draft | Compliance flag detected | Draft personalized email requesting updated KYC documentation |
| IPS Update | Annual review trigger | Pre-populate IPS template with current allocations and proposed changes |

**n8n Capabilities Required:**
- Access to compliance templates (filesystem: `/templates/*.txt`)
- SQLite access for client data, holdings, allocations
- LLM for contextual language generation within template structure
- Template engine (placeholder replacement: `{client_risk_tolerance}`, etc.)
- Human-in-the-loop design: outputs are always editable drafts, never auto-sent

**Key Risk (from mvp-recommendation.html):** Compliance language is zero-tolerance for errors. Requires firm-specific template validation and human approval gate.

---

## Part 4: Changes to Frontend (`src/App.jsx`)

### New State Variables
```javascript
const [sessionId] = useState(() => `session_${Date.now()}`);
const [conversationHistory, setConversationHistory] = useState([]);
const [researchDigest, setResearchDigest] = useState([]);
const [digestLoading, setDigestLoading] = useState(false);
```

### Modified `handleSendChat()`
- Include `sessionId` and `conversationHistory` (last 10 messages) in the POST body
- After response: append both user message and AI response to `conversationHistory`
- Handle new fields: `suggestedActions`, `emailDraft`, `complianceDocument`
- Render dynamic action buttons from `suggestedActions` array

### New `fetchResearchDigest()` function
- Called on page load (Home/Book Overview)
- Calls `GET /api/research-digest`
- Stores alerts in `researchDigest` state
- Renders as a "Morning Brief" card on the dashboard

### New UI Components
- **Suggested Action Buttons:** Rendered below AI chat bubble when `suggestedActions` present
- **Research Digest Card:** Morning Brief panel on Home dashboard with priority-sorted alerts
- **Digest Alert Item:** Individual alert row with title, detail, impacted AUM, and review button

---

## Part 5: n8n Workflow Design — Chat Agent

### Required Nodes

| Node | Purpose |
|------|---------|
| **Webhook (POST)** | Entry point — receives request payload |
| **Window Buffer Memory** | Stores/retrieves conversation history keyed by `sessionId` |
| **SQLite Node** | Queries `advisor_portal.db` using `advisorId` and `accountId` |
| **LLM Chat Node** | Processes message with DB results + context as system prompt |
| **Structured Output Parser** | Ensures LLM returns valid JSON matching response schema |
| **Respond to Webhook** | Returns the final JSON response |

### Recommended System Prompt for Chat Agent

```
You are an AI Copilot for wealth advisors at a private wealth management firm.

ROLE: Analyze portfolio data, identify risks, perform financial calculations, and provide actionable recommendations.

CONTEXT: You will be provided with:
- The advisor's message and conversation history
- A lightweight context summary (client name, AUM, risk profile)
- You have access to query the advisor_portal.db database for detailed data

RESPONSE FORMAT: Return valid JSON:
{
  "response": "Markdown-formatted advisory text with specific numbers and calculations",
  "action": {"type": "NAVIGATE_TO", "payload": {"tab": "<tab>", "highlight": "<element>"}} | null,
  "suggestedActions": [{"label": "...", "actionType": "...", "description": "..."}] | null,
  "emailDraft": {"to": "...", "subject": "...", "body": "..."} | null,
  "complianceDocument": "..." | null,
  "metadata": {"model": "...", "tokensUsed": N, "memoryUpdated": true/false}
}

VALID TABS: allocation, gaps, crm, vault, overview
VALID ACTION TYPES: reallocate_cash, swap_fees, draft_email, schedule_meeting, complete_task

CALCULATION RULES:
- Drift = actual_pct - target_pct
- Fee savings = (old_expense_ratio - new_expense_ratio) × market_value
- Yield opportunity = excess_cash × target_yield_rate
- Tax loss = market_value - cost_basis (when negative)
- Tax savings = realized_loss × applicable_tax_rate (capital gains: 15%, ordinary: up to 35%)

FLAG THRESHOLDS:
- RED FLAG: Drift exceeds ±10% OR cash exceeds target by >10%
- YELLOW FLAG: Expense ratio > 0.50% with passive alternative available, OR compliance task overdue >30 days

BEHAVIORAL GUIDELINES:
- Always cite specific dollar amounts and percentages from portfolio data
- Show calculation breakdowns with formula references
- Suggest specific ETF tickers (IVV, AGG, SGOV) for recommendations
- For compliance queries, reference regulatory frameworks (Reg BI, Section 206)
- Keep responses actionable — suggest next steps the advisor can take
- When explaining terms, use plain language with real portfolio examples
```

### Conversation Memory Design

| Field | Purpose |
|-------|---------|
| `sessionId` | Groups messages within a single browser session |
| `advisorId` | Associates memory with the advisor |
| `accountId` | Tracks which client was active in context |
| Window size | Rolling 20 messages (10 pairs) to manage token budget |

---

## Part 6: Fallback Strategy

When n8n is unreachable (timeout > 15s, network error, HTTP ≥ 400):

1. **Log:** `console.error("[n8n fallback]", error.message, timestamp)`
2. **Execute:** `getFallbackResponse(message, activeContext)` — the existing keyword-matching logic
3. **Indicator:** Append `\n\n---\n_⚠️ AI assistant is in offline mode — limited capabilities available._`
4. **Response format:** Standard `{ response, action }` — no `suggestedActions` in fallback mode

---

## Part 7: Implementation Steps

| Step | Task | File(s) |
|------|------|---------|
| 1 | Extract existing keyword matching into `getFallbackResponse()` | `server.js` |
| 2 | Implement n8n proxy in `POST /api/chat` (fetch + timeout + fallback) | `server.js` |
| 3 | Add `GET /api/research-digest` endpoint (proxy to n8n) | `server.js` |
| 4 | Add `sessionId` and `conversationHistory` state to frontend | `src/App.jsx` |
| 5 | Update `handleSendChat()` to send new payload format | `src/App.jsx` |
| 6 | Handle `suggestedActions` and `emailDraft` in chat response rendering | `src/App.jsx` |
| 7 | Add Research Digest card component on Home dashboard | `src/App.jsx` |
| 8 | Add `fetchResearchDigest()` call on page load | `src/App.jsx` |
| 9 | Test end-to-end with n8n running | — |
| 10 | Test fallback with n8n stopped | — |

---

## Part 8: Good-to-Have — Performance Optimization (Future)

### Server-Side Polling + Caching for Research Digest

For production, replace the "frontend polls on every load" model with a more efficient server-side caching approach:

```
┌─────────────────────────────────────────────────────┐
│  EXPRESS SERVER (Scheduled Job)                       │
│                                                     │
│  Every 30 minutes:                                  │
│    → POST to n8n Research Digest webhook            │
│    → Cache response in memory (or local file/Redis) │
│    → Update cache timestamp                         │
│                                                     │
│  GET /api/research-digest:                          │
│    → Return cached alerts (instant, no n8n call)    │
│    → Include cache age in response header           │
└─────────────────────────────────────────────────────┘
```

**Benefits:**
- Page load is instant (no 2-5s n8n latency on every load)
- Reduces n8n webhook calls from per-user-load to 2×/hour
- n8n can do heavier processing (crawl external feeds, compare historical data)
- Stale cache (>1 hour) triggers a refresh on next request

**Implementation:**
- Use `node-cron` or `setInterval` for scheduled polling
- Store digest in an in-memory variable with timestamp
- Serve from cache if age < 30 minutes; refresh otherwise
- Add `X-Digest-Cache-Age` response header so frontend can show "Updated X min ago"

### Push Model (Future — WebSocket)

For real-time alert delivery (e.g., an urgent fund change mid-day):
- n8n sends a POST to Express `/internal/digest-push` when it detects a critical change
- Express pushes to connected frontends via WebSocket/SSE
- Frontend shows a notification badge: "1 new research alert"

---

## Verification Plan

1. **Start servers:** `node server.js` + `npx vite`
2. **n8n running (chat):** Type a message → verify n8n receives the lightweight payload → verify response renders with markdown
3. **n8n running (digest):** Load Home screen → verify Research Digest card shows alerts
4. **Navigation:** Verify `NAVIGATE_TO` actions still switch Column 2 tabs
5. **Suggested actions:** Verify buttons render and call correct local APIs when clicked
6. **Fallback:** Stop n8n → send a chat message → verify keyword-matching activates with offline indicator
7. **Digest fallback:** Stop n8n → load Home → verify empty state or cached last-known digest
8. **Existing APIs:** Confirm rebalance, Gmail draft, Calendar create all still work independently
