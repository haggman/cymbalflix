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
  enableNetwork
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
 * Subscribe to real-time stats updates
 * Note: Users count is fetched once from API since calculating unique users
 * from 100k+ ratings in real-time is impractical
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

export function isOffline() { return isOfflineMode; }
export function cleanup() {
    unsubscribeFunctions.forEach(fn => fn());
}