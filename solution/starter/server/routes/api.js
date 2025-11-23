const express = require('express');
const { getDb } = require('../db/connection');

const router = express.Router();

/**
 * GET /api/movies
 * List movies with optional filtering and pagination
 * 
 * Query parameters:
 * - search: Search movie titles (case-insensitive, partial match)
 * - genre: Filter by genre (e.g., "Action", "Comedy")
 * - minRating: Minimum average rating (e.g., 3.5)
 * - limit: Number of results per page (default: 20, max: 100)
 * - offset: Number of results to skip (default: 0)
 * - sort: Sort field (default: "averageRating", options: "averageRating", "ratingCount", "title", "year")
 * - order: Sort order (default: "desc", options: "asc", "desc")
 */
router.get('/movies', async (req, res, next) => {
  try {
    const db = getDb();
    const moviesCollection = db.collection('movies');
    
    // Parse query parameters
    const {
      search,
      genre,
      minRating,
      limit = 20,
      offset = 0,
      sort = 'averageRating',
      order = 'desc'
    } = req.query;
    
    // Validate and parse numeric parameters
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Cap at 100
    const offsetNum = parseInt(offset) || 0;
    const minRatingNum = parseFloat(minRating);
    
    // Build query filter
    const filter = {};
    
    // Search by title (case-insensitive regex)
    if (search && search.trim()) {
      filter.title = { $regex: search.trim(), $options: 'i' };
    }
    
    if (genre) {
      filter.genres = genre; // MongoDB will match if array contains this value
    }
    
    if (!isNaN(minRatingNum)) {
      filter.averageRating = { $gte: minRatingNum };
    }
    
    // Build sort options
    const sortOptions = {};
    const validSortFields = ['averageRating', 'ratingCount', 'title', 'year'];
    const sortField = validSortFields.includes(sort) ? sort : 'averageRating';
    sortOptions[sortField] = order === 'asc' ? 1 : -1;
    
    // Execute query
    const movies = await moviesCollection
      .find(filter)
      .sort(sortOptions)
      .skip(offsetNum)
      .limit(limitNum)
      .toArray();
    
    // Get total count for pagination
    const totalCount = await moviesCollection.countDocuments(filter);
    
    res.json({
      movies,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < totalCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/movies/:id
 * Get details for a specific movie including recent ratings
 * 
 * Path parameters:
 * - id: movieId (numeric)
 * 
 * Query parameters:
 * - ratingsLimit: Number of recent ratings to include (default: 10)
 */
router.get('/movies/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const moviesCollection = db.collection('movies');
    const ratingsCollection = db.collection('ratings');
    const tagsCollection = db.collection('tags');
    const linksCollection = db.collection('links');
    
    const movieId = parseInt(req.params.id);
    const ratingsLimit = Math.min(parseInt(req.query.ratingsLimit) || 10, 100);
    
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }
    
    // Get movie details
    const movie = await moviesCollection.findOne({ movieId });
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    // Get recent ratings for this movie
    const recentRatings = await ratingsCollection
      .find({ movieId })
      .sort({ timestamp: -1 })
      .limit(ratingsLimit)
      .toArray();
    
    // Get tags for this movie
    const tags = await tagsCollection
      .find({ movieId })
      .limit(20)
      .toArray();
    
    // Get external links
    const links = await linksCollection.findOne({ movieId });
    
    res.json({
      movie,
      recentRatings,
      tags: tags.map(t => t.tag),
      links: links ? {
        imdb: links.imdbId ? `https://www.imdb.com/title/tt${links.imdbId}/` : null,
        tmdb: links.tmdbId ? `https://www.themoviedb.org/movie/${links.tmdbId}` : null
      } : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/movies/:id/rate
 * Submit a new rating for a movie
 * 
 * Path parameters:
 * - id: movieId (numeric)
 * 
 * Body (JSON):
 * - userId: User ID (numeric, required)
 * - rating: Rating value (0.5 - 5.0, in 0.5 increments, required)
 */
router.post('/movies/:id/rate', async (req, res, next) => {
  try {
    const db = getDb();
    const moviesCollection = db.collection('movies');
    const ratingsCollection = db.collection('ratings');
    
    const movieId = parseInt(req.params.id);
    const { userId, rating } = req.body;
    
    // Validate input
    if (isNaN(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }
    
    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }
    
    if (!rating || isNaN(parseFloat(rating))) {
      return res.status(400).json({ error: 'Valid rating is required' });
    }
    
    const ratingValue = parseFloat(rating);
    if (ratingValue < 0.5 || ratingValue > 5.0) {
      return res.status(400).json({ error: 'Rating must be between 0.5 and 5.0' });
    }
    
    // Check if movie exists
    const movie = await moviesCollection.findOne({ movieId });
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    // Insert new rating
    const newRating = {
      userId: parseInt(userId),
      movieId,
      rating: ratingValue,
      timestamp: Math.floor(Date.now() / 1000) // Unix timestamp
    };
    
    await ratingsCollection.insertOne(newRating);
    
    // Recalculate movie statistics
    const allRatings = await ratingsCollection
      .find({ movieId })
      .toArray();
    
    const totalRating = allRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = Math.round((totalRating / allRatings.length) * 100) / 100;
    
    // Update movie with new statistics
    await moviesCollection.updateOne(
      { movieId },
      {
        $set: {
          averageRating,
          ratingCount: allRatings.length
        }
      }
    );
    
    res.status(201).json({
      message: 'Rating submitted successfully',
      rating: newRating,
      updatedMovie: {
        movieId,
        averageRating,
        ratingCount: allRatings.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/genres
 * Get list of all unique genres in the database
 */
router.get('/genres', async (req, res, next) => {
  try {
    const db = getDb();
    const moviesCollection = db.collection('movies');
    
    // Get distinct genres (MongoDB will flatten the arrays)
    const genres = await moviesCollection.distinct('genres');
    
    // Sort alphabetically
    genres.sort();
    
    res.json({ genres });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats
 * Get database statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const db = getDb();
    
    const [movieCount, ratingCount, tagCount, userCount] = await Promise.all([
      db.collection('movies').countDocuments(),
      db.collection('ratings').countDocuments(),
      db.collection('tags').countDocuments(),
      db.collection('ratings').distinct('userId').then(users => users.length)
    ]);
    
    res.json({
      movies: movieCount,
      ratings: ratingCount,
      tags: tagCount,
      users: userCount
    });
  } catch (error) {
    next(error);
  }
});

// New code to support Firebase features

/**
 * GET /api/firebase-config
 * Provides Firebase configuration for client-side SDK
 */
router.get('/firebase-config', async (req, res, next) => {
  try {
    const projectId = process.env.PROJECT_ID || 
                      process.env.GOOGLE_CLOUD_PROJECT;
    const databaseId = process.env.FIRESTORE_DATABASE || 'cymbalflix-db';
    
    if (!projectId) {
      return res.status(500).json({ 
        error: 'PROJECT_ID not configured' 
      });
    }
    
    res.json({ projectId, databaseId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;