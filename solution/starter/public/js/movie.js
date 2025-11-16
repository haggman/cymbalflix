// API base URL
const API_BASE = '/api';

// Get movie ID from URL
const urlParams = new URLSearchParams(window.location.search);
const movieId = urlParams.get('id');

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  if (!movieId) {
    showError('No movie ID provided');
    return;
  }
  
  loadMovieDetails();
  setupRatingForm();
});

// Load movie details
async function loadMovieDetails() {
  try {
    const response = await fetch(`${API_BASE}/movies/${movieId}`);
    
    if (!response.ok) {
      throw new Error('Movie not found');
    }
    
    const data = await response.json();
    displayMovieDetails(data);
  } catch (error) {
    showError('Failed to load movie details. Please try again.');
    console.error('Error loading movie:', error);
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
}

// Display movie details
function displayMovieDetails(data) {
  const { movie, recentRatings, tags, links } = data;
  
  // Movie header
  document.getElementById('movieTitle').textContent = movie.title;
  document.getElementById('movieYear').textContent = movie.year || 'Year unknown';
  document.getElementById('movieRating').textContent = 
    movie.averageRating > 0 ? movie.averageRating.toFixed(2) : 'N/A';
  document.getElementById('ratingCount').textContent = 
    `${movie.ratingCount.toLocaleString()} rating${movie.ratingCount !== 1 ? 's' : ''}`;
  
  // Genres
  const genresDiv = document.getElementById('movieGenres');
  genresDiv.innerHTML = movie.genres
    .map(genre => `<span class="badge bg-primary me-1">${genre}</span>`)
    .join('');
  
  // Display movie summary if available
    if (movie.summary && movie.summary.trim()) {
      const summarySection = document.getElementById('summarySection');
      const summaryText = document.getElementById('movieSummary');
      summaryText.textContent = movie.summary;
      summarySection.style.display = 'block';
    }
    
  // External links
  if (links && (links.imdb || links.tmdb)) {
    const linksDiv = document.getElementById('externalLinks');
    let linksHtml = '<strong>External Links:</strong> ';
    
    if (links.imdb) {
      linksHtml += `<a href="${links.imdb}" target="_blank" class="btn btn-sm btn-outline-primary me-2">
        <i class="bi bi-link-45deg"></i> IMDb
      </a>`;
    }
    
    if (links.tmdb) {
      linksHtml += `<a href="${links.tmdb}" target="_blank" class="btn btn-sm btn-outline-primary">
        <i class="bi bi-link-45deg"></i> TMDB
      </a>`;
    }
    
    linksDiv.innerHTML = linksHtml;
  }
  
  // Tags
  if (tags && tags.length > 0) {
    const tagsSection = document.getElementById('tagsSection');
    const tagsDiv = document.getElementById('movieTags');
    tagsSection.style.display = 'block';
    tagsDiv.innerHTML = tags
      .map(tag => `<span class="badge bg-info text-dark me-1 mb-1">${escapeHtml(tag)}</span>`)
      .join('');
  }
  
  // Recent ratings
  displayRecentRatings(recentRatings);
  
  // Show movie details
  document.getElementById('movieDetails').style.display = 'block';
}

// Display recent ratings
function displayRecentRatings(ratings) {
  const tbody = document.getElementById('recentRatings');
  
  if (ratings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No ratings yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = ratings.map(rating => {
    const date = new Date(rating.timestamp * 1000);
    const ratingClass = rating.rating >= 4 ? 'text-success' : 
                       rating.rating >= 3 ? 'text-warning' : 'text-danger';
    
    return `
      <tr>
        <td>User ${rating.userId}</td>
        <td>
          <i class="bi bi-star-fill ${ratingClass}"></i>
          <strong class="${ratingClass}">${rating.rating.toFixed(1)}</strong>
        </td>
        <td>${date.toLocaleDateString()}</td>
      </tr>
    `;
  }).join('');
}

// Setup rating form
function setupRatingForm() {
  const form = document.getElementById('ratingForm');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = parseInt(document.getElementById('userId').value);
    const rating = parseFloat(document.getElementById('rating').value);
    
    if (!userId || !rating) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/movies/${movieId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, rating })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit rating');
      }
      
      const result = await response.json();
      
      // Show success message
      const successDiv = document.getElementById('ratingSuccess');
      successDiv.style.display = 'block';
      
      // Update movie rating display
      document.getElementById('movieRating').textContent = 
        result.updatedMovie.averageRating.toFixed(2);
      document.getElementById('ratingCount').textContent = 
        `${result.updatedMovie.ratingCount.toLocaleString()} rating${result.updatedMovie.ratingCount !== 1 ? 's' : ''}`;
      
      // Reset form
      form.reset();
      
      // Reload movie details to show new rating
      setTimeout(() => {
        successDiv.style.display = 'none';
        loadMovieDetails();
      }, 2000);
      
    } catch (error) {
      alert(`Error: ${error.message}`);
      console.error('Error submitting rating:', error);
    }
  });
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  errorText.textContent = message;
  errorDiv.style.display = 'block';
  document.getElementById('loading').style.display = 'none';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
