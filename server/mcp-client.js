import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

let client = null;
let transport = null;
let connected = false;
let connectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

async function ensureConnected() {
  if (connected && client) return client;

  if (connectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    throw new Error('MCP server connection failed after maximum retry attempts');
  }

  connectAttempts++;

  try {
    client = new Client(
      { name: 'advisory-vault-client', version: '1.0.0' },
      { capabilities: {} }
    );

    transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(PROJECT_ROOT, 'mcp', 'google-drive-server.js')],
      env: {
        ...process.env,
        GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
        GCP_OAUTH_KEYS_PATH: process.env.GCP_OAUTH_KEYS_PATH || './sourceData/gcp-oauth.keys.json',
        GCP_TOKEN_PATH: process.env.GCP_TOKEN_PATH || './sourceData/.gcp-token.json'
      }
    });

    await client.connect(transport);
    connected = true;
    connectAttempts = 0;
    console.log('[MCP Client] Connected to Google Drive MCP server');

    transport.onclose = () => {
      connected = false;
      client = null;
      console.warn('[MCP Client] Connection closed, will reconnect on next call');
    };

    return client;
  } catch (err) {
    connected = false;
    client = null;
    console.error(`[MCP Client] Connection attempt ${connectAttempts} failed:`, err.message);
    throw err;
  }
}

async function callTool(toolName, args) {
  const mcpClient = await ensureConnected();
  const result = await mcpClient.callTool({ name: toolName, arguments: args });

  if (result.isError) {
    const errorText = result.content?.[0]?.text || 'Unknown MCP error';
    throw new Error(errorText);
  }

  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function mcpUpload(fileBuffer, originalFileName, advisorId) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const base64Content = fileBuffer.toString('base64');
  return callTool('drive_upload', {
    fileContent: base64Content,
    originalFileName,
    advisorId,
    folderId
  });
}

export async function mcpListFiles(advisorId) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  return callTool('drive_list', { folderId, advisorId });
}

export async function mcpGetFile(fileId) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  return callTool('drive_get_file', { fileId, folderId });
}

export async function mcpDeleteFile(fileId) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  return callTool('drive_delete', { fileId, folderId });
}

export async function disconnectMcp() {
  if (client && connected) {
    await client.close();
    connected = false;
    client = null;
    console.log('[MCP Client] Disconnected');
  }
}
