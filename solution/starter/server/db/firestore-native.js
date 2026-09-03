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

module.exports = { initializeFirestore, getFirestore };
