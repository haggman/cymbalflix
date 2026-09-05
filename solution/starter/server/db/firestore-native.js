// server/db/firestore-native.js
//
// Firestore Native API access for CymbalFlix, via the Firebase Admin SDK.
//
// The rest of the server talks to Firestore Enterprise through the MongoDB
// driver (see connection.js). This module opens a second door onto the same
// database, the Firestore Native API, which is what vector search
// (findNearest) needs. Both APIs read and write the same documents.
//
// Deps: npm install firebase-admin

const admin = require('firebase-admin');

let firestore = null;

/**
 * Resolve the project ID from the environment.
 * Cloud Run gets PROJECT_ID from deployToCloudRun.sh; Cloud Shell exports
 * GOOGLE_CLOUD_PROJECT (and activate.sh sets PROJECT_ID as well).
 */
function resolveProjectId() {
  return (
    process.env.PROJECT_ID ||
    process.env.FIRESTORE_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.DEVSHELL_PROJECT_ID ||
    undefined
  );
}

/**
 * Initialize the Firebase Admin SDK against the named Enterprise database.
 * Safe to call more than once; later calls return the existing instance.
 */
function initializeFirestore() {
  if (firestore) return firestore;

  const projectId = resolveProjectId();
  const databaseId = process.env.FIRESTORE_DATABASE || 'cymbalflix-db';

  if (!admin.apps.length) {
    // With no explicit projectId the SDK falls back to Application Default
    // Credentials, which know the project on both Cloud Shell and Cloud Run.
    admin.initializeApp(projectId ? { projectId: projectId } : {});
  }

  firestore = admin.firestore();
  // settings() must run before the first read or write on this instance.
  firestore.settings({ databaseId: databaseId });

  console.log(`✓ Firestore Native API ready (database: ${databaseId})`);
  return firestore;
}

/**
 * Get the initialized Firestore instance.
 */
function getFirestore() {
  if (!firestore) {
    throw new Error('Firestore Native API not initialized. Call initializeFirestore() first.');
  }
  return firestore;
}

// ---------------------------------------------------------------------------
// Bridging the two APIs' number types.
//
// The MongoDB driver writes JavaScript integers as BSON int32. Firestore keeps
// that as a distinct 32-bit integer type, and this SDK surfaces it as a tagged
// map, { __int__: n }, rather than a JavaScript number. Two consequences:
//   - a Native query for a plain number (int64) does not match an int32 field,
//     so use int32(n) as the query value for fields the import wrote;
//   - documents read through Native carry { __int__: n } for those fields, so
//     run them through fromNative() before comparing or sending them to a client.
// Doubles and int64 values are unaffected either way.
// ---------------------------------------------------------------------------

/** Wrap a JavaScript integer as the 32-bit integer value the MongoDB driver stores. */
function int32(n) {
  return { __int__: n };
}

/** Recursively replace { __int__: n } with plain numbers; leaves vectors and other values alone. */
function fromNative(value) {
  if (Array.isArray(value)) return value.map(fromNative);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && '__int__' in value) return value.__int__;
    if (typeof value.toArray === 'function' || value.constructor !== Object) return value; // VectorValue, Timestamp, etc.
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromNative(v);
    return out;
  }
  return value;
}

module.exports = { initializeFirestore, getFirestore, int32, fromNative };
