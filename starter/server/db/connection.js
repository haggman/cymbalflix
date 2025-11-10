// server/db/connection.js
// Deps: npm i mongodb@^6.9 google-auth-library@^10
const { MongoClient } = require('mongodb');
const { GoogleAuth } = require('google-auth-library');

let client = null;
let db = null;

function getUri() {
  const host = process.env.FIRESTORE_HOST;                 // e.g. 54a0e60e-...us-east4.firestore.goog
  const database = process.env.FIRESTORE_DATABASE;         // set this explicitly via env
  if (!host) throw new Error('FIRESTORE_HOST is required (UID.LOCATION.firestore.goog)');
  if (!database) throw new Error('FIRESTORE_DATABASE is required');

  return (
    `mongodb://${host}:443/${database}` +
    `?loadBalanced=true&tls=true&retryWrites=false` +
    `&authMechanism=MONGODB-OIDC` +
    `&authMechanismProperties=TOKEN_RESOURCE:FIRESTORE`
  );
}

// Decide how to auth:
// - In Cloud Run: use ENVIRONMENT:gcp (metadata server present)
// - Else (Cloud Shell/local): use OIDC callback with ADC
function shouldUseGcpMetadata() {
  // Cloud Run sets K_SERVICE; allow override via FIRESTORE_AUTH_MODE
  if (process.env.FIRESTORE_AUTH_MODE === 'gcp') return true;
  if (process.env.FIRESTORE_AUTH_MODE === 'callback') return false;
  return !!process.env.K_SERVICE; // true on Cloud Run, false in Cloud Shell
}

async function makeClient() {
  const uri = getUri();

  // Required so the driver allows non-Atlas hosts
  const allowedHosts = [
    '*.firestore.goog',
    (process.env.FIRESTORE_HOST || '').split(':')[0]
  ].filter(Boolean);

  if (shouldUseGcpMetadata()) {
    // Cloud Run (or forced gcp mode): let the driver hit metadata server
    return new MongoClient(uri, {
      authMechanismProperties: {
        ENVIRONMENT: 'gcp',
        ALLOWED_HOSTS: allowedHosts,
        // TOKEN_RESOURCE is already in the URI
      },
    });
  } else {
    // Cloud Shell/local dev: provide OIDC token via callback using ADC
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
    const adc = await auth.getClient();

    const OIDC_CALLBACK = async () => {
      const res = await adc.getAccessToken();
      const token = typeof res === 'string' ? res : res?.token;
      if (!token) throw new Error('Failed to obtain Google access token from ADC');
      return { accessToken: token, expiresInSeconds: 300 };
    };

    return new MongoClient(uri, {
      authMechanismProperties: {
        OIDC_CALLBACK,
        ALLOWED_HOSTS: allowedHosts,
      },
    });
  }
}

async function connect() {
  if (client && db) return { client, db };
  client = await makeClient();
  await client.connect();
  db = client.db(process.env.FIRESTORE_DATABASE);
  return { client, db };
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  if (client) {
    await client.close();
    client = null; db = null;
  }
}

module.exports = { connect, getDb, close };
