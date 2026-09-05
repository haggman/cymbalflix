// After Task 5.6: proves a write through the MongoDB API reaches a Firestore Native onSnapshot listener.
// This is the dual-API + realtime_updates_mode claim of Task 5, tested without a browser.
const { conn, ok, bad, info, done, projectId, databaseId } = require('./_common');
const MARKER = 999998;   // movieId used only by this test
(async () => {
  let unsubscribe = () => {};
  try {
    const { initializeApp } = await import('firebase/app');
    const fs = await import('firebase/firestore');
    const app = initializeApp({ projectId: projectId() });
    const fdb = fs.initializeFirestore(app, {}, databaseId());
    const q = fs.query(fs.collection(fdb, 'ratings'), fs.where('movieId', '==', MARKER));

    let seen = 0, gotServerDoc = false, gotServerRemoval = false, initialDone = false;
    const t0 = Date.now();
    unsubscribe = fs.onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      seen++;
      if (!initialDone) { initialDone = true; info(`initial snapshot: ${snap.size} marker docs (${Date.now() - t0} ms)`); return; }
      const fromServer = !snap.metadata.hasPendingWrites;
      if (snap.size > 0 && fromServer) gotServerDoc = true;
      if (snap.size === 0 && fromServer && gotServerDoc) gotServerRemoval = true;
      info(`snapshot #${seen}: size=${snap.size} fromServer=${fromServer} (${Date.now() - t0} ms)`);
    }, (err) => bad('listener error: ' + err.code + ' ' + err.message));

    await new Promise(r => setTimeout(r, 3000));
    if (!initialDone) { bad('no initial snapshot in 3 s (rules not published? listener blocked?)'); await done(); }

    const { db } = await conn.connect();
    const ratings = db.collection('ratings');
    await ratings.deleteMany({ movieId: MARKER });
    info('inserting a marker rating through the MongoDB driver...');
    await ratings.insertOne({ userId: 1, movieId: MARKER, rating: 5, timestamp: Math.floor(Date.now() / 1000) });
    const t1 = Date.now();
    while (!gotServerDoc && Date.now() - t1 < 15000) await new Promise(r => setTimeout(r, 250));
    gotServerDoc ? ok(`Native listener saw the MongoDB insert in ${Date.now() - t1} ms`) : bad('Native listener never saw the MongoDB insert (15 s). Check realtimeUpdatesMode on the database.');

    info('deleting the marker rating through the MongoDB driver...');
    await ratings.deleteMany({ movieId: MARKER });
    const t2 = Date.now();
    while (!gotServerRemoval && Date.now() - t2 < 15000) await new Promise(r => setTimeout(r, 250));
    gotServerRemoval ? ok(`Native listener saw the MongoDB delete in ${Date.now() - t2} ms`) : bad('Native listener never saw the MongoDB delete (15 s)');
  } catch (e) { bad('realtime check threw: ' + e.message); }
  unsubscribe();
  await done();
})();
