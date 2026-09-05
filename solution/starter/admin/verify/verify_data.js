// After Task 1.3 (import) and again after Task 3.5 (summaries): counts, fields, indexes via the MongoDB API.
const { conn, ok, bad, info, done } = require('./_common');
(async () => {
  try {
    const { db } = await conn.connect();
    const expect = { movies: [9700, 9800], ratings: [100000, 101500], tags: [3600, 3800], links: [9700, 9800] };
    for (const [name, [lo, hi]] of Object.entries(expect)) {
      const n = await db.collection(name).countDocuments();
      (n >= lo && n <= hi) ? ok(`${name}: ${n.toLocaleString()} documents`) : bad(`${name}: ${n.toLocaleString()} documents (expected ${lo}-${hi})`);
    }
    const withSummary = await db.collection('movies').countDocuments({ summary: { $exists: true, $ne: '' } });
    withSummary > 9000 ? ok(`movies with summary: ${withSummary.toLocaleString()} (Task 3.5 done)`) : info(`movies with summary: ${withSummary.toLocaleString()} (0 is expected before Task 3.5)`);
    const withEmbedding = await db.collection('movies').countDocuments({ embedding: { $exists: true } });
    info(`movies with embedding: ${withEmbedding.toLocaleString()} (0 is expected before Task 6.1)`);
    const alien = await db.collection('movies').countDocuments({ title: 'Alien (1979)' });
    alien === 1 ? ok('exactly one Alien (1979)') : info(`Alien (1979) count = ${alien} (2 is expected between Tasks 3.13 and 3.14)`);
    const idx = await db.collection('movies').indexes();
    const names = idx.map(i => JSON.stringify(i.key)).join(' ');
    info(`movies indexes: ${names}`);
    names.includes('"movieId":1') ? ok('movieId index present') : bad('movieId index missing');
    names.includes('"averageRating":-1') ? ok('averageRating DESC index present') : info('averageRating DESC index missing (expected between Task 4.2 and 4.5)');
  } catch (e) { bad('data check threw: ' + e.message); }
  await done();
})();
