// After Task 6.3: embeddings present, and findNearest() returns sensible neighbours through the Native API.
const { conn, ok, bad, info, done, projectId, databaseId, starterRequire } = require('./_common');
(async () => {
  try {
    const admin = starterRequire('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: projectId() });
    const f = admin.firestore(); f.settings({ databaseId: databaseId() });
    const movies = f.collection('movies');
    const ref = await movies.where('movieId', '==', 912).limit(1).get();   // Casablanca
    if (ref.empty) { bad('movieId 912 (Casablanca) not found'); return done(); }
    const m = ref.docs[0].data();
    if (!m.embedding) { bad('Casablanca has no embedding field (Task 6.1 import not done?)'); return done(); }
    const dim = (m.embedding.toArray ? m.embedding.toArray() : m.embedding).length;
    dim === 1536 ? ok(`embedding is a 1536-d vector`) : bad(`embedding dimension ${dim} (expected 1536)`);
    const t0 = Date.now();
    const snap = await movies.findNearest('embedding', m.embedding, { limit: 6, distanceMeasure: 'EUCLIDEAN' }).get();
    const titles = snap.docs.map(d => d.data().title);
    snap.size === 6 ? ok(`findNearest returned ${snap.size} results in ${Date.now() - t0} ms`) : bad(`findNearest returned ${snap.size} results`);
    titles[0] === m.title ? ok('nearest neighbour is Casablanca itself') : info(`first result was ${titles[0]}`);
    info('neighbours: ' + titles.slice(1).join(' | '));
  } catch (e) { bad('vector check threw: ' + e.message + (/index/i.test(e.message) ? '  (vector index READY?)' : '')); }
  await done();
})();
