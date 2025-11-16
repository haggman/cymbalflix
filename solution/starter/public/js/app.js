// API base URL
const API_BASE = '/api';

// State
let currentPage = 0;
const itemsPerPage = 20;
let currentFilters = {
  search: '',
  genre: '',
  minRating: '',
  sort: 'averageRating',
  order: 'desc'
};

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadGenres();
  loadStats();
  loadMovies();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Search
  document.getElementById('searchButton').addEventListener('click', () => {
    currentPage = 0;
    currentFilters.search = document.getElementById('searchInput').value;
    loadMovies();
  });
  
  document.getElementById('clearSearch').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    currentFilters.search = '';
    currentPage = 0;
    loadMovies();
  });
  
  // Allow Enter key in search box
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentPage = 0;
      currentFilters.search = document.getElementById('searchInput').value;
      loadMovies();
    }
  });
  
  // Filters
  document.getElementById('applyFilters').addEventListener('click', () => {
    currentPage = 0;
    updateFiltersFromUI();
    loadMovies();
  });
  
  document.getElementById('resetFilters').addEventListener('click', () => {
    currentPage = 0;
    resetFilters();
    loadMovies();
  });
  
  // Pagination
  document.getElementById('prevPage').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage > 0) {
      currentPage--;
      loadMovies();
    }
  });
  
  document.getElementById('nextPage').addEventListener('click', (e) => {
    e.preventDefault();
    currentPage++;
    loadMovies();
  });
}

// Update filters from UI
function updateFiltersFromUI() {
  currentFilters.search = document.getElementById('searchInput').value;
  currentFilters.genre = document.getElementById('genreFilter').value;
  currentFilters.minRating = document.getElementById('minRatingFilter').value;
  
  const sortValue = document.getElementById('sortFilter').value.split(':');
  currentFilters.sort = sortValue[0];
  currentFilters.order = sortValue[1];
}

// Reset filters
function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('genreFilter').value = '';
  document.getElementById('minRatingFilter').value = '';
  document.getElementById('sortFilter').value = 'averageRating:desc';
  
  currentFilters = {
    search: '',
    genre: '',
    minRating: '',
    sort: 'averageRating',
    order: 'desc'
  };
}

// Load genres for filter dropdown
async function loadGenres() {
  try {
    const response = await fetch(`${API_BASE}/genres`);
    const data = await response.json();
    
    const genreFilter = document.getElementById('genreFilter');
    data.genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      genreFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading genres:', error);
  }
}

// Load database stats
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    
    document.getElementById('totalMovies').textContent = data.movies.toLocaleString();
    document.getElementById('totalRatings').textContent = data.ratings.toLocaleString();
    document.getElementById('totalTags').textContent = data.tags.toLocaleString();
    document.getElementById('totalUsers').textContent = data.users.toLocaleString();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load movies
async function loadMovies() {
  showLoading(true);
  hideError();
  
  try {
    // Build query parameters
    const params = new URLSearchParams({
      limit: itemsPerPage,
      offset: currentPage * itemsPerPage,
      sort: currentFilters.sort,
      order: currentFilters.order
    });
    
    if (currentFilters.search) {
      params.append('search', currentFilters.search);
    }
    
    if (currentFilters.genre) {
      params.append('genre', currentFilters.genre);
    }
    
    if (currentFilters.minRating) {
      params.append('minRating', currentFilters.minRating);
    }
    
    const response = await fetch(`${API_BASE}/movies?${params}`);
    if (!response.ok) {
      throw new Error('Failed to load movies');
    }
    
    const data = await response.json();
    displayMovies(data.movies);
    updatePagination(data.pagination);
  } catch (error) {
    showError('Failed to load movies. Please try again.');
    console.error('Error loading movies:', error);
  } finally {
    showLoading(false);
  }
}

// Display movies in grid
function displayMovies(movies) {
  const grid = document.getElementById('moviesGrid');
  grid.innerHTML = '';
  
  if (movies.length === 0) {
    grid.innerHTML = '<div class="col-12"><p class="text-center text-muted">No movies found matching your criteria.</p></div>';
    return;
  }
  
  movies.forEach(movie => {
    const card = createMovieCard(movie);
    grid.appendChild(card);
  });
}

// Create movie card
function createMovieCard(movie) {
  const col = document.createElement('div');
  col.className = 'col';
  
  const rating = movie.averageRating > 0 ? movie.averageRating.toFixed(1) : 'N/A';
  const ratingClass = movie.averageRating >= 4 ? 'text-success' : 
                      movie.averageRating >= 3 ? 'text-warning' : 'text-danger';
  
  col.innerHTML = `
    <div class="card h-100 movie-card" style="cursor: pointer;" onclick="window.location.href='/movie.html?id=${movie.movieId}'">
      <div class="card-body">
        <h5 class="card-title">${escapeHtml(movie.title)}</h5>
        <p class="card-text">
          <span class="badge bg-secondary">${movie.year || 'Unknown'}</span>
        </p>
        <div class="mb-2">
          ${movie.genres.slice(0, 3).map(g => `<span class="badge bg-primary me-1">${g}</span>`).join('')}
        </div>
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <i class="bi bi-star-fill ${ratingClass}"></i>
            <strong class="${ratingClass}">${rating}</strong>
          </div>
          <small class="text-muted">${movie.ratingCount} ratings</small>
        </div>
      </div>
    </div>
  `;
  
  return col;
}

// Update pagination controls
function updatePagination(pagination) {
  const prevButton = document.getElementById('prevPage');
  const nextButton = document.getElementById('nextPage');
  const currentPageDisplay = document.getElementById('currentPageDisplay');
  
  // Update page number display
  currentPageDisplay.textContent = currentPage + 1;
  
  // Enable/disable prev button
  if (currentPage === 0) {
    prevButton.classList.add('disabled');
  } else {
    prevButton.classList.remove('disabled');
  }
  
  // Enable/disable next button
  if (!pagination.hasMore) {
    nextButton.classList.add('disabled');
  } else {
    nextButton.classList.remove('disabled');
  }
}

// Show/hide loading spinner
function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
  document.getElementById('moviesGrid').style.display = show ? 'none' : 'flex';
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  errorText.textContent = message;
  errorDiv.style.display = 'block';
}

// Hide error message
function hideError() {
  document.getElementById('errorMessage').style.display = 'none';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}