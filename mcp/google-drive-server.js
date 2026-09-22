import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const OAUTH_KEYS_PATH = process.env.GCP_OAUTH_KEYS_PATH
  ? path.resolve(PROJECT_ROOT, process.env.GCP_OAUTH_KEYS_PATH)
  : path.resolve(PROJECT_ROOT, 'sourceData', 'gcp-oauth.keys.json');

const TOKEN_PATH = process.env.GCP_TOKEN_PATH
  ? path.resolve(PROJECT_ROOT, process.env.GCP_TOKEN_PATH)
  : path.resolve(PROJECT_ROOT, 'sourceData', '.gcp-token.json');

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file'
];

let driveClient = null;

async function getAuthClient() {
  if (fs.existsSync(TOKEN_PATH)) {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const keysData = JSON.parse(fs.readFileSync(OAUTH_KEYS_PATH, 'utf8'));
    const keys = keysData.installed || keysData.web;

    const oauth2Client = new google.auth.OAuth2(
      keys.client_id,
      keys.client_secret,
      keys.redirect_uris[0]
    );
    oauth2Client.setCredentials(tokenData);

    oauth2Client.on('tokens', (tokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      const updated = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
    });

    return oauth2Client;
  }

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: OAUTH_KEYS_PATH,
  });

  if (client.credentials) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials, null, 2));
  }

  return client;
}

async function getDrive() {
  if (!driveClient) {
    const auth = await getAuthClient();
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

function sanitizeFileName(advisorId, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  let baseName = path.basename(originalName, ext);

  baseName = baseName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
    .substring(0, 100);

  return `${advisorId}_${baseName}${ext}`;
}

// --- MCP Server Definition ---

const server = new Server(
  { name: 'google-drive-vault', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'drive_upload',
        description: 'Upload a PDF file to the configured Google Drive folder',
        inputSchema: {
          type: 'object',
          properties: {
            fileContent: { type: 'string', description: 'Base64-encoded file content' },
            originalFileName: { type: 'string', description: 'Original file name' },
            advisorId: { type: 'string', description: 'Advisor employee ID for naming prefix' },
            folderId: { type: 'string', description: 'Google Drive folder ID' }
          },
          required: ['fileContent', 'originalFileName', 'advisorId', 'folderId']
        }
      },
      {
        name: 'drive_list',
        description: 'List PDF files in the Google Drive folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'Google Drive folder ID' },
            advisorId: { type: 'string', description: 'Filter by advisor ID prefix (optional)' }
          },
          required: ['folderId']
        }
      },
      {
        name: 'drive_get_file',
        description: 'Get file metadata and download content from Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Google Drive file ID' },
            folderId: { type: 'string', description: 'Google Drive folder ID for verification' }
          },
          required: ['fileId', 'folderId']
        }
      },
      {
        name: 'drive_delete',
        description: 'Delete a file from Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Google Drive file ID to delete' },
            folderId: { type: 'string', description: 'Google Drive folder ID for verification' }
          },
          required: ['fileId', 'folderId']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'drive_upload': {
        const { fileContent, originalFileName, advisorId, folderId } = args;
        const drive = await getDrive();
        const sanitizedName = sanitizeFileName(advisorId, originalFileName);

        const existingFiles = await drive.files.list({
          q: `name='${sanitizedName}' and '${folderId}' in parents and trashed=false`,
          fields: 'files(id, name)'
        });

        let finalName = sanitizedName;
        if (existingFiles.data.files.length > 0) {
          const ext = path.extname(sanitizedName);
          const base = path.basename(sanitizedName, ext);
          finalName = `${base}_${Date.now()}${ext}`;
        }

        const buffer = Buffer.from(fileContent, 'base64');
        const { Readable } = await import('stream');
        const stream = Readable.from(buffer);

        const response = await drive.files.create({
          requestBody: {
            name: finalName,
            parents: [folderId],
            mimeType: 'application/pdf'
          },
          media: {
            mimeType: 'application/pdf',
            body: stream
          },
          fields: 'id, name, webViewLink, createdTime, size'
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              file: {
                id: response.data.id,
                name: response.data.name,
                webViewLink: response.data.webViewLink,
                createdTime: response.data.createdTime,
                size: response.data.size
              }
            })
          }]
        };
      }

      case 'drive_list': {
        const { folderId, advisorId } = args;
        const drive = await getDrive();

        const query = `'${folderId}' in parents and trashed=false and mimeType='application/pdf'`;

        const response = await drive.files.list({
          q: query,
          fields: 'files(id, name, webViewLink, createdTime, size, modifiedTime)',
          orderBy: 'createdTime desc',
          pageSize: 100
        });

        let files = response.data.files || [];

        if (advisorId && typeof advisorId === 'string' && advisorId.trim()) {
          const normalizedAdvisorId = advisorId.trim().toLowerCase();
          const matchingFiles = files.filter((file) => {
            const fileName = (file?.name || '').toLowerCase();
            return fileName.includes(`${normalizedAdvisorId}_`);
          });

          if (matchingFiles.length > 0) {
            files = matchingFiles;
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              files
            })
          }]
        };
      }

      case 'drive_get_file': {
        const { fileId, folderId } = args;
        const drive = await getDrive();

        const metadata = await drive.files.get({
          fileId,
          fields: 'id, name, webViewLink, createdTime, size, parents'
        });

        if (!metadata.data.parents || !metadata.data.parents.includes(folderId)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: false, error: 'File not in specified folder' })
            }]
          };
        }

        const content = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' }
        );

        const base64Content = Buffer.from(content.data).toString('base64');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              file: {
                id: metadata.data.id,
                name: metadata.data.name,
                webViewLink: metadata.data.webViewLink,
                createdTime: metadata.data.createdTime,
                size: metadata.data.size
              },
              content: base64Content
            })
          }]
        };
      }

      case 'drive_delete': {
        const { fileId, folderId } = args;
        const drive = await getDrive();

        const metadata = await drive.files.get({
          fileId,
          fields: 'id, name, parents'
        });

        if (!metadata.data.parents || !metadata.data.parents.includes(folderId)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: false, error: 'File not in specified folder' })
            }]
          };
        }

        await drive.files.delete({ fileId });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deleted: { id: fileId, name: metadata.data.name }
            })
          }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
      isError: true
    };
  }
});

async function main() {
  if (!FOLDER_ID) {
    console.error('GOOGLE_DRIVE_FOLDER_ID environment variable is required');
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Google Drive] Server started successfully');
}

main().catch((err) => {
  console.error('[MCP Google Drive] Fatal error:', err);
  process.exit(1);
});
