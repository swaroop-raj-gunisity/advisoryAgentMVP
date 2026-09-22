# Delta Analysis: Specification vs. Implementation

This document identifies gaps between the documented design (mvp_design_specification_v2.md, implementation_plan_v2.md, walkthrough_v2.md) and the current codebase implementation. Each item is categorized by severity and includes a recommendation.

---

## 1. AI / LLM Integration Layer — Not Connected

| Aspect | Spec States | Implementation Reality |
|--------|-------------|----------------------|
| LLM Engine | Gemini 3.5 Pro / Flash with RAG orchestration | No LLM integration exists; `/api/chat` uses hardcoded `if/else` keyword matching |
| Prompt Orchestration | Context grounding, template compilation, RAG retrieval | Absent — responses are static markdown strings |
| Dynamic Calculations | AI performs real-time math with formula citations | Calculations are pre-written text, not computed |

**Severity:** High — Core value proposition  
**Recommendation:** Integrate Google Gemini (or equivalent LLM) via API. Implement a prompt context compiler that injects DB records into system prompts. Replace the keyword-matching chat handler with actual LLM inference, passing holdings/targets/tasks as grounding context.

---

## 2. MCP (Model Context Protocol) Layer — Simulated, Not Real

| Aspect | Spec States | Implementation Reality |
|--------|-------------|----------------------|
| Local DB MCP | MCP server wrapping SQLite queries | Direct Express REST endpoints (no MCP protocol) |
| Google Workspace MCP | `@modelcontextprotocol/server-google-workspace` with OAuth | Hardcoded mock JSON responses; no Google API auth |
| Market Data MCP | Excel parser as an MCP server | Excel parsed once by `seed_data.py`; no runtime MCP |

**Severity:** Medium — Acceptable for MVP demo, but architecture diverges from spec  
**Recommendation:** For production readiness, wrap the SQLite query layer and Google Workspace calls in MCP server implementations per the spec's `mcpServers` configuration schema. For demo-only purposes, document explicitly that MCP is simulated via REST.

---

## 3. Google Workspace — Mock Only

| Feature | Spec States | Implementation Reality |
|---------|-------------|----------------------|
| Gmail `gmail_create_draft` | Writes real draft to advisor's Gmail | `/api/gmail/draft` returns fake success JSON |
| Gmail incoming messages | Pulls real inbox messages | `/api/gmail/messages` returns 2 hardcoded emails |
| Calendar `calendar_list_events` | Reads live Google Calendar | `/api/calendar/events` returns 3 static events |
| Calendar `calendar_create_event` | Creates real calendar event | `/api/calendar/create` returns mock confirmation |
| Free/Busy check | `get_calendar_free_busy` before scheduling | Not implemented at all |

**Severity:** Medium  
**Recommendation:** Implement OAuth2 flow for Google Workspace. Use the Google Calendar and Gmail Node.js client libraries (or the MCP server package) to perform real API calls. Add a `.env` configuration for credentials.

---

## 4. Missing UI Features Specified in Design

### 4.1 Voice Dictation / Recording Toggle
- **Spec:** Column 3 features "voice recording toggle" and "Voice Dictation" capability
- **Implementation:** No microphone/voice UI exists
- **Recommendation:** Add a Web Speech API or Whisper-based voice input button in the chat input area.

### 4.2 File Attachment Pin in Chat
- **Spec:** Column 3 has "file upload attachment pin"
- **Implementation:** PDF upload exists only in the Document Vault tab, not inline in chat
- **Recommendation:** Add a paperclip/attachment button in the Column 3 chat input bar that enables the "Chat Path (Session Temporary)" upload directly within conversation.

### 4.3 Global Search Functionality
- **Spec:** Global search bar searches across the entire book of business (130 households)
- **Implementation:** Search input exists but has no handler — it's purely decorative
- **Recommendation:** Wire the search input to a backend endpoint that queries `contact` and `account` tables. Show filtered results in a dropdown.

### 4.4 Life Events Display
- **Spec:** Life events table (retirement date, college enrollment) shown in client CRM/timeline
- **Implementation:** `life_event` table is seeded in the DB but never fetched or displayed in the UI
- **Recommendation:** Add a `/api/life-events` endpoint and render life events in the CRM Activity tab or as a timeline component.

### 4.5 Contact Details Panel
- **Spec:** Contact card with email, phone, birthdate, marital status
- **Implementation:** `contact` table is seeded but no API endpoint or UI panel displays it
- **Recommendation:** Add a `/api/contacts` endpoint and show a contact summary card in the client dossier banner.

### 4.6 Settings Page
- **Spec:** Column 1 includes a "Settings" link
- **Implementation:** No settings link or page exists
- **Recommendation:** Add a settings nav item (even if it only shows advisor preferences or display toggles for MVP).

---

## 5. Bi-Directional Sync — Partially Implemented

| Direction | Spec States | Implementation Reality |
|-----------|-------------|----------------------|
| Canvas → Agent (CONTEXT_CHANGE) | Selecting a client or tab updates Copilot context + header | Copilot title updates on client selection; chips update. Context sent to `/api/chat` as `activeContext` string. |
| Agent → Canvas (NAVIGATE_TO) | Chat responses trigger tab switches | Implemented — `uiAction.type === 'NAVIGATE_TO'` switches `activeTab`. |
| Calendar click → Chen Dossier | Clicking calendar event loads client profile | Implemented for "Chen" events in sidebar calendar. |

**Status:** Mostly functional for the demo scenario  
**Recommendation:** The `CONTEXT_CHANGE` event is implicit (via state). Consider formalizing it as a custom event bus if the app grows beyond one client, to avoid prop-drilling context.

---

## 6. Data Inconsistency: Cash Amount

| Document | Cash Value Stated |
|----------|------------------|
| Design Spec v2 (Section 6) | $900,000 (50% of $1.8M) |
| Implementation Plan v2 | $720,000 (40% Cash Drag) |
| Seed Data (actual DB) | $900,000 (HLD_010) |
| Walkthrough v2 | $900,000 |

**Severity:** Low — cosmetic documentation inconsistency  
**Recommendation:** Update `implementation_plan_v2.md` to state $900,000 / 50% cash (not $720k / 40%) to align with the database seed and design spec.

---

## 7. Database Indexes — Not Created

- **Spec (Walkthrough §6):** "Create composite indexes on `holding(account_id, ticker)` and `etf(ticker)`"
- **Implementation:** `seed_data.py` creates no indexes
- **Recommendation:** Add `CREATE INDEX` statements after table creation for performance:
  ```sql
  CREATE INDEX idx_holding_account_ticker ON holding(account_id, ticker);
  CREATE INDEX idx_etf_ticker ON etf(ticker);
  ```

---

## 8. ETF Data Parsing — Fragile Column Index Mapping

- **Spec:** Yield and Duration are parsed from the iShares Excel SpreadsheetML
- **Implementation:** `seed_data.py` attempts `data_clean[203]` for yield and `data_clean[218]` for duration — these indices are likely incorrect for the actual column layout and will silently default to `0.0`
- **Recommendation:** Validate column indices against actual Excel structure. Consider using named column headers from Row 1/2 instead of hardcoded numeric indices. Add a verification query post-seed to confirm SGOV yield = 5.15% and AGG duration = 6.2 as documented.

---

## 9. Compliance Memo Assembly — Works But No PDF Generation

- **Spec:** "PDF generation trigger is logged" and document is stored
- **Implementation:** Template substitution works correctly via `/api/rebalance`; compliance text is returned as a string. No actual PDF is generated or stored as a file.
- **Recommendation:** Add a PDF generation step using a library like `pdfkit` or `puppeteer`. Store generated PDFs in a `/compliance_docs` directory and reference them in the Document Vault UI.

---

## 10. Research Digest / Proactive Alert Engine — Static

- **Spec:** "Research Digest scans the `etf` database and client holdings to identify fee cuts or duration shifts"
- **Implementation:** Alert detection is entirely static — checking `h.ticker === 'CASH' && h.market_value > 500000` in React JSX
- **Recommendation:** Move alert logic to the backend. Create an `/api/alerts` endpoint that dynamically computes drift from `asset_allocation_target` and fee comparisons from `etf` vs `holding` tables. The frontend should fetch and render, not compute.

---

## 11. Multi-Client Support — Absent

- **Spec:** Sarah manages 130 client households; book overview aggregates across all
- **Implementation:** Only 1 household (Chen) exists. Navigation, APIs, and UI are all single-client
- **Recommendation:** For the MVP demo this is acceptable, but the spec should note this explicitly as a demo limitation. If extending: add a clients list endpoint, parameterize all APIs by `account_id`, and populate at least 2-3 household stubs for navigation realism.

---

## 12. Dual-Path PDF Ingestion — Simulated

- **Spec:** Vault path parses PDFs and writes plan metrics to `asset_allocation_target` and `life_event` tables
- **Implementation:** `/api/upload-plan` returns hardcoded JSON regardless of file content; "Vault" mode only updates `next_review_date`, not actual plan metrics
- **Recommendation:** Integrate a PDF text-extraction library (e.g., `pdf-parse`) to actually read uploaded PDFs. Use LLM to extract structured plan data and update the relevant DB tables.

---

## 13. Tax Loss Harvesting Calculation — Documented But Not Wired

- **Spec (§8.B):** Dynamic calculation engine computes tax savings from harvesting losses on AGG ($8,000 loss → $1,200 savings at 15% cap gains)
- **Implementation:** The chat handler has no branch for tax-loss harvesting queries
- **Recommendation:** Add a keyword match (or LLM intent) for "tax loss" / "harvest" queries. Pull cost basis vs market value from `holding` table and compute realized loss × applicable tax rate.

---

## 14. Layout Dimensions — Close But Not Exact

| Element | Spec | Implementation |
|---------|------|----------------|
| Column 1 width | 240px | CSS class `sidebar-col` (need to verify in full CSS) |
| Column 3 width | 380px | CSS class `copilot-col` (need to verify in full CSS) |
| Col 1 background | #F3F4F1 | Uses `var(--surface-alt)` = `#F3F4F1` ✓ |
| Col 2 background | #FAFAF7 | Uses `var(--ground)` = `#FAFAF7` ✓ |
| Col 3 background | #FFFFFF | Uses `var(--surface)` = `#FFFFFF` ✓ |
| Col 3 shadow | `0 4px 12px rgba(28,43,58,0.08)` | Uses `var(--shadow-md)` = same value ✓ |

**Status:** Colors align correctly with spec. Column widths should be verified in full CSS.

---

## 15. Secondary Persona (Marcus Vance) — Not Represented

- **Spec:** Marcus Vance is an associate advisor/paraplanner with specific workflow needs (bulk PDF uploading, export controls, template scaffolding)
- **Implementation:** No multi-user support, no role-based views, no Marcus-specific features
- **Recommendation:** For MVP this is acceptable as single-user demo. Document as future scope. If extending: add advisor role selection and paraplanner-specific views.

---

## Summary Priority Matrix

| Priority | Item | Effort |
|----------|------|--------|
| **P0 — Critical for Demo Credibility** | LLM Integration (Item 1) | High |
| **P1 — High Value** | Google Workspace real auth (Item 3) | Medium |
| **P1 — High Value** | Dynamic alert engine (Item 10) | Medium |
| **P2 — UX Completeness** | Life Events display (Item 4.4) | Low |
| **P2 — UX Completeness** | Contact details panel (Item 4.5) | Low |
| **P2 — UX Completeness** | Voice input (Item 4.1) | Medium |
| **P2 — UX Completeness** | Chat file attachment (Item 4.2) | Low |
| **P2 — UX Completeness** | Global search wiring (Item 4.3) | Low |
| **P3 — Data Integrity** | Fix cash amount doc inconsistency (Item 6) | Trivial |
| **P3 — Data Integrity** | DB indexes (Item 7) | Trivial |
| **P3 — Data Integrity** | ETF parsing validation (Item 8) | Low |
| **P3 — Nice to Have** | PDF generation (Item 9) | Medium |
| **P3 — Nice to Have** | Tax loss calc (Item 13) | Low |
| **P4 — Future Scope** | Multi-client (Item 11) | High |
| **P4 — Future Scope** | Marcus persona (Item 15) | High |
| **P4 — Future Scope** | Real MCP protocol (Item 2) | High |

---

*Generated: 2026-08-10*
