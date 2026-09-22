# Walkthrough Document: Advisor AI Copilot Portal

This document provides a detailed walkthrough of the design, system architecture, database models, compliance engines, and user scenarios for the Advisor AI Copilot Portal MVP.

---

## 1. Executive Summary & Business Value

### Project Overview
The **Advisor AI Copilot Portal** is a next-generation wealth management application designed to solve the heavy administrative burden faced by financial advisors. By integrating a context-aware conversational AI assistant (Column 3) alongside traditional data visualization dashboards (Column 2) and productivity suites (Google Workspace), the system simplifies key operations—meeting prep, portfolio review, research alert matching, and compliance documentation—into a single, consolidated dashboard canvas.

### Business Value Metrics
*   **Administrative Overhead Reduction:** Reclaims **8 to 12 hours per week** per advisor by reducing the time spent compiling reports, toggling between platforms, and manual email formatting.
*   **Revenue Optimization (AUM Conversion):** Proactively flags client portfolio anomalies (e.g., $810,000 in excess cash drag) and provides instant rebalancing recommendations, turning cash drag into active AUM fees and client value.
*   **Compliance Risk Mitigation:** Replaces manual suitability drafting with a template-based compliance generator, ensuring every trade has an audit-compliant rationale document stored in the database.

---

## 2. Architecture Overview & Data Flow

The system runs on a **three-tier design** (Presentation UI ➔ Prompt Orchestrator with RAG ➔ MCP Integration Layer ➔ Local SQL Datastores & Google Workspace APIs).

```
+---------------------------------------------------------------------------------------------------------+
| PRESENTATION LAYER (HTML5, Vanilla CSS, JS Engine)                                                      |
|   - Left Column: Nav, Global search, Today's Calendar Schedule                                          |
|   - Center Column: Portfolio values, asset allocation charts, task timelines, and vault dropzone        |
|   - Right Column: Conversational chatbot sidebar with voice input and alert streams                     |
+---------------------------------------------------------------------------------------------------------+
                                                     ▲
                                                     ▼ (Events: Context changes & UI Commands)
+---------------------------------------------------------------------------------------------------------+
| ORCHESTRATION LAYER (Gemini 3.5 Pro/Flash LLM Agent)                                                    |
|   - Parses intent and queries relevant database entities                                                |
|   - Formulates grounding prompts and injects placeholder values into templates                          |
+---------------------------------------------------------------------------------------------------------+
                                                     ▲
                                                     ▼ (Model Context Protocol API)
+---------------------------------------------------------------------------------------------------------+
| INTEGRATION LAYER (MCP Servers)                                                                         |
|   - Local Database MCP: SQL queries on contact, holding, and task tables                               |
|   - Workspace MCP: List events, create calendar bookings, and compose Gmail drafts                      |
|   - Market Data MCP: Text regex parser reading iShares-UnitedStates.xls ETF characteristics             |
+---------------------------------------------------------------------------------------------------------+
```

### Data Flow Execution (Rebalancing & Email Sync)
1.  **Detection:** The Research Digest scans the `etf` database (compiled from the iShares Excel file) and the client holdings database to identify fee cuts or duration shifts that intersect with holdings.
2.  **Alerting:** An alert is generated and displayed on the Home dashboard in Column 2, and in the proactive feed in Column 3.
3.  **Command:** The advisor selects `[Draft Client Notification]`.
4.  **Retrieval:** The Orchestrator queries the `holding` and `contact` tables to pull Robert Chen's specific share counts and email address.
5.  **Compilation:** The Orchestrator passes these values to the Gemini LLM, which drafts a personalized fee-drag reduction proposal.
6.  **MCP Integration:** The Orchestrator invokes the `gmail_create_draft` tool on the Google Workspace MCP server, writing the draft directly to Sarah's G Suite account.

---

## 3. Screen-by-Screen Walkthrough

### Screen 1: Advisor Home (Book Overview)
Provides Sarah Mitchell with a practice-level command center, combining aggregate practice metrics and the Copilot proactive alerts.

*   **Global Navigation (Col 1):** Pinned links (Home, Clients, Research, Documents). An input box allows global search across the book of business. A list shows "Today's Schedule" containing active reviews.
*   **Book Snapshot (Col 2):** Highlights practice KPIs (Total AUM managed, client household counts, open task backlog count).
*   **Calendar Schedule (Col 2):** Pulls from Google Calendar using MCP, displaying meetings. Clicking "Robert Chen Review" shifts Column 2 to Screen 2 (Client Dossier).
*   **Alert Panel (Col 2/3):** Surfaces red/yellow flags:
    *   *Red Alert:* "Chen Household has 50% Cash ($900k) creating drag."
    *   *Yellow Alert:* "Overdue KYC Document Review for 1 account."
    *   *Yellow Alert:* "Expense Ratio Drift: ACT_BND fee is 0.85%."

---

### Screen 2: Client Profile Screen (Robert & Patricia Chen)
A deep-dive workspace representing the single household view, showing portfolio details, targets, life events, and task timelines.

*   **Dossier Banner (Col 2):** Displays Household Name, Moderate Risk Profile, and Total AUM ($1.8M).
*   **Asset Allocation Tab (Col 2):** Lists target allocations versus actual weights, highlighting the red-flag drift:
    *   *Equity:* Target 65.0% | Actual 35.0% | Drift: -30.0%
    *   *Fixed Income:* Target 30.0% | Actual 15.0% | Drift: -15.0%
    *   *Cash:* Target 5.0% | Actual 50.0% | Drift: +45.0%
*   **Holdings Grid (Col 2):** Shows detailed holdings (IVV, IEFA, IEMG, IJH, IJR, AGG, IEF, SGOV, ACT_BND, CASH) with share counts, prices, market values, and individual expense ratios.
*   **CRM Note Feed (Col 2):** Lists chronologically the logged review notes, Roth conversion ladder discussions, and open tasks (IPS signature in progress, 529 plan distribution in planning).
*   **Contextual Copilot (Col 3):** Displays "Suggested Tasks for Chen Household" (Prepare Brief, Run Roth Simulation, Rebalance Cash, Resolve KYC).

---

## 4. Component-Level Explanations & Database Models

### Database Schema (advisor_portal.db)
The local SQLite database caches FSC structures and ETF statistics:
*   `contact`: Stores contact name, phone, marital status, birthdate.
*   `account`: Stores total AUM ($1.8M), investment objective (Growth & Income), and risk profile (Moderate).
*   `holding`: Maps holdings to accounts, including ticker, share count, market value, cost basis, and expense ratio.
*   `task`: Holds tasks, mapping flag status fields (`RED_FLAG`, `YELLOW_FLAG`, `GREEN_FLAG`).
*   `life_event`: Holds retirement and college targets.
*   `etf`: Caches ETF characteristics parsed from the `iShares-UnitedStates.xls` spreadsheet.
*   `asset_allocation_target`: Records the targets, actual allocations, and drift deltas.

### Compliance Memo Template Files
Standard compliance `.txt` templates are stored in the `/templates` folder:
1.  **`suitability_memo_template.txt`:** Formats suitability arguments matching the client risk profile. Uses placeholders: `{client_risk_tolerance}`, `{investment_objective}`, `{time_horizon}`.
2.  **`trade_rationale_memo_template.txt`:** Formats execution logic to prevent churning compliance audits. Uses placeholders: `{rebalance_trigger_event}`, `{drift_percentage}`, `{tax_loss_harvested_amount}`.
3.  **`compliance_document_template.txt`:** Serves as the wrapper shell, mapping metadata (client details, accounts, signatures) and assembling memos in sequence.

---

## 5. AI Assistant Capabilities & Demo Walkthroughs

### Workflow 1: Financial Plan Upload (Dual-Path Ingestion)
1.  **Vault Path (Persistent):** Sarah drops a standard 2-page plan PDF into the Document Vault in Column 2. The datastore parser processes it, permanently records plan metrics in the `asset_allocation_target` and `life_event` tables, and prompts: *"Financial plan parsed. Goals updated: Retirement readiness at 82%. Target retirement date: March 2033."*
2.  **Chat Path (Session Temporary):** Sarah drops a fund sheet PDF into the Column 3 chat window. The Copilot summarizes it for the active thread but does not write to the SQLite database.

### Workflow 2: Meeting Prep & Calendar Integration
1.  Sarah opens the calendar list in Column 2. Clicking "Annual Review with Chens" fires a context update.
2.  The Copilot (Column 3) captures the event, pulls Robert's holdings ($1.8M AUM) and CRM notes (Roth conversion ladder) from the SQLite DB, and displays a summary card with recommended talking points: (a) reallocate cash to resolve cash drag, (b) harvest $12,000 capital loss on AGG/IEMG, (c) swap Active Bond Fund for AGG to save 82 bps in fee drag.
3.  Sarah clicks `[Schedule Follow-up]`. The Copilot searches the Google Calendar free-busy list, identifies availability, creates the event for next Tuesday at 2 PM, and adds it to the calendar.

### Workflow 3: Real-Time Q&A & Calculations
1.  Robert asks: "If we delay retirement to 67 and reallocate $630,000 cash into the target portfolio, what happens?"
2.  Sarah enters the query. The Copilot performs the math:
    *   *Delay retirement:* Readiness score rises from 82% to 94%.
    *   *Reallocate cash:* Redeploying $630k of idle cash (0% return) into a balanced model (yielding ~4.5%) increases annual household portfolio income by **$28,350**.
3.  The Copilot outputs the calculations, cites the formulas used (interest yield, asset weight deltas), and plots the projected wealth line in Column 2.

### Workflow 4: Compliance Memo Drafting
1.  Sarah clicks `[Generate Compliance Document]` for the cash reallocations.
2.  The Copilot fetches the text templates, retrieves database placeholders (`Moderate` risk, `Growth & Income` objective, `7` year horizon, `35.0%` cash drift), compiles the Suitability and Trade Rationale memos, and outputs a complete document draft.
3.  Sarah reviews the draft and clicks `[Sync to CRM]`. The text is recorded in the CRM timeline widget in Column 2.

---

## 6. Implementation Considerations

### Formula & Reference Verification
For the MVP, calculations are performed directly by the AI. To support transition to validated core calculation engines in production, every mathematical response includes a reference payload listing:
*   Formula name (e.g. `simple_drift_calculation`).
*   Variable values mapped (actual weights, target weights).
*   Underlying database sources (`asset_allocation_target.drift_pct`).

### Performance Considerations
To ensure sub-second response times during live presentations:
*   **Database Indexes:** Create composite indexes on `holding(account_id, ticker)` and `etf(ticker)`.
*   **Excel Cache:** The XML spreadsheet parsing is executed once on server startup (via `seed_data.py`). The runtime application reads from the indexed `etf` database table rather than parsing the 2.1MB Excel file during chat threads.
