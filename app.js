/**
 * Netflix Clone - Dynamic Core Engine
 * Integrates with TMDB API to fetch and render premium visual components,
 * search results, detail overlays, trailer playback, and intuitive animations.
 *
 * ⚠️  API key is loaded from config.js (which is listed in .gitignore).
 *     Never hard-code the key here — use window.TMDB_API_KEY set in config.js.
 */

// Read API key from config.js (loaded before this script in index.html)
const API_KEY = window.TMDB_API_KEY || '';
if (!API_KEY) console.warn('TMDB API key not found. Add it to config.js.');

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const ORIGIN = window.location.origin || 'http://localhost';

// Standard Genre ID Map
const GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};

// ─── PERSISTENCE HELPERS ─────────────────────────────────────────────────────
const LS_LIST_KEY = 'netflix_clone_mylist';
const LS_LIKES_KEY = 'netflix_clone_likes';

/** Load myPersonalList from localStorage on startup */
function loadMyListFromStorage() {
  try {
    const saved = localStorage.getItem(LS_LIST_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

/** Persist myPersonalList to localStorage */
function saveMyListToStorage() {
  try { localStorage.setItem(LS_LIST_KEY, JSON.stringify(myPersonalList)); } catch { }
}

/** Load liked IDs set from localStorage */
function loadLikesFromStorage() {
  try {
    const saved = localStorage.getItem(LS_LIKES_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch { return new Set(); }
}

/** Persist liked IDs to localStorage */
function saveLikesToStorage() {
  try { localStorage.setItem(LS_LIKES_KEY, JSON.stringify([...likedIds])); } catch { }
}

// Custom Netflix-style Toast Notification trigger
function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  if (toast && toastMsg) {
    toastMsg.innerText = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  }
}

// Smart Dynamic Age Rating resolver
function resolveAgeRating(movie) {
  if (movie.adult) return '18+';
  const genres = movie.genre_ids || [];
  if (genres.includes(16) || genres.includes(10751)) return 'G';
  if (genres.includes(27) || genres.includes(80) || genres.includes(53)) return '16+';
  return '13+';
}

// State Management
let myPersonalList = loadMyListFromStorage();   // persisted across refreshes
let likedIds = loadLikesFromStorage();          // persisted set of liked movie IDs
let soundMuted = true;
let isKidsMode = false;

// API Requests
const requests = {
  fetchRecentReleases: `/movie/now_playing?api_key=${API_KEY}&language=en-US&page=1`,
  fetchTrendingToday: `/trending/all/day?api_key=${API_KEY}`,
  fetchActionMovies: `/discover/movie?api_key=${API_KEY}&with_genres=28`,
  fetchSciFiMovies: `/discover/movie?api_key=${API_KEY}&with_genres=878`,
  fetchHorrorMovies: `/discover/movie?api_key=${API_KEY}&with_genres=27`,
  fetchRomanceMovies: `/discover/movie?api_key=${API_KEY}&with_genres=10749`,
  fetchThrillerMovies: `/discover/movie?api_key=${API_KEY}&with_genres=53`,
};

window.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupUIEventListeners();
});

async function initApp() {
  try {
    handleRouting();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

async function fetchFromTMDB(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error(`Error loading data from ${url}:`, err);
    return null;
  }
}

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

function setupUIEventListeners() {
  const searchBtn = document.getElementById('search-btn');
  const searchContainer = document.getElementById('search-box-container');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');

  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    searchContainer.classList.toggle('active');
    if (searchContainer.classList.contains('active')) searchInput.focus();
  });

  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target) && searchInput.value === '') {
      searchContainer.classList.remove('active');
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    triggerSearch('');
    searchInput.focus();
  });

  searchInput.addEventListener('input', (e) => {
    triggerSearch(e.target.value.trim());
  });

  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalBackdrop = document.getElementById('modal-backdrop-trigger');
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroInfoBtn = document.getElementById('hero-info-btn');

  heroPlayBtn.addEventListener('click', () => {
    const id = heroPlayBtn.getAttribute('data-id');
    const type = heroPlayBtn.getAttribute('data-type');
    if (id) openMovieModal(id, type);
  });

  heroInfoBtn.addEventListener('click', () => {
    const id = heroInfoBtn.getAttribute('data-id');
    const type = heroInfoBtn.getAttribute('data-type');
    if (id) openMovieModal(id, type);
  });

  // Sound toggle in modal
  const soundBtn = document.getElementById('modal-mute-btn');
  soundBtn.addEventListener('click', () => {
    const iframe = document.querySelector('#modal-video-player iframe');
    if (iframe) {
      soundMuted = !soundMuted;
      const command = soundMuted ? 'mute' : 'unMute';
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
      const icon = soundBtn.querySelector('i');
      const tooltip = soundBtn.querySelector('.tooltiptext');
      if (soundMuted) {
        icon.className = 'fa-solid fa-volume-xmark';
        tooltip.innerText = 'Unmute';
      } else {
        icon.className = 'fa-solid fa-volume-high';
        tooltip.innerText = 'Mute';
      }
    }
  });

  // NOTE: modal like button and add-to-list button are wired inside openMovieModal()
  // using .onclick so they always reference the current movie's ID. No static listener needed.

  // Profile sign out button alert (premium mockup trigger)
  const signOutBtn = document.getElementById('sign-out-btn');
  signOutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Signed out of Netflix successfully!');
  });

  // ─── HAMBURGER MOBILE MENU ────────────────────────────────────────────────
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
  const mobileMenuClose = document.getElementById('mobile-menu-close');

  function openMobileMenu() {
    mobileMenu.classList.add('open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileMenu);
  if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
  if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', closeMobileMenu);

  // Wire each mobile nav link
  const mobileNavRoutes = [
    { id: 'm-link-home', hash: '#home' },
    { id: 'm-link-tv', hash: '#tv' },
    { id: 'm-link-movies', hash: '#movies' },
    { id: 'm-link-latest', hash: '#latest' },
    { id: 'm-link-mylist', hash: '#mylist' },
    { id: 'm-link-kids', hash: '#kids' },
  ];
  mobileNavRoutes.forEach(({ id, hash }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        closeMobileMenu();
        window.location.hash = hash;
      });
    }
  });

  // Nav link routing
  const linkHome = document.getElementById('link-home');
  const linkTV = document.getElementById('link-tv');
  const linkMovies = document.getElementById('link-movies');
  const linkLatest = document.getElementById('link-latest');
  const linkMyList = document.getElementById('link-mylist');

  if (linkHome) linkHome.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#home'; });
  if (linkTV) linkTV.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#tv'; });
  if (linkMovies) linkMovies.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#movies'; });
  if (linkLatest) linkLatest.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#latest'; });
  if (linkMyList) linkMyList.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#mylist'; });

  // Kids label in navbar & profile kids
  const kidsLabel = document.querySelector('.kids-label');
  const profileKids = document.getElementById('profile-kids');
  const profileUser1 = document.getElementById('profile-user1');

  if (kidsLabel) {
    kidsLabel.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#kids'; });
    kidsLabel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.hash = '#kids';
      }
    });
  }
  if (profileKids) profileKids.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#kids'; });
  if (profileUser1) profileUser1.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#home'; });

  // Notification items
  const notificationItems = document.querySelectorAll('.notification-item');
  const badge = document.getElementById('notification-badge');
  notificationItems.forEach(item => {
    item.addEventListener('click', () => {
      const mediaId = item.getAttribute('data-id');
      const mediaType = item.getAttribute('data-type');
      if (mediaId && mediaType) openMovieModal(mediaId, mediaType);
      if (badge && badge.innerText !== '0') {
        const currentCount = parseInt(badge.innerText, 10);
        badge.innerText = currentCount - 1;
        if (currentCount - 1 === 0) badge.style.display = 'none';
      }
    });
  });
}

// ─── HERO BANNER ───────────────────────────────────────────────────────────────
async function setupHeroBanner(movies, mediaType = 'movie') {
  const filtered = movies.filter(m => m.backdrop_path && m.overview);
  if (filtered.length === 0) return;

  const movieSummary = filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))];
  const resolvedType = movieSummary.first_air_date ? 'tv' : (mediaType || 'movie');

  // Fetch full details of the movie/TV show from TMDB
  const movieDetails = await fetchFromTMDB(`/${resolvedType}/${movieSummary.id}?api_key=${API_KEY}`);
  const movie = movieDetails || movieSummary;

  const heroSection = document.getElementById('hero-banner');
  const heroTitle = document.getElementById('hero-title');
  const heroDescription = document.getElementById('hero-description');
  const heroMatch = document.getElementById('hero-match');
  const heroYear = document.getElementById('hero-year');
  const heroDuration = document.getElementById('hero-duration');
  const heroBadge = document.getElementById('hero-badge');

  // Use w1280 instead of /original — same visual quality, ~75% smaller file size
  const backdropUrl = `${IMAGE_BASE_URL}/w1280${movie.backdrop_path}`;
  heroSection.style.backgroundImage = `url('${backdropUrl}')`;
  // LCP FIX: keep the real <img> src in sync so Lighthouse scores fetchpriority=high
  const lcpImg = document.getElementById('hero-lcp-img');
  if (lcpImg) {
    lcpImg.src = backdropUrl;
    lcpImg.width = 1280;
    lcpImg.height = 720;
    lcpImg.sizes = "100vw";
  }
  heroTitle.innerText = movie.name || movie.title || movie.original_name;
  heroDescription.innerText = movie.overview;

  const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || Math.floor(Math.random() * 10) + 88;
  heroMatch.innerText = `${matchPct}% Match`;

  const dateStr = movie.first_air_date || movie.release_date;
  heroYear.innerText = dateStr ? new Date(dateStr).getFullYear() : '2024';

  // Duration: TV shows → episode length or season count; Movies → runtime in minutes
  const isTV = resolvedType === 'tv';
  if (isTV) {
    const epLen = Array.isArray(movie.episode_run_time) && movie.episode_run_time.length > 0
      ? movie.episode_run_time[0]
      : null;
    heroDuration.innerText = epLen ? `${epLen}m / episode` : (movie.number_of_seasons ? `${movie.number_of_seasons} Season${movie.number_of_seasons > 1 ? 's' : ''}` : 'Series');
  } else {
    heroDuration.innerText = movie.runtime ? `${movie.runtime}m` : (movie.number_of_seasons ? `${movie.number_of_seasons} Seasons` : '');
  }

  // Handle hero badge logic
  if (heroBadge) {
    if (isKidsMode) {
      heroBadge.style.display = 'flex';
      heroBadge.innerHTML = '<span style="color:#e9a716; font-weight:800; font-size:0.85rem; letter-spacing:2px;">NETFLIX KIDS</span>';
    } else if (isTV) {
      heroBadge.style.display = 'flex';
      heroBadge.innerHTML = `
        <svg class="n-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="height: 22px; width: 14px; margin-right: 4px;">
          <path d="M20 0h20v80H20z" fill="#B20710"/>
          <path d="M60 0h20v100H60z" fill="#B20710"/>
          <path d="M20 0l40 100H40L20 0z" fill="#E50914"/>
        </svg>
        <span>ORIGINAL SERIES</span>
      `;
    } else {
      // Hide badge for movies that have a runtime / are not series
      heroBadge.style.display = 'none';
    }
  }

  document.getElementById('hero-play-btn').setAttribute('data-id', movie.id);
  document.getElementById('hero-play-btn').setAttribute('data-type', resolvedType);
  document.getElementById('hero-info-btn').setAttribute('data-id', movie.id);
  document.getElementById('hero-info-btn').setAttribute('data-type', resolvedType);
}

// ─── MOVIE ROW RENDERER ────────────────────────────────────────────────────────
async function renderMovieRow(title, endpoint, isLarge = false) {
  const rowsContainer = document.getElementById('rows-container');
  const data = await fetchFromTMDB(endpoint);
  if (!data || !data.results || data.results.length === 0) {
    renderRowError(title, rowsContainer, isLarge);
    return;
  }

  const rowDiv = document.createElement('div');
  rowDiv.className = `movie-row ${isLarge ? 'netflix-originals-row' : ''}`;

  const rowTitle = document.createElement('h2');
  rowTitle.className = 'row-title';
  rowTitle.innerText = title;
  rowDiv.appendChild(rowTitle);

  const wrapper = document.createElement('div');
  wrapper.className = 'row-cards-wrapper';

  const arrowLeft = document.createElement('button');
  arrowLeft.className = 'row-arrow arrow-left';
  arrowLeft.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
  wrapper.appendChild(arrowLeft);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'row-cards-container';

  // Deduplicate by ID
  const seen = new Set();
  const uniqueResults = data.results.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  uniqueResults.forEach(movie => {
    const posterPath = isLarge ? movie.poster_path : (movie.backdrop_path || movie.poster_path);
    if (!posterPath) return;

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('data-id', movie.id);
    const resolvedType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
    card.setAttribute('data-type', resolvedType);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', movie.title || movie.name || 'Movie Card');

    const isMobile = window.innerWidth <= 768;
    let imgSize = 'w342';
    if (!isLarge) {
      if (movie.backdrop_path) {
        imgSize = isMobile ? 'w300' : 'w780';
      } else {
        imgSize = isMobile ? 'w185' : 'w342';
      }
    }
    const img = document.createElement('img');
    img.src = `${IMAGE_BASE_URL}/${imgSize}${posterPath}`;
    img.alt = movie.title || movie.name || 'Movie poster';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Explicit dimensions prevent layout shift (CLS) while image loads
    img.width = isLarge ? 342 : 780;
    img.height = isLarge ? 513 : 439;
    img.onerror = () => { img.src = `https://image.tmdb.org/t/p/w342${movie.poster_path || movie.backdrop_path}`; };
    card.appendChild(img);

    // Keyboard trigger
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
      }
    });

    // Hover panel
    const hoverDetails = document.createElement('div');
    hoverDetails.className = 'card-hover-details';

    const actionRow = document.createElement('div');
    actionRow.className = 'card-action-row';
    actionRow.innerHTML = `
      <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
      <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
      <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
    `;
    hoverDetails.appendChild(actionRow);

    const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
    const releaseYear = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';
    const genreNames = (movie.genre_ids || []).slice(0, 3).map(id => GENRE_MAP[id] || '').filter(Boolean).join(' • ');

    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta';
    metaRow.innerHTML = `
      <span class="card-match">${matchPct}% Match</span>
      <span class="card-rating">${resolveAgeRating(movie)}</span>
      <span>${releaseYear}</span>
    `;
    hoverDetails.appendChild(metaRow);

    const titleRow = document.createElement('div');
    titleRow.className = 'card-title';
    titleRow.innerText = movie.title || movie.name || movie.original_name;
    hoverDetails.appendChild(titleRow);

    if (genreNames) {
      const genresRow = document.createElement('div');
      genresRow.className = 'card-genres';
      genresRow.innerText = genreNames;
      hoverDetails.appendChild(genresRow);
    }

    card.appendChild(hoverDetails);

    // Click to open modal
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-row')) return;
      openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
    });

    // Play button in card opens modal too
    const playBtn = actionRow.querySelector('.card-play-btn');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
    });

    cardsContainer.appendChild(card);
  });

  wrapper.appendChild(cardsContainer);

  const arrowRight = document.createElement('button');
  arrowRight.className = 'row-arrow arrow-right';
  arrowRight.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  wrapper.appendChild(arrowRight);

  rowDiv.appendChild(wrapper);
  rowsContainer.appendChild(rowDiv);

  arrowLeft.addEventListener('click', () => { cardsContainer.scrollLeft -= cardsContainer.offsetWidth * 0.75; });
  arrowRight.addEventListener('click', () => { cardsContainer.scrollLeft += cardsContainer.offsetWidth * 0.75; });

  rowDiv.querySelectorAll('.add-to-list-btn').forEach(btn => {
    const movieObj = uniqueResults.find(m => m.id == btn.getAttribute('data-id'));
    applyListState(btn, btn.getAttribute('data-id')); // restore persisted state
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMyList(movieObj, btn);
    });
  });

  rowDiv.querySelectorAll('.like-btn').forEach((btn, i) => {
    const card = btn.closest('.movie-card');
    const movieId = card ? card.getAttribute('data-id') : null;
    applyLikedState(btn, movieId); // restore persisted liked state
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLikeButton(btn, movieId);
    });
  });
}

// ─── TOP 10 ROW ────────────────────────────────────────────────────────────────
async function renderTop10Row(title, endpoint) {
  const rowsContainer = document.getElementById('rows-container');
  const data = await fetchFromTMDB(endpoint);
  if (!data || !data.results || data.results.length === 0) {
    renderRowError(title, rowsContainer, false);
    return;
  }

  const results = data.results.slice(0, 10);

  const rowDiv = document.createElement('div');
  rowDiv.className = 'movie-row top-10-row';

  const rowTitle = document.createElement('h2');
  rowTitle.className = 'row-title';
  rowTitle.innerText = title;
  rowDiv.appendChild(rowTitle);

  const wrapper = document.createElement('div');
  wrapper.className = 'row-cards-wrapper';

  const arrowLeft = document.createElement('button');
  arrowLeft.className = 'row-arrow arrow-left';
  arrowLeft.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
  wrapper.appendChild(arrowLeft);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'row-cards-container';

  results.forEach((movie, index) => {
    if (!movie.poster_path) return;

    const card = document.createElement('div');
    card.className = 'top-10-card';
    card.setAttribute('data-id', movie.id);
    card.setAttribute('data-type', movie.media_type || 'movie');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', movie.title || movie.name || `Top ${index + 1} Title`);

    const numSpan = document.createElement('span');
    numSpan.className = 'top-10-number';
    numSpan.innerText = index + 1;
    card.appendChild(numSpan);

    const isMobile = window.innerWidth <= 768;
    const imgSize = isMobile ? 'w185' : 'w342';
    const img = document.createElement('img');
    img.src = `${IMAGE_BASE_URL}/${imgSize}${movie.poster_path}`;
    img.alt = movie.title || movie.name || 'Top 10 poster';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 135;
    img.height = 200;
    card.appendChild(img);

    // Keyboard trigger
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
      }
    });

    const hoverDetails = document.createElement('div');
    hoverDetails.className = 'card-hover-details top-10-hover-details';

    const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
    const releaseYear = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';

    hoverDetails.innerHTML = `
      <div class="card-action-row">
        <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
        <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
      </div>
      <div class="card-meta">
        <span class="card-match">${matchPct}% Match</span>
        <span class="card-rating">13+</span>
        <span>${releaseYear}</span>
      </div>
      <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
    `;

    card.appendChild(hoverDetails);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-row')) return;
      openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
    });

    cardsContainer.appendChild(card);
  });

  wrapper.appendChild(cardsContainer);

  const arrowRight = document.createElement('button');
  arrowRight.className = 'row-arrow arrow-right';
  arrowRight.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  wrapper.appendChild(arrowRight);

  rowDiv.appendChild(wrapper);
  rowsContainer.appendChild(rowDiv);

  arrowLeft.addEventListener('click', () => { cardsContainer.scrollLeft -= cardsContainer.offsetWidth * 0.75; });
  arrowRight.addEventListener('click', () => { cardsContainer.scrollLeft += cardsContainer.offsetWidth * 0.75; });

  rowDiv.querySelectorAll('.add-to-list-btn').forEach(btn => {
    const movieObj = results.find(m => m.id == btn.getAttribute('data-id'));
    applyListState(btn, btn.getAttribute('data-id')); // restore persisted state
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMyList(movieObj, btn);
    });
  });

  rowDiv.querySelectorAll('.like-btn').forEach(btn => {
    const card = btn.closest('.top-10-card');
    const movieId = card ? card.getAttribute('data-id') : null;
    applyLikedState(btn, movieId); // restore persisted liked state
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLikeButton(btn, movieId);
    });
  });
}

function renderRowError(title, container, isLarge) {
  const rowDiv = document.createElement('div');
  rowDiv.className = `movie-row ${isLarge ? 'netflix-originals-row' : ''}`;

  const rowTitle = document.createElement('h2');
  rowTitle.className = 'row-title';
  rowTitle.innerText = title;
  rowDiv.appendChild(rowTitle);

  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'padding: 20px 0; color: var(--text-muted); font-size: 0.9rem; display: flex; align-items: center; gap: 8px;';
  errorDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--netflix-red);"></i> We had trouble loading these recommendations. Swiping to refresh or checking back later.';
  rowDiv.appendChild(errorDiv);

  container.appendChild(rowDiv);
}

// ─── MY LIST ──────────────────────────────────────────────────────────────────
function toggleMyList(movie, btnElement) {
  if (!movie) return;
  const index = myPersonalList.findIndex(m => m.id === movie.id);
  let nowInList = false;
  if (index === -1) {
    myPersonalList.push(movie);
    nowInList = true;
  } else {
    myPersonalList.splice(index, 1);
    nowInList = false;
  }
  saveMyListToStorage(); // persist after every change
  syncListButtonsAcrossPage(movie.id, nowInList);
}

// ─── LIKE BUTTON ──────────────────────────────────────────────────────────────
function toggleLikeButton(btnElement, movieId) {
  if (!btnElement || !movieId) return;
  let nowLiked = false;
  if (likedIds.has(String(movieId))) {
    // Unlike
    likedIds.delete(String(movieId));
    nowLiked = false;
  } else {
    // Like
    likedIds.add(String(movieId));
    nowLiked = true;
  }
  saveLikesToStorage();
  syncLikeButtonsAcrossPage(movieId, nowLiked);
}

/** Apply persisted liked state to a like button after it is rendered */
function applyLikedState(btnElement, movieId) {
  if (!btnElement || !movieId) return;
  const icon = btnElement.querySelector('i');
  const tooltip = btnElement.querySelector('.tooltiptext');
  if (likedIds.has(String(movieId))) {
    if (icon) icon.className = 'fa-solid fa-thumbs-up';
    btnElement.style.color = '#e50914';
    btnElement.style.borderColor = '#e50914';
    if (tooltip) tooltip.innerText = 'Liked!';
  } else {
    if (icon) icon.className = 'fa-regular fa-thumbs-up';
    btnElement.style.color = 'white';
    btnElement.style.borderColor = 'rgba(255,255,255,0.4)';
    if (tooltip) tooltip.innerText = 'Like';
  }
}

/** Apply persisted My List state to an add-to-list button after it is rendered */
function applyListState(btnElement, movieId) {
  if (!btnElement || !movieId) return;
  const alreadyInList = myPersonalList.some(m => String(m.id) === String(movieId));
  if (alreadyInList) {
    btnElement.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from List</span>';
    btnElement.style.backgroundColor = '#46d369';
    btnElement.style.borderColor = '#46d369';
  } else {
    btnElement.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span>';
    btnElement.style.backgroundColor = 'rgba(255,255,255,0.1)';
    btnElement.style.borderColor = 'rgba(255,255,255,0.4)';
  }
}

function syncListButtonsAcrossPage(movieId, inList) {
  // Update standard add-to-list-btn buttons
  const listBtns = document.querySelectorAll(`.add-to-list-btn[data-id="${movieId}"]`);
  listBtns.forEach(btn => {
    if (inList) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from List</span>';
      btn.style.backgroundColor = '#46d369';
      btn.style.borderColor = '#46d369';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span>';
      btn.style.backgroundColor = 'rgba(255,255,255,0.1)';
      btn.style.borderColor = 'rgba(255,255,255,0.4)';
    }
  });

  // Update recommendation card add-to-list-btn buttons
  const recCards = document.querySelectorAll(`.rec-card[data-id="${movieId}"]`);
  recCards.forEach(card => {
    const btn = card.querySelector('.rec-add-btn');
    if (btn) {
      if (inList) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from List</span>';
        btn.style.backgroundColor = '#46d369';
        btn.style.borderColor = '#46d369';
      } else {
        btn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span>';
        btn.style.backgroundColor = 'rgba(255,255,255,0.1)';
        btn.style.borderColor = 'rgba(255,255,255,0.4)';
      }
    }
  });

  // Update modal list button
  const modalAddBtn = document.getElementById('modal-add-list-btn');
  if (modalAddBtn && modalAddBtn.getAttribute('data-id') == movieId) {
    if (inList) {
      modalAddBtn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from My List</span>';
      modalAddBtn.style.backgroundColor = '#46d369';
      modalAddBtn.style.borderColor = '#46d369';
    } else {
      modalAddBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to My List</span>';
      modalAddBtn.style.backgroundColor = '';
      modalAddBtn.style.borderColor = '';
    }
  }
}

function syncLikeButtonsAcrossPage(movieId, nowLiked) {
  // Update cards in movie rows and search results
  const cards = document.querySelectorAll(`.movie-card[data-id="${movieId}"], .top-10-card[data-id="${movieId}"]`);
  cards.forEach(card => {
    const btn = card.querySelector('.like-btn');
    if (btn) {
      const icon = btn.querySelector('i');
      const tooltip = btn.querySelector('.tooltiptext');
      if (nowLiked) {
        if (icon) icon.className = 'fa-solid fa-thumbs-up';
        btn.style.color = '#e50914';
        btn.style.borderColor = '#e50914';
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
        if (tooltip) tooltip.innerText = 'Liked!';
      } else {
        if (icon) icon.className = 'fa-regular fa-thumbs-up';
        btn.style.color = 'white';
        btn.style.borderColor = 'rgba(255,255,255,0.4)';
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = ''; }, 200);
        if (tooltip) tooltip.innerText = 'Like';
      }
    }
  });

  // Update modal like button
  const modalLikeBtn = document.getElementById('modal-like-btn');
  if (modalLikeBtn && modalLikeBtn.getAttribute('data-id') == movieId) {
    const icon = modalLikeBtn.querySelector('i');
    const tooltip = modalLikeBtn.querySelector('.tooltiptext');
    if (nowLiked) {
      if (icon) icon.className = 'fa-solid fa-thumbs-up';
      modalLikeBtn.style.color = '#e50914';
      modalLikeBtn.style.borderColor = '#e50914';
      modalLikeBtn.style.transform = 'scale(1.2)';
      setTimeout(() => { modalLikeBtn.style.transform = ''; }, 200);
      if (tooltip) tooltip.innerText = 'Liked!';
    } else {
      if (icon) icon.className = 'fa-regular fa-thumbs-up';
      modalLikeBtn.style.color = 'white';
      modalLikeBtn.style.borderColor = 'rgba(255,255,255,0.5)';
      modalLikeBtn.style.backgroundColor = 'rgba(20,20,20,0.6)';
      modalLikeBtn.style.transform = 'scale(0.9)';
      setTimeout(() => { modalLikeBtn.style.transform = ''; }, 200);
      if (tooltip) tooltip.innerText = 'Like';
    }
  }
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
let searchDebounceTimeout = null;
function triggerSearch(query) {
  if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);

  const mainContent = document.getElementById('main-content');
  const searchGrid = document.getElementById('search-grid-container');
  const searchQueryText = document.getElementById('search-query-text');
  const searchResultsGrid = document.getElementById('search-results-grid');

  if (!query) {
    mainContent.classList.remove('hidden');
    searchGrid.classList.add('hidden');
    return;
  }

  mainContent.classList.add('hidden');
  searchGrid.classList.remove('hidden');
  searchQueryText.innerText = query;
  searchResultsGrid.innerHTML = '<div style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding: 50px;">Searching titles...</div>';

  searchDebounceTimeout = setTimeout(async () => {
    const data = await fetchFromTMDB(`/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`);

    searchResultsGrid.innerHTML = '';
    if (!data || !data.results || data.results.length === 0) {
      searchResultsGrid.innerHTML = `<div style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding: 80px;">No matches for "${query}".</div>`;
      return;
    }

    const filteredMovies = data.results.filter(m => m.backdrop_path || m.poster_path);

    filteredMovies.forEach(movie => {
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.setAttribute('data-id', movie.id);
      card.setAttribute('data-type', movie.media_type || 'movie');
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', movie.title || movie.name || 'Search result');

      const poster = movie.backdrop_path || movie.poster_path;
      const isMobile = window.innerWidth <= 768;
      let posterSize = 'w342';
      if (movie.backdrop_path) {
        posterSize = isMobile ? 'w300' : 'w780';
      } else {
        posterSize = isMobile ? 'w185' : 'w342';
      }
      const img = document.createElement('img');
      img.src = `${IMAGE_BASE_URL}/${posterSize}${poster}`;
      img.alt = movie.title || movie.name || 'Search result';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 240;
      img.height = 135;
      card.appendChild(img);

      // Keyboard trigger
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMovieModal(movie.id, movie.media_type || 'movie');
        }
      });

      const hoverDetails = document.createElement('div');
      hoverDetails.className = 'card-hover-details';
      const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
      const releaseYear = movie.release_date || movie.first_air_date
        ? new Date(movie.release_date || movie.first_air_date).getFullYear()
        : '2024';

      hoverDetails.innerHTML = `
        <div class="card-action-row">
          <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
          <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
          <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
        </div>
        <div class="card-meta">
          <span class="card-match">${matchPct}% Match</span>
          <span class="card-rating">${resolveAgeRating(movie)}</span>
          <span>${releaseYear}</span>
        </div>
        <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
      `;
      card.appendChild(hoverDetails);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-row')) return;
        openMovieModal(movie.id, movie.media_type || 'movie');
      });

      const listBtn = hoverDetails.querySelector('.add-to-list-btn');
      if (listBtn) {
        applyListState(listBtn, movie.id);
        listBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleMyList(movie, listBtn);
        });
      }

      const likeBtn = hoverDetails.querySelector('.like-btn');
      if (likeBtn) {
        applyLikedState(likeBtn, movie.id);
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLikeButton(likeBtn, movie.id);
        });
      }

      searchResultsGrid.appendChild(card);
    });
  }, 400);
}

// ─── MOVIE MODAL ──────────────────────────────────────────────────────────────
async function openMovieModal(id, type = 'movie') {
  const modal = document.getElementById('movie-modal');
  document.body.style.overflow = 'hidden';

  let resolvedType = (type === 'tv') ? 'tv' : 'movie';

  // Reset modal
  document.getElementById('modal-movie-title').innerText = 'Loading...';
  document.getElementById('modal-overview').innerText = 'Gathering details...';
  document.getElementById('modal-backdrop-img').style.display = 'block';
  document.getElementById('modal-video-player').innerHTML = '';
  modal.classList.remove('hidden');

  let movie = await fetchFromTMDB(`/${resolvedType}/${id}?api_key=${API_KEY}&append_to_response=videos,credits,similar`);

  // Fallback: try opposite type if first fails
  if (!movie || movie.success === false) {
    resolvedType = resolvedType === 'tv' ? 'movie' : 'tv';
    movie = await fetchFromTMDB(`/${resolvedType}/${id}?api_key=${API_KEY}&append_to_response=videos,credits,similar`);
  }

  if (!movie) {
    document.getElementById('modal-movie-title').innerText = 'Error loading content';
    document.getElementById('modal-overview').innerText = 'Unable to fetch data.';
    return;
  }

  // Backdrop
  const backdropImg = document.getElementById('modal-backdrop-img');
  if (movie.backdrop_path) {
    backdropImg.src = `${IMAGE_BASE_URL}/w1280${movie.backdrop_path}`;
    backdropImg.width = 1280;
    backdropImg.height = 720;
    backdropImg.style.display = 'block';
  } else {
    backdropImg.style.display = 'none';
  }

  // Find trailer
  const videos = movie.videos ? movie.videos.results : [];
  const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip'));

  const videoPlayerContainer = document.getElementById('modal-video-player');
  if (trailer) {
    // Embed with enablejsapi, autoplay muted, no redirect to YouTube
    videoPlayerContainer.innerHTML = `
      <iframe
        id="yt-player"
        width="100%"
        height="100%"
        src="https://www.youtube-nocookie.com/embed/${trailer.key}?enablejsapi=1&autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&loop=1&playlist=${trailer.key}&origin=${encodeURIComponent(ORIGIN)}"
        title="Trailer"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
      </iframe>
    `;
    backdropImg.style.display = 'none';
  } else {
    videoPlayerContainer.innerHTML = '';
    backdropImg.style.display = 'block';
  }

  // Reset sound state
  soundMuted = true;
  const soundBtn = document.getElementById('modal-mute-btn');
  if (soundBtn) {
    soundBtn.style.display = 'flex';
    soundBtn.querySelector('i').className = 'fa-solid fa-volume-xmark';
    soundBtn.querySelector('.tooltiptext').innerText = 'Unmute';
  }

  // Modal play button → unmute + play
  const modalPlayBtn = document.getElementById('modal-play-btn');
  modalPlayBtn.onclick = () => {
    const iframe = document.querySelector('#modal-video-player iframe');
    if (iframe) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
      soundMuted = false;
      if (soundBtn) {
        soundBtn.querySelector('i').className = 'fa-solid fa-volume-high';
        soundBtn.querySelector('.tooltiptext').innerText = 'Mute';
      }
    }
  };

  // Reset like button
  const modalLikeBtn = document.getElementById('modal-like-btn');
  if (modalLikeBtn) {
    modalLikeBtn.setAttribute('data-id', id);
    modalLikeBtn.querySelector('i').className = 'fa-regular fa-thumbs-up';
    modalLikeBtn.style.color = 'white';
    modalLikeBtn.style.borderColor = 'rgba(255,255,255,0.5)';
    modalLikeBtn.style.backgroundColor = 'rgba(20,20,20,0.6)';
    const tooltip = modalLikeBtn.querySelector('.tooltiptext');
    if (tooltip) tooltip.innerText = 'Like';
    // Apply persisted liked state for this movie
    applyLikedState(modalLikeBtn, id);
    // Re-wire click (replace previous handler to avoid stacking)
    modalLikeBtn.onclick = () => toggleLikeButton(modalLikeBtn, id);
  }

  // Wire modal + / ✅ (Add to My List) button
  const modalAddBtn = document.getElementById('modal-add-list-btn');
  if (modalAddBtn) {
    modalAddBtn.setAttribute('data-id', id);
    // Restore state: show ✅ if already in list, + if not
    const alreadyInList = myPersonalList.some(m => String(m.id) === String(id));
    if (alreadyInList) {
      modalAddBtn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from My List</span>';
      modalAddBtn.style.backgroundColor = '#46d369';
      modalAddBtn.style.borderColor = '#46d369';
    } else {
      modalAddBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to My List</span>';
      modalAddBtn.style.backgroundColor = '';
      modalAddBtn.style.borderColor = '';
    }
    // Re-assign onclick each time modal opens so it always uses the current movie
    modalAddBtn.onclick = () => {
      toggleMyList(movie, modalAddBtn);
    };
  }

  // Populate details
  document.getElementById('modal-movie-title').innerText = movie.title || movie.name || movie.original_name;
  document.getElementById('modal-overview').innerText = movie.overview || 'No overview available.';

  const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
  document.getElementById('modal-match').innerText = `${matchPct}% Match`;

  const dateStr = movie.release_date || movie.first_air_date;
  document.getElementById('modal-year').innerText = dateStr ? new Date(dateStr).getFullYear() : '2024';

  const runtimeVal = movie.runtime
    ? `${movie.runtime}m`
    : movie.number_of_seasons
      ? `${movie.number_of_seasons} Season${movie.number_of_seasons > 1 ? 's' : ''}`
      : 'HD';
  document.getElementById('modal-duration').innerText = runtimeVal;
  const genreIds = (movie.genres || []).map(g => g.id);
  const resolvedAge = movie.adult ? '18+' : (genreIds.includes(16) || genreIds.includes(10751) ? 'G' : (genreIds.includes(27) || genreIds.includes(80) ? '16+' : '13+'));
  document.getElementById('modal-age-rating').innerText = resolvedAge;

  const cast = movie.credits ? movie.credits.cast : [];
  document.getElementById('modal-cast').innerText = cast.slice(0, 5).map(c => c.name).join(', ') || 'N/A';

  const genres = movie.genres || [];
  document.getElementById('modal-genres').innerText = genres.map(g => g.name).join(', ') || 'N/A';

  const vibe = genres.slice(0, 2).map(g => g.name).join(', ') || 'Engaging';
  document.getElementById('modal-vibe').innerText = vibe;

  const similar = movie.similar ? movie.similar.results : [];
  populateRecommendations(similar.slice(0, 9));
}

function populateRecommendations(items) {
  const grid = document.getElementById('modal-recommendations-grid');
  grid.innerHTML = '';

  if (!items || items.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted); grid-column: 1/-1; padding: 20px;">No similar titles found.</div>';
    return;
  }

  items.forEach(movie => {
    if (!movie.backdrop_path && !movie.poster_path) return;

    const card = document.createElement('div');
    card.className = 'rec-card';
    card.setAttribute('data-id', movie.id);
    const resolvedType = movie.first_air_date ? 'tv' : 'movie';
    card.setAttribute('data-type', resolvedType);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', movie.title || movie.name || 'Similar title');

    const poster = movie.backdrop_path || movie.poster_path;
    const isMobile = window.innerWidth <= 768;
    let posterSize = 'w342';
    if (movie.backdrop_path) {
      posterSize = isMobile ? 'w300' : 'w780';
    } else {
      posterSize = isMobile ? 'w185' : 'w342';
    }
    const imgUrl = `${IMAGE_BASE_URL}/${posterSize}${poster}`;
    const year = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';
    const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);

    card.innerHTML = `
      <div class="rec-img-container">
        <img src="${imgUrl}" alt="${movie.title || movie.name}" loading="lazy" decoding="async" width="266" height="150">
        <span class="rec-badge">HD</span>
      </div>
      <div class="rec-details">
        <div class="rec-meta">
          <div class="rec-meta-left">
            <span class="rec-match">${matchPct}% Match</span>
            <span class="rec-age">13+</span>
            <span>${year}</span>
          </div>
          <button class="rec-add-btn tooltip" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
        </div>
        <h4 class="rec-title">${movie.title || movie.name || movie.original_name}</h4>
        <p class="rec-description">${movie.overview || 'No overview available.'}</p>
      </div>
    `;

    // Keyboard trigger
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(movie.id, resolvedType);
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.rec-add-btn')) return;
      openMovieModal(movie.id, resolvedType);
    });

    // Wire the add-to-list button in each recommendation card
    const recAddBtn = card.querySelector('.rec-add-btn');
    if (recAddBtn) {
      applyListState(recAddBtn, movie.id); // restore persisted state
      recAddBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMyList(movie, recAddBtn);
        // Sync icon/colour manually since toggleMyList drives innerHTML
        const inList = myPersonalList.some(m => m.id === movie.id);
        recAddBtn.querySelector('.tooltiptext').innerText = inList ? 'Remove from List' : 'Add to List';
      });
    }

    grid.appendChild(card);
  });
}

function closeModal() {
  const modal = document.getElementById('movie-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('modal-video-player').innerHTML = '';
}

// ─── FEED MANAGEMENT ──────────────────────────────────────────────────────────
function clearFeed() {
  document.getElementById('rows-container').innerHTML = '';
  document.getElementById('search-grid-container').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('hero-banner').style.display = 'flex';
  window.scrollTo(0, 0);
}

function setKidsMode(active) {
  isKidsMode = active;
  const navbar = document.getElementById('navbar');
  const kidsLabel = document.querySelector('.kids-label');

  if (active) {
    // Show Netflix Kids branding in navbar
    document.body.classList.add('kids-mode');
    const navbarAvatar = document.querySelector('.profile-avatar');
    if (navbarAvatar) {
      navbarAvatar.src = 'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="10" fill="%23e9a716"/><circle cx="32" cy="38" r="6" fill="white"/><circle cx="68" cy="38" r="6" fill="white"/><path d="M 30,55 A 25,25 0 0,0 70,55" fill="none" stroke="white" stroke-width="8" stroke-linecap="round"/></svg>';
    }
    if (kidsLabel) kidsLabel.style.fontWeight = '700';
  } else {
    document.body.classList.remove('kids-mode');
    const navbarAvatar = document.querySelector('.profile-avatar');
    if (navbarAvatar) {
      navbarAvatar.src = 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png';
    }
    if (kidsLabel) kidsLabel.style.fontWeight = '';
  }
}

// ─── FEEDS ────────────────────────────────────────────────────────────────────
async function showHomeFeed() {
  clearFeed();
  setKidsMode(false);

  const recentResponse = await fetchFromTMDB(requests.fetchRecentReleases);
  if (recentResponse && recentResponse.results.length > 0) {
    await setupHeroBanner(recentResponse.results, 'movie');
  }

  renderTop10Row('Top 10 Trending Today', requests.fetchTrendingToday);
  renderMovieRow('Action Thrillers', requests.fetchActionMovies, false);
  renderMovieRow('Sci-Fi Specials', requests.fetchSciFiMovies, false);
  renderMovieRow('Scary Horror Movies', requests.fetchHorrorMovies, false);
  renderMovieRow('Romance Classics', requests.fetchRomanceMovies, false);
  renderMovieRow('Psychological Thrillers', requests.fetchThrillerMovies, false);
}

async function showTVFeed() {
  clearFeed();
  setKidsMode(false);

  const tvResponse = await fetchFromTMDB(`/discover/tv?api_key=${API_KEY}&with_networks=213`);
  if (tvResponse && tvResponse.results.length > 0) await setupHeroBanner(tvResponse.results, 'tv');

  renderMovieRow('Trending TV Series', `/trending/tv/week?api_key=${API_KEY}`, false);
  renderMovieRow('Top Rated Series', `/tv/top_rated?api_key=${API_KEY}`, false);
  renderMovieRow('Action & Adventure Shows', `/discover/tv?api_key=${API_KEY}&with_genres=10759`, false);
  renderMovieRow('Sci-Fi & Fantasy Series', `/discover/tv?api_key=${API_KEY}&with_genres=10765`, false);
  renderMovieRow('Comedy Series', `/discover/tv?api_key=${API_KEY}&with_genres=35`, false);
}

async function showMoviesFeed() {
  clearFeed();
  setKidsMode(false);

  const movieResponse = await fetchFromTMDB(requests.fetchRecentReleases);
  if (movieResponse && movieResponse.results.length > 0) await setupHeroBanner(movieResponse.results, 'movie');

  renderMovieRow('Trending Movies', `/trending/movie/week?api_key=${API_KEY}`, false);
  renderMovieRow('Top Rated Movies', `/movie/top_rated?api_key=${API_KEY}`, false);
  renderMovieRow('Action Thrillers', requests.fetchActionMovies, false);
  renderMovieRow('Sci-Fi Specials', requests.fetchSciFiMovies, false);
  renderMovieRow('Scary Horror Movies', requests.fetchHorrorMovies, false);
  renderMovieRow('Romance Classics', requests.fetchRomanceMovies, false);
}

async function showLatestFeed() {
  clearFeed();
  setKidsMode(false);

  const upcomingMovies = `/movie/upcoming?api_key=${API_KEY}&language=en-US&page=1`;
  const upcomingResponse = await fetchFromTMDB(upcomingMovies);
  if (upcomingResponse && upcomingResponse.results.length > 0) await setupHeroBanner(upcomingResponse.results, 'movie');

  renderMovieRow('Upcoming Releases', upcomingMovies, false);
  renderMovieRow('Now Playing in Theaters', requests.fetchRecentReleases, false);
}

async function showMyListFeed() {
  clearFeed();
  setKidsMode(false);
  document.getElementById('hero-banner').style.display = 'none';

  const rowsContainer = document.getElementById('rows-container');
  const section = document.createElement('div');
  section.className = 'search-grid-container';
  section.style.padding = '100px 4% 50px 4%';

  const header = document.createElement('div');
  header.className = 'search-header';
  header.innerHTML = '<h2>My List</h2>';
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'search-results-grid';

  if (myPersonalList.length === 0) {
    grid.innerHTML = `
      <div style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding: 120px 0; font-size:1.15rem;">
        <i class="fa-solid fa-plus" style="font-size:3.5rem; margin-bottom:20px; display:block; color:rgba(255,255,255,0.25);"></i>
        You haven't added any titles yet. Browse and add content to your list!
      </div>
    `;
  } else {
    myPersonalList.forEach(movie => {
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.setAttribute('data-id', movie.id);
      const type = movie.first_air_date ? 'tv' : 'movie';
      card.setAttribute('data-type', type);
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', movie.title || movie.name || 'My List item');

      const poster = movie.backdrop_path || movie.poster_path;
      const isMobile = window.innerWidth <= 768;
      let posterSize = 'w342';
      if (movie.backdrop_path) {
        posterSize = isMobile ? 'w300' : 'w780';
      } else {
        posterSize = isMobile ? 'w185' : 'w342';
      }
      const img = document.createElement('img');
      img.src = `${IMAGE_BASE_URL}/${posterSize}${poster}`;
      img.alt = movie.title || movie.name || 'My List';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 240;
      img.height = 135;
      card.appendChild(img);

      // Keyboard trigger
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMovieModal(movie.id, type);
        }
      });

      const hoverDetails = document.createElement('div');
      hoverDetails.className = 'card-hover-details';
      const matchPct = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
      const releaseYear = movie.release_date || movie.first_air_date
        ? new Date(movie.release_date || movie.first_air_date).getFullYear()
        : '2024';

      hoverDetails.innerHTML = `
        <div class="card-action-row">
          <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
          <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Remove from List">
            <i class="fa-solid fa-check"></i>
            <span class="tooltiptext">Remove from List</span>
          </button>
          <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
        </div>
        <div class="card-meta">
          <span class="card-match">${matchPct}% Match</span>
          <span class="card-rating">${resolveAgeRating(movie)}</span>
          <span>${releaseYear}</span>
        </div>
        <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
      `;
      card.appendChild(hoverDetails);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-row')) return;
        openMovieModal(movie.id, type);
      });

      const removeBtn = card.querySelector('.add-to-list-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMyList(movie, removeBtn);
        showMyListFeed();
      });

      const likeBtn = card.querySelector('.like-btn');
      if (likeBtn) {
        applyLikedState(likeBtn, movie.id);
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLikeButton(likeBtn, movie.id);
        });
      }

      grid.appendChild(card);
    });
  }

  section.appendChild(grid);
  rowsContainer.appendChild(section);
}

async function showKidsFeed() {
  clearFeed();
  setKidsMode(true);

  // Kids-specific hero banner area styling
  const heroBanner = document.getElementById('hero-banner');
  heroBanner.classList.add('kids-hero');

  // Fetch popular family animations for hero
  const animResponse = await fetchFromTMDB(`/discover/movie?api_key=${API_KEY}&with_genres=16&sort_by=popularity.desc&page=1`);
  if (animResponse && animResponse.results.length > 0) {
    await setupHeroBanner(animResponse.results, 'movie');
  }

  // Distinct endpoints for each kids row - no duplicates
  const kidsAnimation = `/discover/movie?api_key=${API_KEY}&with_genres=16&sort_by=popularity.desc&page=1`;
  const kidsFamily = `/discover/movie?api_key=${API_KEY}&with_genres=10751&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=1`;
  const kidsAdventure = `/discover/movie?api_key=${API_KEY}&with_genres=12&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=2`;
  const kidsTVShows = `/discover/tv?api_key=${API_KEY}&with_genres=10762&sort_by=popularity.desc&page=1`;
  const kidsComedy = `/discover/movie?api_key=${API_KEY}&with_genres=35&certification_country=US&certification.lte=G&sort_by=popularity.desc&page=1`;

  renderMovieRow('Popular Animations', kidsAnimation, false);
  renderMovieRow('Family Favourites', kidsFamily, false);
  renderMovieRow('Adventure & Fantasy', kidsAdventure, false);
  renderMovieRow('Kids TV Shows', kidsTVShows, false);
  renderMovieRow('Fun Comedies', kidsComedy, false);
}

// ─── ROUTING ─────────────────────────────────────────────────────────────────
function handleRouting() {
  const hash = window.location.hash || '#home';

  const linkHome = document.getElementById('link-home');
  const linkTV = document.getElementById('link-tv');
  const linkMovies = document.getElementById('link-movies');
  const linkLatest = document.getElementById('link-latest');
  const linkMyList = document.getElementById('link-mylist');
  const navLinksArray = [linkHome, linkTV, linkMovies, linkLatest, linkMyList];

  // Mobile nav link map (hash → element ID)
  const mobileNavMap = {
    '#home': 'm-link-home',
    '#tv': 'm-link-tv',
    '#movies': 'm-link-movies',
    '#latest': 'm-link-latest',
    '#mylist': 'm-link-mylist',
    '#kids': 'm-link-kids',
  };
  const allMobileLinks = Object.values(mobileNavMap).map(id => document.getElementById(id));

  function setActiveNavLink(activeLink) {
    // Desktop links
    navLinksArray.forEach(link => { if (link) link.classList.remove('active'); });
    if (activeLink) activeLink.classList.add('active');
    // Mobile links
    allMobileLinks.forEach(link => { if (link) link.classList.remove('active'); });
    const mobileActiveId = mobileNavMap[hash];
    if (mobileActiveId) {
      const mobileActive = document.getElementById(mobileActiveId);
      if (mobileActive) mobileActive.classList.add('active');
    }
  }

  if (hash === '#tv') {
    setActiveNavLink(linkTV);
    showTVFeed();
  } else if (hash === '#movies') {
    setActiveNavLink(linkMovies);
    showMoviesFeed();
  } else if (hash === '#latest') {
    setActiveNavLink(linkLatest);
    showLatestFeed();
  } else if (hash === '#mylist') {
    setActiveNavLink(linkMyList);
    showMyListFeed();
  } else if (hash === '#kids') {
    setActiveNavLink(null);
    showKidsFeed();
  } else {
    setActiveNavLink(linkHome);
    showHomeFeed();
  }
}

window.addEventListener('hashchange', handleRouting);
