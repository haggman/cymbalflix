/**
 * CymbalFlix Real-time Features
 * Uses Firestore Native API for real-time sync and offline support
 */

import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection,
  onSnapshot,
  persistentLocalCache,
  disableNetwork,
  enableNetwork,
  waitForPendingWrites,
  addDoc
} from 'firebase/firestore';

let db = null;
let unsubscribeFunctions = [];
let isOfflineMode = false;

/**
 * Initialize Firebase with Firestore Enterprise database
 */
export async function initializeFirebase(projectId, databaseId) {
  console.log('🔥 Connecting to Firestore Enterprise...');
  
  const app = initializeApp({ projectId });
  
  // Connect to the named Enterprise database with offline persistence
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({})
  }, databaseId);
  
  console.log('✅ Connected to database:', databaseId);
  console.log('✅ Offline persistence enabled');
  return db;
}

/**
 * Subscribe to live counts for movies, ratings, and tags; returns an unsubscribe function
 */
export function subscribeToStats(onStatsUpdate) {
  if (!db) throw new Error('Firebase not initialized');
  
  const stats = { movies: 0, ratings: 0, tags: 0, users: 0 };
  
  // Fetch users count once from API (not real-time)
  fetch('/api/stats')
    .then(r => r.json())
    .then(data => {
      stats.users = data.users || 0;
      onStatsUpdate({ ...stats }, 'users');
    })
    .catch(err => console.warn('Could not fetch user count:', err));
  
  // Real-time listener for movies
  const unsubMovies = onSnapshot(
    collection(db, 'movies'),
    (snapshot) => {
      stats.movies = snapshot.size;
      onStatsUpdate({ ...stats }, 'movies');
    }
  );
  
  // Real-time listener for ratings
  const unsubRatings = onSnapshot(
    collection(db, 'ratings'),
    (snapshot) => {
      stats.ratings = snapshot.size;
      onStatsUpdate({ ...stats }, 'ratings');
    }
  );
  
  // Real-time listener for tags
  const unsubTags = onSnapshot(
    collection(db, 'tags'),
    (snapshot) => {
      stats.tags = snapshot.size;
      onStatsUpdate({ ...stats }, 'tags');
    }
  );
  
  unsubscribeFunctions = [unsubMovies, unsubRatings, unsubTags];
  console.log('📊 Real-time stats active');
  
  return () => unsubscribeFunctions.forEach(fn => fn());
}

/**
 * Submit a rating using Firestore Native API
 * This write will be queued when offline and synced when back online
 */
export async function submitRating(movieId, userId, rating) {
  if (!db) throw new Error('Firebase not initialized');
  
  const ratingsCollection = collection(db, 'ratings');
  
  await addDoc(ratingsCollection, {
    movieId: parseInt(movieId),
    userId: parseInt(userId),
    rating: parseFloat(rating),
    timestamp: Math.floor(Date.now() / 1000)
  });
  
  console.log(`✅ Rating submitted: User ${userId} rated movie ${movieId} with ${rating} stars`);
}

/**
 * Toggle offline mode for demonstration
 */
export async function toggleOffline() {
    if (!db) throw new Error('Firebase not initialized');

    if (isOfflineMode) {
        await enableNetwork(db);
        isOfflineMode = false;
        console.log('🌐 Back online');
    } else {
        await disableNetwork(db);
        isOfflineMode = true;
        console.log('✈️ Offline mode');
    }
    return isOfflineMode;
}

/**
 * Resolve once every write queued while offline has been acknowledged by the server.
 * This is the receipt for "syncing...": the SDK reports the queue as empty only after
 * Firestore has committed each write, not merely after it has been sent.
 */
export async function waitForSync() {
    if (!db) throw new Error('Firebase not initialized');
    await waitForPendingWrites(db);
    console.log('✅ All pending writes acknowledged by the server');
}

export function isOffline() { return isOfflineMode; }
export function cleanup() {
    unsubscribeFunctions.forEach(fn => fn());
}