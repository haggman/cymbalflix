// server/db/import_embeddings.js
//
// Attach a pre-generated Gemini embedding to every movie document.
//
// Reads embeddings.csv (columns: movieId, embedding) where embedding is a JSON
// array of 1536 floats, and writes each one to the matching movie document as
// a Firestore Vector value using the Firestore Native API. The vector index
// created in Task 6 only recognizes fields stored as FieldValue.vector(),
// which the MongoDB driver can't produce, so this script uses firebase-admin.
//
// Usage (from ~/cymbalflix/starter, after `gcloud storage cp gs://class-demo/embeddings.csv .`):
//   node server/db/import_embeddings.js [path/to/embeddings.csv]
//
// Deps: npm install firebase-admin   (csv-parse and cli-progress are already in package.json)

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const cliProgress = require('cli-progress');
const { FieldValue } = require('firebase-admin/firestore');
const { initializeFirestore } = require('./firestore-native');

const EMBEDDINGS_FILE = path.resolve(process.argv[2] || 'embeddings.csv');
const EXPECTED_DIMENSION = 1536;
const BATCH_SIZE = 400;          // writes per committed batch
const MAX_RETRIES = 5;

function fmt(n) {
  return n.toLocaleString('en-US');
}

/**
 * Commit a batch, retrying on transient contention errors.
 */
async function commitWithRetry(batch, attempt = 1) {
  try {
    await batch.commit();
  } catch (err) {
    const code = err && err.code;
    const transient = code === 10 || code === 4 || code === 14 || /ABORTED|DEADLINE|UNAVAILABLE|contention/i.test(String(err.message));
    if (transient && attempt < MAX_RETRIES) {
      const wait = 500 * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, wait));
      return commitWithRetry(batch, attempt + 1);
    }
    throw err;
  }
}

/**
 * Build a movieId -> document reference map so each embedding can be written
 * straight to its document without a query per row.
 */
async function loadMovieRefs(firestore) {
  console.log('Loading movie document IDs...');
  const snapshot = await firestore.collection('movies').select('movieId').get();
  const refs = new Map();
  snapshot.forEach(doc => {
    const movieId = doc.get('movieId');
    if (movieId !== undefined && movieId !== null) {
      refs.set(Number(movieId), doc.ref);
    }
  });
  console.log(`Found ${fmt(refs.size)} movies in Firestore.`);
  return refs;
}

async function importEmbeddings() {
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error(`Embeddings file not found: ${EMBEDDINGS_FILE}`);
    console.error('Download it first: gcloud storage cp gs://class-demo/embeddings.csv .');
    process.exit(1);
  }

  const firestore = initializeFirestore();
  const movieRefs = await loadMovieRefs(firestore);

  console.log(`Reading ${EMBEDDINGS_FILE} ...`);
  const parser = fs.createReadStream(EMBEDDINGS_FILE).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true })
  );

  const progressBar = new cliProgress.SingleBar(
    { format: 'Importing embeddings |{bar}| {percentage}% | {value}/{total} rows' },
    cliProgress.Presets.shades_classic
  );
  let barStarted = false;

  let processed = 0;
  let updated = 0;
  let missingMovie = 0;
  let badVector = 0;

  let batch = firestore.batch();
  let batchCount = 0;

  for await (const row of parser) {
    if (!barStarted) {
      progressBar.start(movieRefs.size, 0);
      barStarted = true;
    }
    processed++;

    const movieId = Number(row.movieId);
    const raw = row.embedding !== undefined ? row.embedding : row.embeddings;

    let embedding;
    try {
      embedding = JSON.parse(raw);
    } catch (e) {
      badVector++;
      continue;
    }
    if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIMENSION) {
      badVector++;
      continue;
    }

    const docRef = movieRefs.get(movieId);
    if (!docRef) {
      missingMovie++;
      continue;
    }

    // FieldValue.vector() stores the array as a Firestore Vector type, which is
    // what the vector index (and findNearest) operate on.
    batch.update(docRef, { embedding: FieldValue.vector(embedding) });
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await commitWithRetry(batch);
      progressBar.update(Math.min(updated, movieRefs.size));
      batch = firestore.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await commitWithRetry(batch);
  }
  if (barStarted) {
    progressBar.update(Math.min(updated, movieRefs.size));
    progressBar.stop();
  }

  console.log('');
  console.log('========================================');
  console.log('🎉 Embedding import completed!');
  console.log('========================================');
  console.log(`Total embeddings processed: ${fmt(processed)}`);
  console.log(`Movies updated: ${fmt(updated)}`);
  if (missingMovie) console.log(`Rows with no matching movie: ${fmt(missingMovie)}`);
  if (badVector) console.log(`Rows skipped (bad or wrong-size vector): ${fmt(badVector)}`);
  console.log('');
  console.log('Next: make sure the vector index shows STATE: READY, then test /api/search/similar/912');
}

importEmbeddings()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\nEmbedding import failed:', err);
    process.exit(1);
  });
