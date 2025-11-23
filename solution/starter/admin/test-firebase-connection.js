#!/usr/bin/env node
/**
 * Firestore Native API Connection Test (Client-style, Read-only)
 *
 * Tests the Firebase SDK connection to Firestore Enterprise to validate:
 * 1. Firebase initialization with named database
 * 2. Reading data via Firestore Native API
 * 3. Real-time listener functionality (read-only)
 * 4. Aggregate count query
 *
 * Designed to mimic a standard web app using the Firebase JS SDK
 * with anonymous access (no Firebase Auth).
 *
 * Usage:
 *   node admin/test-firebase-connection.js
 *
 * Prerequisites:
 *   npm install firebase
 *   (or: npm install firebase@eap-firestore-pipelines)
 *
 * Environment variables (from .env or shell):
 *   PROJECT_ID or GOOGLE_CLOUD_PROJECT - Your GCP project ID
 *   FIRESTORE_DATABASE - Database name (default: cymbalflix-db or (default))
 */

require('dotenv').config();

// We'll use dynamic import for the Firebase ES modules
async function runTests() {
  console.log('\n========================================');
  console.log('🔥 Firestore Native API Connection Test (Read-only)');
  console.log('========================================\n');

  // Get configuration
  const projectId =
    process.env.PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE || 'cymbalflix-db';

  if (!projectId) {
    console.error('❌ ERROR: PROJECT_ID not set');
    console.log('\nSet it with:');
    console.log('  export PROJECT_ID=$(gcloud config get-value project)');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Project ID:  ${projectId}`);
  console.log(`  Database:    ${databaseId}`);
  console.log('');

  // Dynamically import Firebase (it's an ES module)
  console.log('📦 Loading Firebase SDK...');
  let firebase;
  try {
    firebase = await import('firebase/app');
    console.log('✅ Firebase SDK loaded');
  } catch (error) {
    console.error('❌ Failed to load Firebase SDK');
    console.error('   Make sure firebase is installed:');
    console.error('   npm install firebase');
    console.error('   (or: npm install firebase@eap-firestore-pipelines)');
    console.error('\n   Error:', error.message);
    process.exit(1);
  }

  // Import Firestore
  let firestore;
  try {
    firestore = await import('firebase/firestore');
    console.log('✅ Firestore module loaded');
  } catch (error) {
    console.error('❌ Failed to load Firestore module');
    console.error('   Error:', error.message);
    process.exit(1);
  }

  // Test 1: Initialize Firebase App
  console.log('\n--- Test 1: Initialize Firebase App ---');
  let app;
  try {
    app = firebase.initializeApp({ projectId });
    console.log('✅ Firebase app initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase app');
    console.error('   Error:', error.message);
    process.exit(1);
  }

  // Test 2: Initialize Firestore with named database
  console.log('\n--- Test 2: Connect to Named Database ---');
  let db;
  try {
    // For named databases, this may need to be adjusted depending on SDK version.
    // If you hit NOT_FOUND and know the default database is correct, try:
    //   db = firestore.initializeFirestore(app, {});
    db = firestore.initializeFirestore(app, {}, databaseId);
    console.log(`✅ Firestore initialized with database: ${databaseId}`);
  } catch (error) {
    console.error('❌ Failed to initialize Firestore');
    console.error('   This might mean:');
    console.error('   - The database does not exist');
    console.error('   - Named database support is not available in this SDK version');
    console.error('   - Authentication/permission issues');
    console.error('\n   Error:', error.message);
    process.exit(1);
  }

  // Test 3: Read data from a collection (movies)
  console.log('\n--- Test 3: Read Collection Data (movies) ---');
  try {
    const moviesRef = firestore.collection(db, 'movies');
    const snapshot = await firestore.getDocs(
      firestore.query(moviesRef, firestore.limit(5))
    );

    console.log(
      `✅ Successfully read ${snapshot.size} documents from 'movies' collection`
    );

    if (snapshot.size > 0) {
      console.log('\n   Sample movie titles:');
      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`   - ${data.title || 'Unknown'}`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to read from collection');
    console.error('   This might mean:');
    console.error('   - Authentication/permission issues (security rules)');
    console.error('   - The collection does not exist');
    console.error('   - Network connectivity issues');
    console.error('\n   Error:', error.message);
    console.error('   Code:', error.code);
    // Don't exit - continue with other tests
  }

  // Test 4: Real-time listener (ratings, read-only)
  console.log('\n--- Test 4: Real-time Listener on ratings (5 second test) ---');
  try {
    const ratingsRef = firestore.collection(db, 'ratings');
    let updateCount = 0;

    console.log('   Listening for changes on ratings collection (limit 1)...');

    const unsubscribe = firestore.onSnapshot(
      firestore.query(ratingsRef, firestore.limit(1)),
      (snapshot) => {
        updateCount++;
        if (updateCount === 1) {
          console.log(
            `✅ Real-time listener working! Received initial snapshot with ${snapshot.size} document(s).`
          );
        } else {
          console.log(`   📢 Received update #${updateCount}`);
        }
      },
      (error) => {
        console.error('❌ Real-time listener error:', error.message);
      }
    );

    // Wait 5 seconds for any updates / initial snapshot
    await new Promise((resolve) => setTimeout(resolve, 5000));
    unsubscribe();
    console.log(`   Listener stopped. Received ${updateCount} snapshot(s).`);
  } catch (error) {
    console.error('❌ Failed to set up real-time listener');
    console.error('   Error:', error.message);
  }

  // Test 5: Count documents (aggregate query)
  console.log('\n--- Test 5: Aggregate Query (Count movies) ---');
  try {
    const moviesRef = firestore.collection(db, 'movies');
    const countSnapshot = await firestore.getCountFromServer(moviesRef);
    const count = countSnapshot.data().count;
    console.log(`✅ Count query successful: ${count} movies in database`);
  } catch (error) {
    console.error('❌ Count query failed');
    console.error('   This feature may not be available in all SDK versions');
    console.error('   Or your security rules may block it');
    console.error('   Error:', error.message);
  }

  // Summary
  console.log('\n========================================');
  console.log('📊 Test Summary (Client-style, read-only)');
  console.log('========================================');
  console.log('If all tests passed (✅), your client-style access supports:');
  console.log('- Connecting to the named Firestore database');
  console.log('- Reading from the movies collection');
  console.log('- Listening to real-time updates from ratings');
  console.log('- Running aggregate count queries on movies');
  console.log('');
  console.log('If any tests failed (❌), check:');
  console.log('- Firestore security rules (most likely for permission-denied)');
  console.log('- Database name and project ID');
  console.log('- Firestore Native vs Enterprise DB configuration');
  console.log('- Network connectivity');
  console.log('========================================\n');

  // Clean exit
  process.exit(0);
}

// Run the tests
runTests().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
