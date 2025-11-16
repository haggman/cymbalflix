
require('dotenv').config();
const { getDb, connect, close } = require('./connection');

async function removeSummaries() {
  await connect();
  
  try {
    const db = getDb();
    const movies = db.collection('movies');

    const result = await movies.updateMany(
      { summary: { $exists: true } },
      { $unset: { summary: "" } }
    );

    console.log(`${result.modifiedCount} movies updated.`);
  } catch (err) {
    console.error('Error removing summaries:', err);
  } finally {
    await close();
  }
}

removeSummaries();
