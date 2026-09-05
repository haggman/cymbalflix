// After Task 5.6: proves whether writes reach a Firestore Native onSnapshot listener.
// Two writers are tried: an independent Native client (separate app instance, no shared cache)
// and the MongoDB driver. The pair tells you whether push works at all, and whether it is
// cross-API. Task 5's home-page-to-demo-page story depends on the MongoDB write arriving.
const { conn, ok, bad, info, done, projectId, databaseId, starterRequire } = require('./_common');
const MARKER = 999998;   // movieId used only by this test
const TAG = 'verify-realtime';   // string field: both APIs agree on strings, unlike int32 vs int64
const WAIT_MS = 30000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let unsubscribe = () => {};
  try {
    const { initializeApp } = starterRequire('firebase/app');
    const fs = starterRequire('firebase/firestore');
    const cfg = { projectId: projectId() };
    const listenerApp = initializeApp(cfg, 'listener');
    const writerApp   = initializeApp(cfg, 'writer');      // separate client: no shared local cache
    const ldb = fs.initializeFirestore(listenerApp, {}, databaseId());
    const wdb = fs.initializeFirestore(writerApp, {}, databaseId());
    const q = fs.query(fs.collection(ldb, 'ratings'), fs.where('tag', '==', TAG));

    // Track what the listener has seen from the server, keyed by userId of the marker docs.
    const seenFromServer = new Set();
    let initialDone = false, snaps = 0;
    const t0 = Date.now();
    unsubscribe = fs.onSnapshot(q, (snap) => {
      snaps++;
      if (!initialDone) { initialDone = true; info(`initial snapshot: ${snap.size} marker docs (${Date.now() - t0} ms)`); return; }
      if (snap.metadata.hasPendingWrites) return;                 // local echo, ignore
      seenFromServer.clear();
      snap.forEach(d => { const u = d.data().userId; seenFromServer.add((u && typeof u === 'object' && '__int__' in u) ? u.__int__ : u); });
      info(`server snapshot #${snaps}: userIds=[${[...seenFromServer].join(',')}] (${Date.now() - t0} ms)`);
    }, (err) => bad('listener error: ' + err.code + ' ' + err.message));

    await sleep(3000);
    if (!initialDone) { bad('no initial snapshot in 3 s (rules not published? listener blocked?)'); return done(); }

    const { db } = await conn.connect();
    const ratings = db.collection('ratings');
    await ratings.deleteMany({ tag: TAG });
    await sleep(1500);

    const waitFor = async (pred, label) => {
      const t = Date.now();
      while (!pred() && Date.now() - t < WAIT_MS) await sleep(250);
      return pred() ? (ok(`${label} in ${Date.now() - t} ms`), true) : (bad(`${label}: not seen in ${WAIT_MS / 1000} s`), false);
    };

    // 1. Native write from an independent client (userId 1)
    info('writing a marker rating through the Firestore Native API (second client)...');
    const nativeRef = await fs.addDoc(fs.collection(wdb, 'ratings'),
      { userId: 1, movieId: MARKER, rating: 5, tag: TAG, timestamp: Math.floor(Date.now() / 1000) });
    const nativeOk = await waitFor(() => seenFromServer.has(1), 'listener saw the Native-API write');

    // 2. MongoDB write (userId 2)
    info('writing a marker rating through the MongoDB driver...');
    await ratings.insertOne({ userId: 2, movieId: MARKER, rating: 5, tag: TAG, timestamp: Math.floor(Date.now() / 1000) });
    const mongoOk = await waitFor(() => seenFromServer.has(2), 'listener saw the MongoDB write');

    // Is the MongoDB write at least visible to a one-time Native read?
    const once = await fs.getDocs(fs.query(fs.collection(wdb, 'ratings'), fs.where('tag', '==', TAG)));
    const onceIds = once.docs.map(d => { const u = d.data().userId; return (u && typeof u === 'object' && '__int__' in u) ? u.__int__ : u; }).sort();
    onceIds.includes(2) ? ok(`one-time Native getDocs sees the MongoDB write (userIds ${onceIds.join(',')})`)
                        : bad(`one-time Native getDocs does NOT see the MongoDB write (userIds ${onceIds.join(',')})`);

    if (nativeOk && !mongoOk) info('VERDICT: push works, but only for writes made through the Firestore API. Cross-API changes do not stream.');
    if (!nativeOk && !mongoOk) info('VERDICT: no server push at all on this database.');
    if (nativeOk && mongoOk) info('VERDICT: cross-API real-time push works.');

    // cleanup
    await ratings.deleteMany({ tag: TAG });
    try { await fs.deleteDoc(nativeRef); } catch (_) {}
  } catch (e) { bad('realtime check threw: ' + e.message); }
  unsubscribe();
  await done();
})();
