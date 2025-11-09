// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const cliProgress = require('cli-progress');
const { connect, close, getDb } = require('./connection');

// Paths to MovieLens data files
const DATA_DIR = path.join(__dirname, '../../data/ml-latest-small');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.csv');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.csv');
const TAGS_FILE = path.join(DATA_DIR, 'tags.csv');
const LINKS_FILE = path.join(DATA_DIR, 'links.csv');

// Configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50000', 10);

/**
 * Parse CSV file using streaming for better memory efficiency
 */
function parseCSVStream(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

/**
 * Parse movies.csv
 * Format: movieId,title,genres
 */
async function parseMovies() {
  console.log('Parsing movies.csv...');
  
  const data = await parseCSVStream(MOVIES_FILE);
  
  const movies = data.map(row => {
    // Extract year from title (format: "Movie Title (1995)")
    const yearMatch = row.title.match(/\((\d{4})\)$/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    
    // Parse genres (pipe-separated)
    const genres = row.genres ? row.genres.split('|').filter(g => g !== '(no genres listed)') : [];
    
    return {
      movieId: parseInt(row.movieId),
      title: row.title,
      year,
      genres,
      averageRating: 0,  // Will be calculated
      ratingCount: 0     // Will be calculated
    };
  });
  
  console.log(`Parsed ${movies.length} movies`);
  return movies;
}

/**
 * Parse ratings.csv
 * Format: userId,movieId,rating,timestamp
 */
async function parseRatings() {
  console.log('Parsing ratings.csv...');
  
  const data = await parseCSVStream(RATINGS_FILE);
  
  const ratings = data.map(row => ({
    userId: parseInt(row.userId),
    movieId: parseInt(row.movieId),
    rating: parseFloat(row.rating),
    timestamp: parseInt(row.timestamp)
  }));
  
  console.log(`Parsed ${ratings.length} ratings`);
  return ratings;
}

/**
 * Parse tags.csv
 * Format: userId,movieId,tag,timestamp
 */
async function parseTags() {
  console.log('Parsing tags.csv...');
  
  const data = await parseCSVStream(TAGS_FILE);
  
  const tags = data.map(row => ({
    userId: parseInt(row.userId),
    movieId: parseInt(row.movieId),
    tag: row.tag,
    timestamp: parseInt(row.timestamp)
  }));
  
  console.log(`Parsed ${tags.length} tags`);
  return tags;
}

/**
 * Parse links.csv
 * Format: movieId,imdbId,tmdbId
 */
async function parseLinks() {
  console.log('Parsing links.csv...');
  
  const data = await parseCSVStream(LINKS_FILE);
  
  const links = data.map(row => ({
    movieId: parseInt(row.movieId),
    imdbId: row.imdbId || null,
    tmdbId: row.tmdbId ? parseInt(row.tmdbId) : null
  }));
  
  console.log(`Parsed ${links.length} links`);
  return links;
}

/**
 * Calculate average ratings and counts for each movie
 * Optimized with single-pass reduce
 */
function calculateMovieStats(movies, ratings) {
  console.log('Calculating movie statistics...');
  
  // Create stats map using reduce (more efficient than forEach)
  const statsMap = ratings.reduce((acc, rating) => {
    if (!acc[rating.movieId]) {
      acc[rating.movieId] = { sum: 0, count: 0 };
    }
    acc[rating.movieId].sum += rating.rating;
    acc[rating.movieId].count += 1;
    return acc;
  }, {});
  
  // Update movies with calculated stats
  movies.forEach(movie => {
    const stats = statsMap[movie.movieId];
    if (stats) {
      movie.averageRating = Math.round((stats.sum / stats.count) * 100) / 100;
      movie.ratingCount = stats.count;
    }
  });
  
  console.log('Movie statistics calculated');
}

/**
 * Import collection in batches with progress bar
 */
async function importInBatches(collection, data, collectionName) {
  const progressBar = new cliProgress.SingleBar({
    format: `  ${collectionName} |{bar}| {percentage}% | {value}/{total}`
  }, cliProgress.Presets.shades_classic);
  
  progressBar.start(data.length, 0);
  
  let totalInserted = 0;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    
    // Use bulkWrite for better performance
    const bulkOps = batch.map(doc => ({
      insertOne: { document: doc }
    }));
    
    const result = await collection.bulkWrite(bulkOps, { ordered: false });
    totalInserted += result.insertedCount;
    progressBar.update(totalInserted);
  }
  
  progressBar.stop();
  return totalInserted;
}

/**
 * Create all indexes in parallel
 */
async function createIndexes(db) {
  console.log('\n=== Creating Indexes ===');
  
  const moviesCollection = db.collection('movies');
  const ratingsCollection = db.collection('ratings');
  const tagsCollection = db.collection('tags');
  const linksCollection = db.collection('links');
  
  await Promise.all([
    // Movies indexes
    moviesCollection.createIndex({ movieId: 1 }, { unique: true }),
    moviesCollection.createIndex({ averageRating: -1 }),
    moviesCollection.createIndex({ genres: 1 }),
    moviesCollection.createIndex({ title: 1 }),
    
    // Ratings indexes
    ratingsCollection.createIndex({ movieId: 1 }),
    ratingsCollection.createIndex({ userId: 1 }),
    ratingsCollection.createIndex({ rating: -1 }),
    
    // Tags indexes
    tagsCollection.createIndex({ movieId: 1 }),
    tagsCollection.createIndex({ userId: 1 }),
    tagsCollection.createIndex({ tag: 1 }),
    
    // Links indexes
    linksCollection.createIndex({ movieId: 1 }, { unique: true }),
    linksCollection.createIndex({ imdbId: 1 }),
    linksCollection.createIndex({ tmdbId: 1 })
  ]);
  
  console.log('✓ All indexes created');
}

/**
 * Import data into Firestore
 */
async function importData() {
  const startTime = Date.now();
  
  try {
    console.log('Starting MovieLens (ml-latest-small) import...\n');
    console.log('=== Parsing CSV Files ===');
    
    // Parse all data files in parallel
    const [movies, ratings, tags, links] = await Promise.all([
      parseMovies(),
      parseRatings(),
      parseTags(),
      parseLinks()
    ]);
    
    // Calculate movie statistics
    calculateMovieStats(movies, ratings);
    
    // Connect to Firestore
    await connect();
    const db = getDb();
    
    // Create indexes first (can be more efficient for bulk inserts)
    await createIndexes(db);
    
    // Import collections in parallel where possible
    console.log('\n=== Importing Collections ===');
    
    const moviesCollection = db.collection('movies');
    const ratingsCollection = db.collection('ratings');
    const tagsCollection = db.collection('tags');
    const linksCollection = db.collection('links');
    
    // Import movies and links in parallel (independent collections)
    console.log('Importing movies and links...');
    const [movieCount, linkCount] = await Promise.all([
      importInBatches(moviesCollection, movies, 'Movies'),
      importInBatches(linksCollection, links, 'Links')
    ]);
    
    console.log(`✓ Inserted ${movieCount.toLocaleString()} movies`);
    console.log(`✓ Inserted ${linkCount.toLocaleString()} links`);
    
    // Import ratings
    console.log('\nImporting ratings...');
    const ratingCount = await importInBatches(ratingsCollection, ratings, 'Ratings');
    console.log(`✓ Inserted ${ratingCount.toLocaleString()} ratings`);
    
    // Import tags
    console.log('\nImporting tags...');
    const tagCount = await importInBatches(tagsCollection, tags, 'Tags');
    console.log(`✓ Inserted ${tagCount.toLocaleString()} tags`);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n========================================');
    console.log('🎉 Import completed successfully!');
    console.log('========================================');
    console.log(`Movies:   ${movies.length.toLocaleString()}`);
    console.log(`Ratings:  ${ratings.length.toLocaleString()}`);
    console.log(`Tags:     ${tags.length.toLocaleString()}`);
    console.log(`Links:    ${links.length.toLocaleString()}`);
    console.log(`Duration: ${duration}s`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await close();
  }
}

// Run the import
if (require.main === module) {
  importData();
}

module.exports = { importData };