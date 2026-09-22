# Document Vault / PDF Dropzone — Implementation Plan

## Summary

Replace the current simulated Document Vault tab with a fully functional system that:
- Connects to Google Drive via MCP (Model Context Protocol) using `gcp-oauth.keys.json`
- Uploads PDFs to a shared Google Drive folder with advisor-prefixed naming
- Lists and previews PDFs inline in the dashboard
- Sends selected file metadata (name + folder ID) to the n8n AI agent for summarization

---

## Architecture Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| File naming format | `EMP_9021_<original_filename>.pdf` |
| MCP approach | Standalone MCP server process (`@anthropic-ai/mcp-server-google-drive` or custom) |
| OAuth flow | Auto browser consent on first run, token cached locally |
| Upload path | Frontend → Express → MCP → Google Drive |
| Folder strategy | Single shared folder, advisor ID prefix distinguishes ownership |
| PDF viewer | Inline panel replacing file list within the vault tab |
| File types | PDF only |
| Summarization | User selects files → sends file names + folder ID to n8n |
| Folder ID | Env variable: `GOOGLE_DRIVE_FOLDER_ID=1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz` |

---

## Phase 1: MCP Server Setup & Google Drive Auth

### 1.1 Install MCP Dependencies

```bash
npm install @anthropic-ai/sdk @google-cloud/local-auth googleapis
```

### 1.2 MCP Server Configuration

Create `mcp/google-drive-server.js` — a standalone MCP server that exposes these tools:
- `drive_upload` — upload a PDF buffer to the configured folder
- `drive_list` — list files in the folder (optionally filtered by advisor prefix)
- `drive_get_file` — get file metadata + download URL
- `drive_delete` — remove a file by ID

**MCP Server Config file:** `mcp/mcp-config.json`
```json
{
  "mcpServers": {
    "google-drive": {
      "command": "node",
      "args": ["mcp/google-drive-server.js"],
      "env": {
        "GOOGLE_DRIVE_FOLDER_ID": "${GOOGLE_DRIVE_FOLDER_ID}",
        "GCP_OAUTH_KEYS_PATH": "./sourceData/gcp-oauth.keys.json",
        "GCP_TOKEN_PATH": "./sourceData/.gcp-token.json"
      }
    }
  }
}
```

### 1.3 OAuth Token Flow

On first server start:
1. MCP server reads `gcp-oauth.keys.json`
2. Checks for cached token at `sourceData/.gcp-token.json`
3. If no token → opens browser for Google consent → saves refresh token
4. Subsequent starts reuse the cached token (auto-refreshes access token)

**Scopes required:**
- `https://www.googleapis.com/auth/drive.file` (manage files created by this app)

### 1.4 Environment Variables

Add to `.env` (create file):
```env
# Google Drive MCP
GOOGLE_DRIVE_FOLDER_ID=1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz
GCP_OAUTH_KEYS_PATH=./sourceData/gcp-oauth.keys.json
GCP_TOKEN_PATH=./sourceData/.gcp-token.json

# Existing (moved from hardcoded defaults)
N8N_CHAT_WEBHOOK_URL=http://localhost:5678/webhook/05773270-b5e3-40aa-a278-b6732f0ece11
N8N_RESEARCH_DIGEST_URL=http://localhost:5678/webhook/research-digest-placeholder
N8N_TIMEOUT_MS=15000
PORT=3001
```

Add `dotenv` package and load in `server.js`:
```javascript
import 'dotenv/config';
```

### 1.5 .gitignore Updates

```
sourceData/.gcp-token.json
.env
```

---

## Phase 2: Express API Endpoints (MCP Client)

The Express server acts as an MCP client, communicating with the Google Drive MCP server via stdio.

### 2.1 MCP Client Integration in Express

Create `server/mcp-client.js`:
- Spawns the MCP server process on Express startup
- Provides helper functions: `mcpUpload()`, `mcpListFiles()`, `mcpGetFile()`, `mcpDeleteFile()`
- Passes `GOOGLE_DRIVE_FOLDER_ID` on every interaction

### 2.2 New API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/vault/upload` | Accept PDF multipart upload, rename, push to Drive |
| `GET` | `/api/vault/files` | List all PDFs in the folder (filtered by advisor) |
| `GET` | `/api/vault/files/:fileId/view` | Get a viewable URL or stream PDF content |
| `DELETE` | `/api/vault/files/:fileId` | Remove a file from Drive |
| `POST` | `/api/vault/summarize` | Send selected file names + folder ID to n8n |

### 2.3 Upload Flow Detail

```
1. Frontend sends: POST /api/vault/upload
   - Body: multipart/form-data { file: <pdf>, advisorId: "EMP_9021" }

2. Express middleware (multer):
   - Validates file is PDF (mime type + extension)
   - Renames: `EMP_9021_<sanitized_original_name>.pdf`
   - Size limit: 25MB

3. Express → MCP Server:
   - Calls `drive_upload` tool with { buffer, fileName, folderId }

4. MCP Server → Google Drive API:
   - Uploads to folder 1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz
   - Returns { fileId, fileName, webViewLink, createdTime }

5. Express responds to frontend:
   - { success: true, file: { id, name, viewLink, uploadedAt } }
```

### 2.4 File Naming Convention & Best Practices

**Format:** `<ADVISOR_EMPLOYEE_ID>_<sanitized_filename>.pdf`

**Sanitization rules:**
- Replace spaces with underscores
- Remove special characters except hyphens and underscores
- Lowercase the original filename
- Truncate to 100 characters (before extension)
- Deduplicate: append `_2`, `_3` if name exists

**Examples:**
```
EMP_9021_financial_plan_2026.pdf
EMP_9021_chen_household_suitability.pdf
EMP_9021_quarterly_review_q2.pdf
```

---

## Phase 3: Frontend — Document Vault Redesign

### 3.1 Component Extraction

Extract from the monolithic `App.jsx` into:
```
src/
├── components/
│   ├── DocumentVault.jsx       # Main vault container
│   ├── PdfDropzone.jsx         # Upload dropzone component
│   ├── VaultFileList.jsx       # File listing with selection
│   ├── PdfViewer.jsx           # Inline PDF viewer panel
│   └── VaultToolbar.jsx        # Actions: summarize, delete, refresh
```

### 3.2 Document Vault Layout (Inline Panel)

```
┌─────────────────────────────────────────────────────┐
│  DOCUMENT VAULT                          [Refresh]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ PDF Dropzone ──────────────────────────────┐   │
│  │  📄 Drop PDF here or click to upload         │   │
│  │  Max 25MB • PDF only                         │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ File List ──────────────────────────────────┐   │
│  │  ☐ EMP_9021_financial_plan.pdf    2026-08-10 │   │
│  │  ☑ EMP_9021_suitability.pdf       2026-08-08 │   │
│  │  ☐ EMP_9021_quarterly_q2.pdf      2026-07-15 │   │
│  │                                               │   │
│  │  [📖 View] [💬 Send to Chat] [🗑 Delete]     │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌─ Inline PDF Viewer (when file selected) ─────┐  │
│  │                                               │  │
│  │     ┌──────────────────────┐                  │  │
│  │     │                      │                  │  │
│  │     │   PDF Rendered Here  │                  │  │
│  │     │   (iframe / embed)   │                  │  │
│  │     │                      │                  │  │
│  │     └──────────────────────┘                  │  │
│  │                                               │  │
│  │  [◀ Page] 1/12 [Page ▶]  [Send to Chat]     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3.3 State Management for Vault

New state in `App.jsx` (or extracted component):
```javascript
const [vaultFiles, setVaultFiles] = useState([]);       // files from Drive
const [selectedFiles, setSelectedFiles] = useState([]); // checked file IDs
const [viewingFile, setViewingFile] = useState(null);   // file being previewed
const [vaultLoading, setVaultLoading] = useState(false);
```

### 3.4 PDF Viewer Implementation

Use the browser's native PDF rendering via `<iframe>` or `<embed>`:
```jsx
<iframe
  src={`/api/vault/files/${fileId}/view`}
  type="application/pdf"
  width="100%"
  height="500px"
/>
```

The Express endpoint proxies the file content from Google Drive (avoids CORS and auth issues in the browser).

### 3.5 Drag & Drop Enhancement

- `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers
- Visual feedback: border highlight on drag-over
- Multiple file drop support (sequential upload)
- Progress indicator per file

---

## Phase 4: AI Agent Chat Integration

### 4.1 "Send to Chat" Action

When user selects files and clicks "Send to Chat" or "Summarize":

```javascript
// Frontend builds message
const selectedFileNames = selectedFiles.map(f => f.name);
const chatMessage = `Please summarize the following documents: ${selectedFileNames.join(', ')}`;

// Sent to /api/chat with additional vault context
const payload = {
  message: chatMessage,
  sessionId,
  advisorId: advisor.employee_id,
  activeTab: 'vault',
  vaultContext: {
    folderId: '1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz',
    selectedFiles: selectedFileNames,
    action: 'summarize'
  }
};
```

### 4.2 Modified n8n Payload

Update `POST /api/chat` in `server.js` to include vault context:

```javascript
const n8nPayload = {
  ...existingPayload,
  vaultContext: req.body.vaultContext || null
  // { folderId, selectedFiles: ["EMP_9021_plan.pdf", ...], action }
};
```

n8n can then use the folder ID + file names to fetch and process the documents.

### 4.3 Chat Quick Actions from Vault

Add suggested action chips when viewing vault:
- "Summarize selected documents"
- "Compare these plans"
- "Extract key dates from documents"
- "Check compliance status"

---

## Phase 5: Best Practices & Production Hardening

### 5.1 Security

- **Never expose `gcp-oauth.keys.json` or token to the frontend** — all Drive operations go through Express
- Validate PDF mime type server-side (`application/pdf`) — don't trust file extension alone
- Sanitize filenames to prevent path traversal
- Rate-limit uploads (e.g., 10 files/minute per session)
- Add `.gcp-token.json` and `.env` to `.gitignore`

### 5.2 Error Handling

- MCP server process crash → auto-restart with exponential backoff
- Google Drive API quota exceeded → queue uploads, retry with delay
- Upload timeout → abort after 60s, notify user
- Invalid PDF → reject before uploading to Drive

### 5.3 File Management Best Practices

- **Naming consistency:** Always lowercase, underscores, no spaces
- **Deduplication:** Check if file with same name exists before upload; prompt user to overwrite or rename
- **Metadata:** Store upload timestamp, file size, and uploader in a local DB table for fast listing (cache, not source of truth)
- **Pagination:** If vault grows large, paginate file list (20 files per page)

### 5.4 Performance

- Cache file list for 30 seconds (avoid hammering Drive API on every tab switch)
- Lazy-load PDF viewer (only when user clicks "View")
- Use streaming for file proxy (don't buffer entire PDF in Express memory)

---

## File Structure (New/Modified)

```
advisoryAgentMVP/
├── .env                                 # NEW — environment variables
├── .gitignore                           # MODIFIED — add token + .env
├── mcp/
│   ├── google-drive-server.js           # NEW — MCP server for Google Drive
│   └── mcp-config.json                  # NEW — MCP configuration
├── server/
│   └── mcp-client.js                    # NEW — MCP client helper for Express
├── server.js                            # MODIFIED — new vault endpoints + dotenv
├── src/
│   ├── App.jsx                          # MODIFIED — integrate vault components
│   └── components/
│       ├── DocumentVault.jsx            # NEW — vault container
│       ├── PdfDropzone.jsx              # NEW — drag-and-drop upload
│       ├── VaultFileList.jsx            # NEW — file list with checkboxes
│       ├── PdfViewer.jsx                # NEW — inline PDF viewer
│       └── VaultToolbar.jsx             # NEW — action buttons
├── sourceData/
│   ├── gcp-oauth.keys.json             # EXISTS — OAuth credentials
│   └── .gcp-token.json                 # GENERATED — cached refresh token
└── package.json                         # MODIFIED — new dependencies
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "dotenv": "^16.4.0",
    "multer": "^1.4.5-lts.1",
    "googleapis": "^130.0.0",
    "@google-cloud/local-auth": "^3.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

---

## Implementation Order

| Step | Task | Estimated Effort |
|------|------|------------------|
| 1 | Create `.env` file + add `dotenv` to server | 15 min |
| 2 | Build MCP Google Drive server (`mcp/google-drive-server.js`) | 2-3 hrs |
| 3 | Implement OAuth auto-consent flow + token caching | 1-2 hrs |
| 4 | Build MCP client helper (`server/mcp-client.js`) | 1 hr |
| 5 | Add Express vault endpoints (`/api/vault/*`) | 2 hrs |
| 6 | Extract vault frontend components | 1-2 hrs |
| 7 | Build `PdfDropzone` with drag-and-drop + upload to Express | 1-2 hrs |
| 8 | Build `VaultFileList` with file listing from Drive | 1 hr |
| 9 | Build `PdfViewer` inline panel | 1-2 hrs |
| 10 | Integrate "Send to Chat" + modify n8n payload | 1 hr |
| 11 | Testing & error handling | 2 hrs |

**Total estimated: ~14-18 hours**

---

## Testing Checklist

- [ ] OAuth flow completes on first run (browser opens, token cached)
- [ ] Subsequent starts reuse cached token without browser prompt
- [ ] PDF upload renames correctly (`EMP_9021_filename.pdf`)
- [ ] File appears in Google Drive folder `1jsh1i6NKUT_RXfggFG9Nrqy_SJyBUttz`
- [ ] File list fetches from Drive and displays in vault
- [ ] Clicking a file opens inline PDF viewer
- [ ] "Send to Chat" passes file names + folder ID to n8n
- [ ] Drag-and-drop works for single and multiple files
- [ ] Duplicate filename detection works
- [ ] Invalid file type is rejected with user-friendly error
- [ ] MCP server restarts gracefully after crash
- [ ] Large file (>10MB) uploads without timeout
