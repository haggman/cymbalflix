// server/db/connection.js
// Deps (see install commands below):
//   mongodb >= 6.7 (tested on 6.9.x)
//   google-auth-library >= 10

const { MongoClient } = require('mongodb');
const { GoogleAuth } = require('google-auth-library');

let client = null;
let db = null;

function getUri() {
  const host = process.env.FIRESTORE_HOST;      // e.g. 54a0e60e-...us-east4.firestore.goog
  const database = process.env.FIRESTORE_DATABASE || 'cymbalflix-db';
  if (!host) throw new Error('FIRESTORE_HOST is required (UID.LOCATION.firestore.goog)');
  return (
    `mongodb://${host}:443/${database}` +
    `?loadBalanced=true&tls=true&retryWrites=false` +
    `&authMechanism=MONGODB-OIDC` +
    `&authMechanismProperties=TOKEN_RESOURCE:FIRESTORE`
  );
}

async function makeClient() {
  const uri = getUri();

  // Get Google access token via ADC (works in Cloud Shell).
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
  const adc = await auth.getClient();

  const OIDC_CALLBACK = async () => {
    const res = await adc.getAccessToken();
    const token = typeof res === 'string' ? res : res?.token;
    if (!token) throw new Error('Failed to obtain Google access token from ADC');
    return { accessToken: token, expiresInSeconds: 300 };
  };

  // IMPORTANT: allow Firestore hosts for OIDC
  // You can list wildcards and/or the exact host. Do NOT include ports here.
  const allowedHosts = [
    '*.firestore.goog',
    (process.env.FIRESTORE_HOST || '').split(':')[0] // exact host without :443
  ].filter(Boolean);

  return new MongoClient(uri, {
    authMechanismProperties: {
      OIDC_CALLBACK,
      ALLOWED_HOSTS: allowedHosts
    }
  });
}

async function connect() {
  if (client && db) return { client, db };
  client = await makeClient();
  await client.connect();
  db = client.db(process.env.FIRESTORE_DATABASE || 'cymbalflix-db');
  return { client, db };
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connect, getDb, close };
