// Cross-API number typing: does a Native query find integers written by the MongoDB driver?
// MongoDB encodes JS integers as BSON int32; Firestore Native queries use 64-bit integers.
const { conn, ok, bad, info, done, projectId, databaseId, starterRequire } = require('./_common');
const MARKER = 999997;
(async () => {
  try {
    const { initializeApp } = starterRequire('firebase/app');
    const fs = starterRequire('firebase/firestore');
    const { Long, Double, Int32 } = starterRequire('mongodb');
    const app = initializeApp({ projectId: projectId() }, 'numbers');
    const fdb = fs.initializeFirestore(app, {}, databaseId());
    const { db } = await conn.connect();
    const ratings = db.collection('ratings');
    await ratings.deleteMany({ movieId: { $in: [MARKER, Long.fromNumber(MARKER), new Double(MARKER)] } });

    info('inserting three marker docs via MongoDB: plain JS number, Long (int64), Double');
    await ratings.insertMany([
      { userId: 11, movieId: MARKER,                  rating: 5, timestamp: 0 },   // BSON int32
      { userId: 12, movieId: Long.fromNumber(MARKER), rating: 5, timestamp: 0 },   // BSON int64
      { userId: 13, movieId: new Double(MARKER),      rating: 5, timestamp: 0 },   // BSON double
    ]);
    const back = await ratings.find({ movieId: MARKER }).project({ userId: 1, _id: 0 }).toArray();
    info(`MongoDB equality query { movieId: ${MARKER} } finds userIds [${back.map(r => r.userId).sort().join(',')}]`);

    const nativeQuery = async (label, value) => {
      const snap = await fs.getDocs(fs.query(fs.collection(fdb, 'ratings'), fs.where('movieId', '==', value)));
      const ids = snap.docs.map(d => d.data().userId).sort();
      info(`Native where('movieId','==', ${label}) finds userIds [${ids.join(',')}]`);
      return ids;
    };
    const plain = await nativeQuery('999997 (JS number, int64)', MARKER);
    let i32 = null;
    if (typeof fs.int32 === 'function') i32 = await nativeQuery('int32(999997)', fs.int32(MARKER));
    else info('this firebase SDK has no int32() helper');

    // Read the raw values back through Native to see how each is typed
    const all = await fs.getDocs(fs.query(fs.collection(fdb, 'ratings'), fs.where('userId', 'in', [11, 12, 13])));
    all.forEach(d => { const v = d.data().movieId; info(`userId ${d.data().userId}: movieId is ${typeof v === 'object' ? v.constructor.name + ' ' + JSON.stringify(v) : typeof v + ' ' + v}`); });
    if (all.size === 0) info('(the userId "in" query found none of the three; userId is also int32 from MongoDB, which is consistent with the hypothesis)');

    if (plain.includes(11)) ok('Native int64 query matches a MongoDB int32 write');
    else bad('Native int64 query does NOT match a MongoDB int32 write (plain JS numbers from the driver)');
    if (plain.includes(12)) ok('Native int64 query matches a MongoDB Long (int64) write');
    else bad('Native int64 query does NOT match a MongoDB Long (int64) write');
    if (plain.includes(13)) ok('Native int64 query matches a MongoDB Double write'); else info('Native int64 query does not match a MongoDB Double write');
    if (i32) { i32.includes(11) ? ok('Native int32() query matches the MongoDB int32 write') : bad('Native int32() query does not match the MongoDB int32 write'); }

    await ratings.deleteMany({ userId: { $in: [11, 12, 13] } });
  } catch (e) { bad('numbers check threw: ' + e.message); }
  await done();
})();
