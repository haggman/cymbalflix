// server/db/update_summaries.js
const fs = require('fs');
const { parse } = require('csv-parse');
const { getDb, connect, close } = require('./connection');
const cliProgress = require('cli-progress');

const BATCH_SIZE = 500;

async function updateSummaries() {
  await connect();
  const db = getDb();
  const moviesCollection = db.collection('movies');
  const summaries = [];

  const parser = fs.createReadStream(`${process.env.HOME}/cymbalflix/starter/data/summaries.csv`)
    .pipe(parse({
      columns: true,
      cast: true,
      quote: '"',
    }));

  console.log('Reading summaries from CSV file...');
  for await (const row of parser) {
    summaries.push(row);
  }
  console.log(`Found ${summaries.length} summaries.`);

  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(summaries.length, 0);

  let batch = [];
  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    batch.push({
      updateOne: {
        filter: { movieId: summary.movieId },
        update: { $set: { summary: summary.summary } },
      },
    });

    if (batch.length === BATCH_SIZE || i === summaries.length - 1) {
      await moviesCollection.bulkWrite(batch, { ordered: false });
      progressBar.update(i + 1);
      batch = [];
    }
  }

  progressBar.stop();
  console.log('Successfully updated all movie documents with summaries.');
  await close();
}

updateSummaries().catch(async (err) => {
  console.error(err);
  await close();
  process.exit(1);
});
