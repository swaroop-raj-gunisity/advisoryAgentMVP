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

const SCOPES = ['https://www.googleapis.com/auth/drive'];

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
      console.log('[Google Drive] Token refreshed and saved');
    });

    return oauth2Client;
  }

  console.log('[Google Drive] No token found, starting OAuth flow...');
  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: OAUTH_KEYS_PATH,
  });

  if (client.credentials) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials, null, 2));
    console.log('[Google Drive] New token saved');
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

function resetClient() {
  driveClient = null;
}

export async function listFiles() {
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const drive = await getDrive();

  const response = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size)',
    orderBy: 'createdTime desc',
    pageSize: 100
  });

  return response.data.files || [];
}

export async function getFileContent(fileId) {
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const drive = await getDrive();

  const metadata = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, webViewLink, createdTime, size, parents'
  });

  if (!metadata.data.parents || !metadata.data.parents.includes(FOLDER_ID)) {
    throw new Error('File not in the configured vault folder');
  }

  const content = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return {
    file: metadata.data,
    content: Buffer.from(content.data).toString('base64')
  };
}

export async function uploadFile(fileBuffer, fileName) {
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const drive = await getDrive();
  const { Readable } = await import('stream');
  const stream = Readable.from(fileBuffer);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [FOLDER_ID],
      mimeType: 'application/pdf'
    },
    media: {
      mimeType: 'application/pdf',
      body: stream
    },
    fields: 'id, name, webViewLink, createdTime, size'
  });

  return response.data;
}

export async function deleteFile(fileId) {
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const drive = await getDrive();

  const metadata = await drive.files.get({
    fileId,
    fields: 'id, name, parents'
  });

  if (!metadata.data.parents || !metadata.data.parents.includes(FOLDER_ID)) {
    throw new Error('File not in the configured vault folder');
  }

  await drive.files.delete({ fileId });
  return { id: fileId, name: metadata.data.name };
}

export async function testConnection() {
  if (!FOLDER_ID) {
    return { success: false, error: 'GOOGLE_DRIVE_FOLDER_ID not configured' };
  }

  try {
    const drive = await getDrive();
    const folder = await drive.files.get({
      fileId: FOLDER_ID,
      fields: 'id, name'
    });

    const files = await listFiles();

    return {
      success: true,
      folder: folder.data,
      fileCount: files.length,
      files: files.map(f => ({ id: f.id, name: f.name, size: f.size }))
    };
  } catch (err) {
    resetClient();
    return { success: false, error: err.message };
  }
}
