import { authenticate } from '@google-cloud/local-auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OAUTH_KEYS_PATH = path.resolve(__dirname, 'sourceData', 'gcp-oauth.keys.json');
const TOKEN_PATH = path.resolve(__dirname, 'sourceData', '.gcp-token.json');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function main() {
  console.log('Starting Google OAuth flow with full Drive scope...');
  console.log('A browser window will open. Please authorize the app.\n');

  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
    console.log('Deleted old token (had restricted drive.file scope).');
  }

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: OAUTH_KEYS_PATH,
  });

  if (client.credentials) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials, null, 2));
    console.log('\nNew token saved with full Drive scope!');
    console.log('Token path:', TOKEN_PATH);
    console.log('Scope:', client.credentials.scope || SCOPES.join(' '));
    console.log('\nYou can now start the server: npm run server');
  } else {
    console.error('No credentials received.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Auth failed:', err.message);
  process.exit(1);
});
