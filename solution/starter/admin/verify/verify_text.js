// After Task 7.1: text index exists and a $text query returns relevance-ranked results through the MongoDB API.
const { conn, ok, bad, info, done } = require('./_common');
(async () => {
  try {
    const { db } = await conn.connect();
    const movies = db.collection('movies');
    const idx = await movies.indexes();
    const textIdx = idx.find(i => i.name === 'movie_text_search' || Object.values(i.key || {}).includes('text'));
    textIdx ? ok(`text index present: ${textIdx.name}`) : bad('no text index on movies (Task 7.1)');
    const t0 = Date.now();
    const rows = await movies.find({ $text: { $search: 'space alien adventure' } }, { projection: { title: 1, score: { $meta: 'textScore' } } })
      .sort({ score: { $meta: 'textScore' }, averageRating: -1 }).limit(5).toArray();
    rows.length > 0 ? ok(`$text query returned ${rows.length} results in ${Date.now() - t0} ms`) : bad('$text query returned no results (index still building?)');
    rows.forEach(r => info(`${(r.score ?? 0).toFixed ? r.score.toFixed(2) : r.score}  ${r.title}`));
  } catch (e) { bad('text check threw: ' + e.message); }
  await done();
})();
