// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { connect, close, getDb } = require('./connection');

// Paths to MovieLens data files
const DATA_DIR = path.join(__dirname, '../../data/ml-latest-small');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.csv');
const RATINGS_FILE = path.join(DATA_DIR, 'ratings.csv');
const TAGS_FILE = path.join(DATA_DIR, 'tags.csv');
const LINKS_FILE = path.join(DATA_DIR, 'links.csv');

/**
 * Parse a CSV file into an array of objects
 * Handles quoted fields that contain commas
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  
  // Get headers from first line
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Parse data lines
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let current = '';
    let inQuotes = false;
    
    // Parse line character by character to handle quoted commas
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Push last value
    
    // Create object from headers and values
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    data.push(obj);
  }
  
  return data;
}

/**
 * Parse movies.csv
 * Format: movieId,title,genres
 */
function parseMovies() {
  console.log('Parsing movies.csv...');
  
  const data = parseCSV(MOVIES_FILE);
  
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
function parseRatings() {
  console.log('Parsing ratings.csv...');
  
  const data = parseCSV(RATINGS_FILE);
  
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
function parseTags() {
  console.log('Parsing tags.csv...');
  
  const data = parseCSV(TAGS_FILE);
  
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
function parseLinks() {
  console.log('Parsing links.csv...');
  
  const data = parseCSV(LINKS_FILE);
  
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
 */
function calculateMovieStats(movies, ratings) {
  console.log('Calculating movie statistics...');
  
  // Create a map of movieId -> stats
  const statsMap = new Map();
  
  ratings.forEach(rating => {
    if (!statsMap.has(rating.movieId)) {
      statsMap.set(rating.movieId, { sum: 0, count: 0 });
    }
    const stats = statsMap.get(rating.movieId);
    stats.sum += rating.rating;
    stats.count += 1;
  });
  
  // Update movies with calculated stats
  movies.forEach(movie => {
    const stats = statsMap.get(movie.movieId);
    if (stats) {
      movie.averageRating = Math.round((stats.sum / stats.count) * 100) / 100; // Round to 2 decimals
      movie.ratingCount = stats.count;
    }
  });
  
  console.log('Movie statistics calculated');
}


/**
 * Import data into Firestore
 */
async function importData() {
  try {
    console.log('Starting MovieLens (ml-latest-small) import...\n');
    
    // Parse all data files
    const movies = parseMovies();
    const ratings = parseRatings();
    const tags = parseTags();
    const links = parseLinks();
    
    // Calculate movie statistics
    calculateMovieStats(movies, ratings);
    
    // Connect to Firestore
    await connect();
    const db = getDb();
    
    // Import movies
    console.log('\n=== Importing Movies ===');
    const moviesCollection = db.collection('movies');
    console.log('Inserting movies...');
    const movieResult = await moviesCollection.insertMany(movies);
    console.log(`✓ Inserted ${movieResult.insertedCount} movies`);
    
    // Import ratings (in batches)
    console.log('\n=== Importing Ratings ===');
    const ratingsCollection = db.collection('ratings');
    
    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10000', 10);



    let totalRatings = 0;
    console.log('Inserting ratings in batches...');
    for (let i = 0; i < ratings.length; i += BATCH_SIZE) {
      const batch = ratings.slice(i, i + BATCH_SIZE);
      const result = await ratingsCollection.insertMany(batch, { ordered: false });
      totalRatings += result.insertedCount;
      console.log(`  Progress: ${totalRatings}/${ratings.length} ratings`);
    }
    console.log(`✓ Inserted ${totalRatings} ratings`);
    
    // Import tags (in batches)
    console.log('\n=== Importing Tags ===');
    const tagsCollection = db.collection('tags');
    
    
    let totalTags = 0;
    console.log('Inserting tags in batches...');
    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
      const batch = tags.slice(i, i + BATCH_SIZE);
      const result = await tagsCollection.insertMany(batch, { ordered: false });
      totalTags += result.insertedCount;
      console.log(`  Progress: ${totalTags}/${tags.length} tags`);
    }
    console.log(`✓ Inserted ${totalTags} tags`);
    
    // Import links
    console.log('\n=== Importing Links ===');
    const linksCollection = db.collection('links');
    console.log('Inserting links...');
    const linksResult = await linksCollection.insertMany(links);
    console.log(`✓ Inserted ${linksResult.insertedCount} links`);
    
    // Create indexes
    console.log('\n=== Creating Indexes ===');
    
    // Movies indexes
    await moviesCollection.createIndex({ movieId: 1 }, { unique: true });
    await moviesCollection.createIndex({ averageRating: -1 });
    await moviesCollection.createIndex({ genres: 1 });
    await moviesCollection.createIndex({ title: 1 });
    console.log('✓ Movies indexes created');
    
    // Ratings indexes
    await ratingsCollection.createIndex({ movieId: 1 });
    await ratingsCollection.createIndex({ userId: 1 });
    await ratingsCollection.createIndex({ rating: -1 });
    console.log('✓ Ratings indexes created');
    
    // Tags indexes
    await tagsCollection.createIndex({ movieId: 1 });
    await tagsCollection.createIndex({ userId: 1 });
    await tagsCollection.createIndex({ tag: 1 });
    console.log('✓ Tags indexes created');
    
    // Links indexes
    await linksCollection.createIndex({ movieId: 1 }, { unique: true });
    await linksCollection.createIndex({ imdbId: 1 });
    await linksCollection.createIndex({ tmdbId: 1 });
    console.log('✓ Links indexes created');
    
    console.log('\n========================================');
    console.log('🎉 Import completed successfully!');
    console.log('========================================');
    console.log(`Movies:   ${movies.length.toLocaleString()}`);
    console.log(`Ratings:  ${ratings.length.toLocaleString()}`);
    console.log(`Tags:     ${tags.length.toLocaleString()}`);
    console.log(`Links:    ${links.length.toLocaleString()}`);
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