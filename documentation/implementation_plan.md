# Implementation Plan: Advisor AI Copilot Portal

This document outlines the finalized execution steps, database details, template structures, and verification checklists for the Advisor AI Copilot Portal MVP.

## Strategic Scope Alignment

Strategic decisions have been fully incorporated into the workspace and design specification:

1. **PDF Upload Dual-Entry Path:**
   * Ingestion via **Document Vault (Column 2)** persistently writes to the database, enabling permanent grounding.
   * Ingestion via **AI Chat Sidebar (Column 3)** processes temporary, in-memory context only.
2. **Predefined Client Portfolio:**
   * Robert & Patricia Chen profile containing $1.8M total AUM.
   * 8 ETF holdings (IVV, IJH, IJR, IEFA, IEMG, AGG, IEF, SGOV) representing 60% of AUM, with a 40% Cash Drag ($720k) to trigger rebalancing alerts.
3. **Simulated Data Sources:**
   * Local SQLite Database (`advisor_portal.db`) populated with Salesforce FSC contacts, relationship notes, tasks, life events, and custodian holding details.
   * ETF characteristics parsed directly from [iShares-UnitedStates.xls](file:///C:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/sourceData/iShares-UnitedStates.xls).
4. **Text-based Compliance Memo Component System:**
   * Modular `.txt` templates created for Suitability Memos and Trade Rationale Memos, structured to support hierarchical assembly: *Document ➔ Chapters ➔ Sections ➔ Memos*.

---

## Proposed Changes

### Core Deliverables in the Workspace

#### [MODIFY] [mvp_design_specification.md](file:///C:/Users/swaroop.raj/.gemini/antigravity/brain/31d34f59-45f5-4e96-be22-32abac78360c/mvp_design_specification.md)
* Revised design spec containing the 5 features, bi-directional column dynamics, local DB schema models, and visual specifications.

#### [NEW] [seed_data.py](file:///c:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/sourceData/seed_data.py)
* Database initializer script that sets up the local database tables, parses the SpreadsheetML Excel spreadsheet, and seeds the sample client and holdings data.

#### [NEW] [advisor_portal.db](file:///c:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/sourceData/advisor_portal.db)
* Grounding SQLite database for Salesforce FSC activity records, tasks, custodian positions, and ETF metadata.

#### [NEW] [suitability_memo_template.txt](file:///c:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/templates/suitability_memo_template.txt)
* Modular suitability compliance memo template using `{client_risk_tolerance}`, `{investment_objective}`, and `{time_horizon}`.

#### [NEW] [trade_rationale_memo_template.txt](file:///c:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/templates/trade_rationale_memo_template.txt)
* Modular trade rationale compliance memo template using `{rebalance_trigger_event}`, `{drift_percentage}`, and `{tax_loss_harvested_amount}`.

#### [NEW] [compliance_document_template.txt](file:///c:/Users/swaroop.raj/Documents/workspace/antigravity/advisoryAgentMVP/templates/compliance_document_template.txt)
* Assembler document template mapping client details, accounts, signature fields, and section headers.

---

## Verification Plan

### Database & Seed Verification
* **DB Verification Command:** Open the SQLite database and query holdings to verify that the Chen Household ($1.8M AUM) contains exactly 9 holding records (8 ETFs + 1 Cash balance).
* **Excel Parsing Check:** Run queries against the `etf` table to ensure SGOV, AGG, IVV, and other tickers contain correct net expense ratios and durations parsed from `iShares-UnitedStates.xls`.

### UI/UX Template Rendering Check
* **Placeholder Replacement Test:** Inject sample JSON values:
  ```json
  {
    "client_risk_tolerance": "Moderate",
    "investment_objective": "Growth & Income",
    "time_horizon": "7",
    "rebalance_trigger_event": "portfolio cash drag adjustment",
    "drift_percentage": "35.0",
    "tax_loss_harvested_amount": "12,000.00"
  }
  ```
  Validate that the text engine compiles the suitability and trade rationale templates cleanly, generating a valid combined compliance document matching `COMP_DOC_001`.
