/**
 * Netflix Clone - Complete App Script
 * Sections: Profile Screen → Hero (Now Playing) → Top 10 Trending → Genre Rows
 */

'use strict';

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const PROXY = '/.netlify/functions/tmdb?path=';
const IMG   = 'https://image.tmdb.org/t/p';

const GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10765: 'Sci-Fi & Fantasy'
};

const LS_LIST  = 'nfc_mylist';
const LS_LIKES = 'nfc_likes';

// ─── STATE ─────────────────────────────────────────────────────────────────────
let myList  = loadJSON(LS_LIST, []);
let likes   = new Set(loadJSON(LS_LIKES, []));
let muted   = true;
let searchTimer = null;
let currentHeroId   = null;
let currentHeroType = 'movie';

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────────
function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── TOAST ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  const sp = document.getElementById('toast-msg');
  if (!el || !sp) return;
  sp.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── TMDB FETCH ────────────────────────────────────────────────────────────────
async function tmdb(endpoint) {
  const url = `${PROXY}${encodeURIComponent(endpoint)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[TMDB]', endpoint, e.message);
    return null;
  }
}

// ─── PROFILE SCREEN ────────────────────────────────────────────────────────────
function initProfileScreen() {
  const screen = document.getElementById('profile-screen');
  const app    = document.getElementById('app');

  function selectProfile(type) {
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.style.display = 'none';
      app.classList.remove('hidden');
      requestAnimationFrame(() => app.classList.add('visible'));
      sessionStorage.setItem('profile', type);
      loadHomeFeed();
    }, 500);
  }

  document.getElementById('btn-profile-user').addEventListener('click', () => selectProfile('user'));
  document.getElementById('btn-profile-kids').addEventListener('click', () => selectProfile('kids'));

  // Profile dropdown sign out
  document.getElementById('dd-signout').addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('profile');
    screen.style.display = '';
    screen.classList.remove('fade-out');
    app.classList.remove('visible');
    setTimeout(() => app.classList.add('hidden'), 100);
    toast('Signed out');
  });

  document.getElementById('dd-switch-user').addEventListener('click', () => selectProfile('user'));
  document.getElementById('dd-switch-kids').addEventListener('click', () => selectProfile('kids'));

  // Resume session if already logged in
  const existing = sessionStorage.getItem('profile');
  if (existing) {
    screen.style.display = 'none';
    app.classList.remove('hidden');
    requestAnimationFrame(() => app.classList.add('visible'));
    loadHomeFeed();
  }
}

// ─── NAVBAR ────────────────────────────────────────────────────────────────────
function initNavbar() {
  // Scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // Nav links
  const links = [
    { id: 'link-home',    feed: 'home' },
    { id: 'link-tv',      feed: 'tv' },
    { id: 'link-movies',  feed: 'movies' },
    { id: 'link-new',     feed: 'new' },
    { id: 'link-mylist',  feed: 'mylist' }
  ];

  links.forEach(({ id, feed }) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveLink(id);
      loadFeed(feed);
    });
  });

  document.getElementById('kids-nav-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadFeed('kids');
  });

  // Logo → home
  document.getElementById('logo-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveLink('link-home');
    loadFeed('home');
  });

  // Search
  const wrap   = document.getElementById('search-wrap');
  const input  = document.getElementById('search-input');
  const toggle = document.getElementById('search-toggle-btn');
  const clear  = document.getElementById('search-clear-btn');

  toggle.addEventListener('click', () => {
    if (wrap.classList.contains('open')) {
      // close
      wrap.classList.remove('open');
      input.value = '';
      hideSearch();
    } else {
      wrap.classList.add('open');
      input.focus();
    }
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clear) clear.classList.toggle('hidden', !q);
    clearTimeout(searchTimer);
    if (!q) { hideSearch(); return; }
    searchTimer = setTimeout(() => runSearch(q), 400);
  });

  clear?.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    hideSearch();
    input.focus();
  });

  // Close search on outside click
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('open');
      input.value = '';
      clear?.classList.add('hidden');
      hideSearch();
    }
  });
}

function setActiveLink(activeId) {
  ['link-home','link-tv','link-movies','link-new','link-mylist'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === activeId);
  });
}

// ─── FEED LOADER ───────────────────────────────────────────────────────────────
function loadFeed(type) {
  const main    = document.getElementById('main-content');
  const search  = document.getElementById('search-section');
  const mylist  = document.getElementById('mylist-section');

  // Always show main by default
  main?.classList.remove('hidden');
  search?.classList.add('hidden');
  mylist?.classList.add('hidden');
  window.scrollTo({ top: 0 });

  const heroEl = document.getElementById('hero-section');
  if (heroEl) heroEl.style.display = '';

  if (type === 'home') { loadHomeFeed(); return; }
  if (type === 'tv')   { loadTVFeed();   return; }
  if (type === 'movies') { loadMoviesFeed(); return; }
  if (type === 'new')  { loadNewFeed();  return; }
  if (type === 'kids') { loadKidsFeed(); return; }
  if (type === 'mylist') {
    heroEl.style.display = 'none';
    main.classList.add('hidden');
    mylist.classList.remove('hidden');
    renderMyList();
    return;
  }
}

// ─── HOME FEED ─────────────────────────────────────────────────────────────────
async function loadHomeFeed() {
  clearRows();
  setActiveLink('link-home');

  // 1. Hero: Recent releases
  const nowPlaying = await tmdb('/movie/now_playing?language=en-US&page=1');
  renderHero(nowPlaying?.results || [], 'movie');

  // 2. Top 10 Trending
  renderTop10Row('Top 10 in India Today', '/trending/all/day');

  // 3. Genre rows
  renderRow('New Releases',      '/movie/now_playing?language=en-US&page=1');
  renderRow('Trending Now',      '/trending/movie/week');
  renderRow('Horror Movies',     '/discover/movie?with_genres=27&sort_by=popularity.desc');
  renderRow('Romantic Movies',   '/discover/movie?with_genres=10749&sort_by=popularity.desc');
  renderRow('Action Movies',     '/discover/movie?with_genres=28&sort_by=popularity.desc');
  renderRow('Thriller Movies',   '/discover/movie?with_genres=53&sort_by=popularity.desc');
  renderRow('Sci-Fi Movies',     '/discover/movie?with_genres=878&sort_by=popularity.desc');
  renderRow('Comedy Movies',     '/discover/movie?with_genres=35&sort_by=popularity.desc');
  renderRow('Documentaries',     '/discover/movie?with_genres=99&sort_by=popularity.desc');
  renderRow('Award-Winning',     '/discover/movie?sort_by=vote_average.desc&vote_count.gte=5000');
}

// ─── TV FEED ───────────────────────────────────────────────────────────────────
async function loadTVFeed() {
  clearRows();
  setActiveLink('link-tv');

  const tvPop = await tmdb('/tv/popular?language=en-US&page=1');
  renderHero(tvPop?.results || [], 'tv');

  renderTop10Row('Top 10 TV Shows Today', '/trending/tv/day');
  renderRow('Popular TV Shows',         '/tv/popular?language=en-US&page=1');
  renderRow('Top Rated Series',         '/tv/top_rated?language=en-US');
  renderRow('Trending This Week',       '/trending/tv/week');
  renderRow('Action & Adventure',       '/discover/tv?with_genres=10759&sort_by=popularity.desc');
  renderRow('Sci-Fi & Fantasy',         '/discover/tv?with_genres=10765&sort_by=popularity.desc');
  renderRow('Crime & Mystery',          '/discover/tv?with_genres=80&sort_by=popularity.desc');
  renderRow('Comedy Series',            '/discover/tv?with_genres=35&sort_by=popularity.desc');
  renderRow('Drama Series',             '/discover/tv?with_genres=18&sort_by=popularity.desc');
}

// ─── MOVIES FEED ───────────────────────────────────────────────────────────────
async function loadMoviesFeed() {
  clearRows();
  setActiveLink('link-movies');

  const releases = await tmdb('/movie/now_playing?language=en-US&page=1');
  renderHero(releases?.results || [], 'movie');

  renderTop10Row('Top 10 Movies Today', '/trending/movie/day');
  renderRow('Now Playing in Theaters', '/movie/now_playing?language=en-US&page=1');
  renderRow('Trending Movies',         '/trending/movie/week');
  renderRow('Top Rated Movies',        '/movie/top_rated?language=en-US');
  renderRow('Horror Movies',           '/discover/movie?with_genres=27&sort_by=popularity.desc');
  renderRow('Romantic Movies',         '/discover/movie?with_genres=10749&sort_by=popularity.desc');
  renderRow('Action Movies',           '/discover/movie?with_genres=28&sort_by=popularity.desc');
  renderRow('Thriller Movies',         '/discover/movie?with_genres=53&sort_by=popularity.desc');
  renderRow('Sci-Fi Movies',           '/discover/movie?with_genres=878&sort_by=popularity.desc');
  renderRow('Comedy Movies',           '/discover/movie?with_genres=35&sort_by=popularity.desc');
}

// ─── NEW & POPULAR FEED ────────────────────────────────────────────────────────
async function loadNewFeed() {
  clearRows();
  setActiveLink('link-new');

  const upcoming = await tmdb('/movie/upcoming?language=en-US&page=1');
  renderHero(upcoming?.results || [], 'movie');

  renderTop10Row('Top 10 Today',            '/trending/all/day');
  renderRow('Upcoming Releases',            '/movie/upcoming?language=en-US&page=1');
  renderRow('Now Playing',                  '/movie/now_playing?language=en-US&page=1');
  renderRow('Recently Added TV Shows',      '/tv/on_the_air?language=en-US&page=1');
  renderRow('Airing Today',                 '/tv/airing_today?language=en-US&page=1');
}

// ─── KIDS FEED ─────────────────────────────────────────────────────────────────
async function loadKidsFeed() {
  clearRows();

  const kidsMovies = await tmdb('/discover/movie?with_genres=16&sort_by=popularity.desc');
  renderHero(kidsMovies?.results || [], 'movie');

  renderRow('Popular Animations',   '/discover/movie?with_genres=16&sort_by=popularity.desc');
  renderRow('Family Movies',        '/discover/movie?with_genres=10751&sort_by=popularity.desc');
  renderRow('Kids TV Shows',        '/discover/tv?with_genres=10762&sort_by=popularity.desc');
  renderRow('Adventure & Fantasy',  '/discover/movie?with_genres=12&sort_by=popularity.desc');
  renderRow('Fun Comedies',         '/discover/movie?with_genres=35&certification_country=US&certification.lte=G&sort_by=popularity.desc');
}

// ─── CLEAR ROWS ────────────────────────────────────────────────────────────────
function clearRows() {
  const el = document.getElementById('rows-section');
  if (el) el.innerHTML = '';
}

// ─── HERO SECTION ──────────────────────────────────────────────────────────────
function renderHero(movies, defaultType) {
  const eligible = movies.filter(m => m.backdrop_path && m.overview);
  if (!eligible.length) {
    document.getElementById('hero-skeleton')?.style.setProperty('display', 'none');
    return;
  }

  const movie = eligible[Math.floor(Math.random() * Math.min(eligible.length, 6))];
  const type  = movie.media_type || (movie.first_air_date ? 'tv' : defaultType);
  currentHeroId   = movie.id;
  currentHeroType = type;

  // Show skeleton
  const skeleton = document.getElementById('hero-skeleton');
  const content  = document.getElementById('hero-content');
  if (skeleton) skeleton.style.display = 'flex';
  if (content)  content.style.visibility = 'hidden';

  // Load backdrop image
  const img = document.getElementById('hero-img');
  if (img) {
    img.src = `${IMG}/w1280${movie.backdrop_path}`;
    img.onload = () => {
      img.classList.add('loaded');
      if (skeleton) skeleton.style.display = 'none';
      if (content)  content.style.visibility = 'visible';
    };
    img.onerror = () => {
      if (skeleton) skeleton.style.display = 'none';
      if (content)  content.style.visibility = 'visible';
    };
    img.alt = movie.title || movie.name || '';
  }

  // Title
  const title = movie.title || movie.name || movie.original_name || 'Unknown Title';
  const el = (id) => document.getElementById(id);

  el('hero-title').textContent  = title;
  el('hero-desc').textContent   = movie.overview;

  const matchPct = Math.min(99, Math.floor((movie.vote_average || 7) * 10));
  el('hero-match').textContent  = `${matchPct}% Match`;

  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  el('hero-year').textContent   = year;

  const genres = (movie.genre_ids || []);
  const ageRating = movie.adult ? '18+' : (genres.includes(16) || genres.includes(10751) ? 'G' : genres.includes(27) || genres.includes(80) ? '16+' : '13+');
  el('hero-rating').textContent = ageRating;

  const isDrama = genres.includes(18);
  el('hero-duration').textContent = type === 'tv' ? 'Series' : (isDrama ? 'Film' : '');

  // Badge
  const badge = el('hero-badge');
  if (badge) badge.style.display = type === 'tv' ? 'flex' : 'none';

  // Buttons
  const playBtn = el('hero-play-btn');
  const infoBtn = el('hero-info-btn');
  if (playBtn) {
    playBtn.onclick = () => openModal(currentHeroId, currentHeroType);
  }
  if (infoBtn) {
    infoBtn.onclick = () => openModal(currentHeroId, currentHeroType);
  }

  // Fetch full details async for better duration/season info
  tmdb(`/${type}/${movie.id}`).then(details => {
    if (!details) return;
    if (type === 'movie' && details.runtime) {
      const h = Math.floor(details.runtime / 60);
      const m = details.runtime % 60;
      if (el('hero-duration')) el('hero-duration').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    } else if (type === 'tv' && details.number_of_seasons) {
      if (el('hero-duration')) el('hero-duration').textContent = `${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}`;
    }
  });
}

// ─── RENDER ROW ────────────────────────────────────────────────────────────────
async function renderRow(title, endpoint, isOriginals = false) {
  const container = document.getElementById('rows-section');
  if (!container) return;

  // Create placeholder row immediately
  const rowEl = document.createElement('div');
  rowEl.className = `movie-row${isOriginals ? ' originals-row' : ''}`;
  rowEl.innerHTML = `
    <div class="row-header">
      <h2 class="row-title">${title}</h2>
      <span class="row-explore">Explore All <i class="fa-solid fa-chevron-right"></i></span>
    </div>
    <div class="row-scroll-wrap">
      <button class="row-arrow arrow-left" aria-label="Scroll left"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="row-cards" data-endpoint="${encodeURIComponent(endpoint)}"></div>
      <button class="row-arrow arrow-right" aria-label="Scroll right"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  `;
  container.appendChild(rowEl);

  const cardsEl    = rowEl.querySelector('.row-cards');
  const arrowLeft  = rowEl.querySelector('.arrow-left');
  const arrowRight = rowEl.querySelector('.arrow-right');

  arrowLeft.addEventListener('click',  () => cardsEl.scrollBy({ left: -cardsEl.offsetWidth * 0.8, behavior: 'smooth' }));
  arrowRight.addEventListener('click', () => cardsEl.scrollBy({ left:  cardsEl.offsetWidth * 0.8, behavior: 'smooth' }));

  // Fetch data
  const data = await tmdb(endpoint);
  if (!data?.results?.length) { rowEl.remove(); return; }

  // Deduplicate
  const seen = new Set();
  const items = data.results.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return (isOriginals ? m.poster_path : (m.backdrop_path || m.poster_path));
  });

  items.forEach(movie => {
    const card = createMovieCard(movie, isOriginals);
    cardsEl.appendChild(card);
  });
}

// ─── CREATE MOVIE CARD ─────────────────────────────────────────────────────────
function createMovieCard(movie, isOriginals = false) {
  const type  = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
  const title = movie.title || movie.name || movie.original_name || '';
  const matchPct  = Math.min(99, Math.floor((movie.vote_average || 7) * 10));
  const year  = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const genres = (movie.genre_ids || []).slice(0, 3).map(id => GENRE_MAP[id]).filter(Boolean).join(' • ');
  const ageRating = movie.adult ? '18+' : ((movie.genre_ids||[]).includes(16) || (movie.genre_ids||[]).includes(10751) ? 'G' : (movie.genre_ids||[]).includes(27) ? '16+' : '13+');

  const poster   = isOriginals ? movie.poster_path : (movie.backdrop_path || movie.poster_path);
  const imgSize  = isOriginals ? 'w342' : 'w780';
  const inList   = myList.some(m => m.id === movie.id);
  const isLiked  = likes.has(String(movie.id));

  const card = document.createElement('div');
  card.className = 'movie-card';
  card.setAttribute('data-id', movie.id);
  card.setAttribute('data-type', type);
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', title);

  card.innerHTML = `
    <img src="${IMG}/${imgSize}${poster}" alt="${title}" loading="lazy" decoding="async">
    <div class="card-panel">
      <div class="card-actions">
        <button class="card-btn play-btn" data-action="play" title="Play"><i class="fa-solid fa-play"></i></button>
        <button class="card-btn tooltip-wrap list-btn${inList ? ' in-list' : ''}" data-action="list" title="${inList ? 'Remove from My List' : 'Add to My List'}">
          <i class="fa-solid fa-${inList ? 'check' : 'plus'}"></i>
          <span class="tooltip-text">${inList ? 'Remove from List' : 'Add to My List'}</span>
        </button>
        <button class="card-btn tooltip-wrap like-btn${isLiked ? ' liked' : ''}" data-action="like" title="${isLiked ? 'Liked' : 'Like'}">
          <i class="fa-${isLiked ? 'solid' : 'regular'} fa-thumbs-up"></i>
          <span class="tooltip-text">${isLiked ? 'Liked' : 'Like'}</span>
        </button>
        <button class="card-btn card-more-btn tooltip-wrap" data-action="more" title="More Info">
          <i class="fa-solid fa-chevron-down"></i>
          <span class="tooltip-text">More Info</span>
        </button>
      </div>
      <div class="card-info">
        <div class="card-meta-row">
          <span class="card-match">${matchPct}% Match</span>
          <span class="card-age">${ageRating}</span>
          <span class="card-year">${year}</span>
        </div>
        <div class="card-title-text">${title}</div>
        ${genres ? `<div class="card-genres-text">${genres}</div>` : ''}
      </div>
    </div>
  `;

  // Edge detection for transform-origin
  card.addEventListener('mouseenter', () => {
    const rect = card.getBoundingClientRect();
    const near = 80;
    if (rect.left < near) card.style.transformOrigin = 'left center';
    else if (window.innerWidth - rect.right < near) card.style.transformOrigin = 'right center';
    else card.style.transformOrigin = 'center center';
  });

  card.addEventListener('mouseleave', () => {
    card.style.transformOrigin = '';
  });

  // Click handler
  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'play' || action === 'more') {
      openModal(movie.id, type);
    } else if (action === 'list') {
      toggleList(movie, card.querySelector('.list-btn'));
    } else if (action === 'like') {
      toggleLike(movie.id, card.querySelector('.like-btn'));
    } else if (!action) {
      openModal(movie.id, type);
    }
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal(movie.id, type);
    }
  });

  return card;
}

// ─── TOP 10 ROW ────────────────────────────────────────────────────────────────
async function renderTop10Row(title, endpoint) {
  const container = document.getElementById('rows-section');
  if (!container) return;

  const data = await tmdb(endpoint);
  if (!data?.results?.length) return;

  const rowEl = document.createElement('div');
  rowEl.className = 'movie-row';
  rowEl.innerHTML = `
    <div class="row-header">
      <h2 class="row-title">${title}</h2>
      <span class="row-explore">Explore All <i class="fa-solid fa-chevron-right"></i></span>
    </div>
    <div class="row-scroll-wrap">
      <button class="row-arrow arrow-left" aria-label="Scroll left"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="row-cards top10-cards"></div>
      <button class="row-arrow arrow-right" aria-label="Scroll right"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  `;
  container.appendChild(rowEl);

  const cardsEl = rowEl.querySelector('.row-cards');
  const aL      = rowEl.querySelector('.arrow-left');
  const aR      = rowEl.querySelector('.arrow-right');
  aL.addEventListener('click', () => cardsEl.scrollBy({ left: -cardsEl.offsetWidth * 0.8, behavior: 'smooth' }));
  aR.addEventListener('click', () => cardsEl.scrollBy({ left:  cardsEl.offsetWidth * 0.8, behavior: 'smooth' }));

  const items = data.results.filter(m => m.poster_path).slice(0, 10);
  items.forEach((movie, idx) => {
    const card = createTop10Card(movie, idx + 1);
    cardsEl.appendChild(card);
  });
}

function createTop10Card(movie, rank) {
  const type  = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
  const title = movie.title || movie.name || movie.original_name || '';
  const matchPct = Math.min(99, Math.floor((movie.vote_average || 7) * 10));
  const year  = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const inList  = myList.some(m => m.id === movie.id);
  const isLiked = likes.has(String(movie.id));

  const card = document.createElement('div');
  card.className = 'top10-card';
  card.setAttribute('data-id', movie.id);
  card.setAttribute('data-type', type);
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `#${rank}: ${title}`);

  card.innerHTML = `
    <span class="top10-number">${rank}</span>
    <img src="${IMG}/w342${movie.poster_path}" alt="${title}" loading="lazy" decoding="async">
    <div class="top10-panel">
      <div class="card-actions">
        <button class="card-btn play-btn" data-action="play" title="Play"><i class="fa-solid fa-play"></i></button>
        <button class="card-btn tooltip-wrap list-btn${inList ? ' in-list' : ''}" data-action="list">
          <i class="fa-solid fa-${inList ? 'check' : 'plus'}"></i>
          <span class="tooltip-text">${inList ? 'Remove from List' : 'Add to My List'}</span>
        </button>
        <button class="card-btn tooltip-wrap like-btn${isLiked ? ' liked' : ''}" data-action="like">
          <i class="fa-${isLiked ? 'solid' : 'regular'} fa-thumbs-up"></i>
          <span class="tooltip-text">${isLiked ? 'Liked' : 'Like'}</span>
        </button>
        <button class="card-btn card-more-btn tooltip-wrap" data-action="more">
          <i class="fa-solid fa-chevron-down"></i>
          <span class="tooltip-text">More Info</span>
        </button>
      </div>
      <div class="card-info">
        <div class="card-meta-row">
          <span class="card-match">${matchPct}% Match</span>
          <span class="card-age">13+</span>
          <span class="card-year">${year}</span>
        </div>
        <div class="card-title-text">${title}</div>
      </div>
    </div>
  `;

  card.addEventListener('mouseenter', () => {
    const rect = card.getBoundingClientRect();
    if (rect.left < 80) card.style.transformOrigin = 'left center';
    else if (window.innerWidth - rect.right < 80) card.style.transformOrigin = 'right center';
    else card.style.transformOrigin = 'center center';
  });

  card.addEventListener('mouseleave', () => { card.style.transformOrigin = ''; });

  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'list') toggleList(movie, card.querySelector('.list-btn'));
    else if (action === 'like') toggleLike(movie.id, card.querySelector('.like-btn'));
    else openModal(movie.id, type);
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(movie.id, type); }
  });

  return card;
}

// ─── SEARCH ────────────────────────────────────────────────────────────────────
async function runSearch(query) {
  const main   = document.getElementById('main-content');
  const mylist = document.getElementById('mylist-section');
  const search = document.getElementById('search-section');
  const grid   = document.getElementById('search-grid');
  const label  = document.getElementById('search-query-label');

  main?.classList.add('hidden');
  mylist?.classList.add('hidden');
  search?.classList.remove('hidden');
  if (label) label.textContent = query;
  if (grid)  grid.innerHTML = '<div style="color:#808080;padding:40px;grid-column:1/-1">Searching...</div>';

  const data = await tmdb(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=1`);
  if (!grid) return;
  grid.innerHTML = '';

  const items = (data?.results || []).filter(m => m.backdrop_path || m.poster_path);
  if (!items.length) {
    grid.innerHTML = `<div style="color:#808080;padding:60px;grid-column:1/-1;text-align:center">No results for "${query}".</div>`;
    return;
  }

  items.forEach(movie => {
    const card = createMovieCard(movie, false);
    grid.appendChild(card);
  });
}

function hideSearch() {
  const search = document.getElementById('search-section');
  const main   = document.getElementById('main-content');
  const mylist = document.getElementById('mylist-section');

  search?.classList.add('hidden');
  const profileSess = sessionStorage.getItem('profile');
  if (profileSess && mylist && !mylist.classList.contains('hidden')) return;
  main?.classList.remove('hidden');
}

// ─── MY LIST ───────────────────────────────────────────────────────────────────
function renderMyList() {
  const grid = document.getElementById('mylist-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!myList.length) {
    grid.innerHTML = `
      <div class="mylist-empty">
        <i class="fa-solid fa-list"></i>
        <p>Your list is empty. Browse movies and hit + to save them here.</p>
      </div>
    `;
    return;
  }

  myList.forEach(movie => {
    const card = createMovieCard(movie, false);
    grid.appendChild(card);
  });
}

function toggleList(movie, btn) {
  const idx = myList.findIndex(m => m.id === movie.id);
  if (idx === -1) {
    myList.push(movie);
    toast(`Added "${movie.title || movie.name}" to My List`);
    updateListBtn(btn, true);
  } else {
    myList.splice(idx, 1);
    toast(`Removed "${movie.title || movie.name}" from My List`);
    updateListBtn(btn, false);
  }
  saveJSON(LS_LIST, myList);

  // Sync all list buttons for this movie
  document.querySelectorAll(`.list-btn`).forEach(b => {
    const card = b.closest('[data-id]');
    if (card && card.dataset.id == movie.id) {
      const nowIn = myList.some(m => m.id === movie.id);
      updateListBtn(b, nowIn);
    }
  });

  // Sync modal btn
  const modalBtn = document.getElementById('modal-list-btn');
  if (modalBtn && modalBtn.dataset.id == movie.id) {
    const nowIn = myList.some(m => m.id === movie.id);
    updateListBtnModal(modalBtn, nowIn);
  }
}

function updateListBtn(btn, inList) {
  if (!btn) return;
  const icon = btn.querySelector('i');
  const tip  = btn.querySelector('.tooltip-text');
  if (icon) icon.className = `fa-solid fa-${inList ? 'check' : 'plus'}`;
  if (tip)  tip.textContent = inList ? 'Remove from List' : 'Add to My List';
  btn.classList.toggle('in-list', inList);
  if (inList) { btn.style.background = 'rgba(70,211,105,0.3)'; btn.style.borderColor = '#46d369'; }
  else { btn.style.background = ''; btn.style.borderColor = ''; }
}

function updateListBtnModal(btn, inList) {
  if (!btn) return;
  const icon = btn.querySelector('i');
  const tip  = btn.querySelector('.tooltip-text');
  if (icon) icon.className = `fa-solid fa-${inList ? 'check' : 'plus'}`;
  if (tip)  tip.textContent = inList ? 'Remove from My List' : 'Add to My List';
  if (inList) { btn.style.background = 'rgba(70,211,105,0.3)'; btn.style.borderColor = '#46d369'; }
  else { btn.style.background = ''; btn.style.borderColor = ''; }
}

function toggleLike(movieId, btn) {
  const liked = likes.has(String(movieId));
  if (liked) {
    likes.delete(String(movieId));
    toast('Removed like');
  } else {
    likes.add(String(movieId));
    toast('Liked!');
  }
  saveJSON(LS_LIKES, [...likes]);
  updateLikeBtn(btn, !liked);

  // Sync all like buttons
  document.querySelectorAll('.like-btn').forEach(b => {
    const card = b.closest('[data-id]');
    if (card && card.dataset.id == movieId) updateLikeBtn(b, !liked);
  });

  const modalBtn = document.getElementById('modal-like-btn');
  if (modalBtn && modalBtn.dataset.id == movieId) updateLikeBtn(modalBtn, !liked);
}

function updateLikeBtn(btn, isLiked) {
  if (!btn) return;
  const icon = btn.querySelector('i');
  const tip  = btn.querySelector('.tooltip-text');
  if (icon) icon.className = `fa-${isLiked ? 'solid' : 'regular'} fa-thumbs-up`;
  if (tip)  tip.textContent = isLiked ? 'Liked' : 'Like';
  btn.classList.toggle('liked', isLiked);
  if (isLiked) { btn.style.color = '#e50914'; btn.style.borderColor = '#e50914'; }
  else { btn.style.color = ''; btn.style.borderColor = ''; }
}

// ─── MODAL ─────────────────────────────────────────────────────────────────────
async function openModal(id, type = 'movie') {
  const modal   = document.getElementById('modal');
  const box     = document.getElementById('modal-box');

  if (!modal) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  muted = true;

  // Reset state
  document.getElementById('modal-title').textContent  = 'Loading...';
  document.getElementById('modal-overview').textContent = '';
  document.getElementById('modal-player').innerHTML = '';
  document.getElementById('modal-sound-btn')?.classList.add('hidden');

  let resolvedType = type === 'tv' ? 'tv' : 'movie';
  let details = await tmdb(`/${resolvedType}/${id}?append_to_response=videos,credits,similar`);

  if (!details || details.success === false) {
    const alt = resolvedType === 'tv' ? 'movie' : 'tv';
    details = await tmdb(`/${alt}/${id}?append_to_response=videos,credits,similar`);
    if (details && details.success !== false) resolvedType = alt;
  }

  if (!details) {
    document.getElementById('modal-title').textContent = 'Error loading content';
    return;
  }

  // Backdrop
  const backdropImg = document.getElementById('modal-backdrop-img');
  if (backdropImg) {
    backdropImg.src = details.backdrop_path ? `${IMG}/w1280${details.backdrop_path}` : '';
    backdropImg.style.display = details.backdrop_path ? 'block' : 'none';
  }

  // Trailer
  const videos  = details.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const player  = document.getElementById('modal-player');
  const origin  = encodeURIComponent(window.location.origin || 'http://localhost');
  const soundBtn = document.getElementById('modal-sound-btn');

  if (trailer && player) {
    player.innerHTML = `
      <iframe
        id="yt-player"
        src="https://www.youtube-nocookie.com/embed/${trailer.key}?enablejsapi=1&autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&origin=${origin}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>`;
    if (backdropImg) backdropImg.style.display = 'none';
    soundBtn?.classList.remove('hidden');
  } else {
    if (player) player.innerHTML = '';
    if (backdropImg) backdropImg.style.display = 'block';
    soundBtn?.classList.add('hidden');
  }

  // Sound toggle
  if (soundBtn) {
    soundBtn.onclick = () => {
      const iframe = document.querySelector('#yt-player');
      if (!iframe) return;
      muted = !muted;
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), '*');
      const icon = soundBtn.querySelector('i');
      const tip  = soundBtn.querySelector('.tooltip-text');
      if (icon) icon.className = muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
      if (tip)  tip.textContent = muted ? 'Unmute' : 'Mute';
    };
  }

  // Play btn
  document.getElementById('modal-play-btn').onclick = () => {
    const iframe = document.querySelector('#yt-player');
    if (iframe) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
      muted = false;
      const icon = soundBtn?.querySelector('i');
      const tip  = soundBtn?.querySelector('.tooltip-text');
      if (icon) icon.className = 'fa-solid fa-volume-high';
      if (tip)  tip.textContent = 'Mute';
    }
  };

  // Info
  const title = details.title || details.name || details.original_name;
  document.getElementById('modal-title').textContent    = title;
  document.getElementById('modal-overview').textContent = details.overview || 'No overview available.';

  const matchPct = Math.min(99, Math.floor((details.vote_average || 7) * 10));
  document.getElementById('modal-match').textContent    = `${matchPct}% Match`;

  const dateStr = details.release_date || details.first_air_date || '';
  document.getElementById('modal-year').textContent = dateStr.slice(0, 4);

  const genreIds = (details.genres || []).map(g => g.id);
  const age = details.adult ? '18+' : (genreIds.includes(16) || genreIds.includes(10751) ? 'G' : genreIds.includes(27) || genreIds.includes(80) ? '16+' : '13+');
  document.getElementById('modal-age').textContent = age;

  let dur = '';
  if (resolvedType === 'movie' && details.runtime) {
    const h = Math.floor(details.runtime / 60), m = details.runtime % 60;
    dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
  } else if (resolvedType === 'tv' && details.number_of_seasons) {
    dur = `${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}`;
  }
  document.getElementById('modal-duration').textContent = dur;

  const cast = (details.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ');
  document.getElementById('modal-cast').textContent    = cast || 'N/A';
  document.getElementById('modal-genres').textContent = (details.genres || []).map(g => g.name).join(', ') || 'N/A';
  document.getElementById('modal-tags').textContent   = (details.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A';

  // List btn
  const listBtn = document.getElementById('modal-list-btn');
  if (listBtn) {
    listBtn.dataset.id = id;
    const inList = myList.some(m => String(m.id) === String(id));
    updateListBtnModal(listBtn, inList);
    listBtn.onclick = () => {
      const movie = details;
      toggleList({ id: Number(id), title, name: details.name, vote_average: details.vote_average, backdrop_path: details.backdrop_path, poster_path: details.poster_path, genre_ids: genreIds, release_date: details.release_date, first_air_date: details.first_air_date, media_type: resolvedType }, listBtn);
      const nowIn = myList.some(m => String(m.id) === String(id));
      updateListBtnModal(listBtn, nowIn);
    };
  }

  // Like btn
  const likeBtn = document.getElementById('modal-like-btn');
  if (likeBtn) {
    likeBtn.dataset.id = id;
    const isLiked = likes.has(String(id));
    updateLikeBtn(likeBtn, isLiked);
    likeBtn.onclick = () => toggleLike(id, likeBtn);
  }

  // Similar grid
  const simGrid = document.getElementById('modal-similar-grid');
  if (simGrid) {
    simGrid.innerHTML = '';
    const similars = (details.similar?.results || []).filter(m => m.backdrop_path || m.poster_path).slice(0, 9);
    if (!similars.length) {
      simGrid.innerHTML = '<div style="color:#808080;padding:20px">No similar titles found.</div>';
    } else {
      similars.forEach(movie => {
        const simCard = createSimilarCard(movie, resolvedType);
        simGrid.appendChild(simCard);
      });
    }
  }

  // Scroll modal to top
  if (box) box.scrollTo({ top: 0 });
}

function createSimilarCard(movie, type) {
  const title    = movie.title || movie.name || movie.original_name || '';
  const matchPct = Math.min(99, Math.floor((movie.vote_average || 7) * 10));
  const year     = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const poster   = movie.backdrop_path || movie.poster_path;
  const inList   = myList.some(m => m.id === movie.id);

  const card = document.createElement('div');
  card.className = 'similar-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', title);

  card.innerHTML = `
    <img src="${IMG}/w780${poster}" alt="${title}" loading="lazy">
    <div class="similar-card-info">
      <div class="similar-card-meta">
        <span class="match">${matchPct}% Match</span>
        <span class="age">13+</span>
        <span>${year}</span>
        <button class="similar-card-add tooltip-wrap" aria-label="Add to list">
          <i class="fa-solid fa-${inList ? 'check' : 'plus'}"></i>
          <span class="tooltip-text">${inList ? 'Remove from List' : 'Add to My List'}</span>
        </button>
      </div>
      <div class="similar-card-title">${title}</div>
      <div class="similar-card-desc">${movie.overview || ''}</div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.similar-card-add')) {
      const btn = e.target.closest('.similar-card-add');
      toggleList(movie, btn);
      const nowIn = myList.some(m => m.id === movie.id);
      const icon = btn.querySelector('i');
      const tip  = btn.querySelector('.tooltip-text');
      if (icon) icon.className = `fa-solid fa-${nowIn ? 'check' : 'plus'}`;
      if (tip)  tip.textContent = nowIn ? 'Remove from List' : 'Add to My List';
      return;
    }
    openModal(movie.id, type);
  });

  card.addEventListener('keydown', e => {
    if (e.key === 'Enter') openModal(movie.id, type);
  });

  return card;
}

function closeModal() {
  const modal  = document.getElementById('modal');
  const player = document.getElementById('modal-player');
  modal?.classList.add('hidden');
  if (player) player.innerHTML = '';
  document.body.style.overflow = '';
}

// ─── BOOTSTRAP ─────────────────────────────────────────────────────────────────
function loadHomeFeed() {
  const main    = document.getElementById('main-content');
  const search  = document.getElementById('search-section');
  const mylist  = document.getElementById('mylist-section');
  const heroEl  = document.getElementById('hero-section');

  main?.classList.remove('hidden');
  search?.classList.add('hidden');
  mylist?.classList.add('hidden');
  if (heroEl) heroEl.style.display = '';
  window.scrollTo({ top: 0 });

  clearRows();
  setActiveLink('link-home');

  // 1. Hero: Now Playing movies
  tmdb('/movie/now_playing?language=en-US&page=1').then(data => {
    renderHero(data?.results || [], 'movie');
  });

  // 2. Rows (rendered in order)
  renderTop10Row('Top 10 Trending Today', '/trending/all/day');
  renderRow('New Releases',       '/movie/now_playing?language=en-US&page=1');
  renderRow('Trending This Week', '/trending/movie/week');
  renderRow('Horror Movies',      '/discover/movie?with_genres=27&sort_by=popularity.desc');
  renderRow('Romantic Movies',    '/discover/movie?with_genres=10749&sort_by=popularity.desc');
  renderRow('Action Movies',      '/discover/movie?with_genres=28&sort_by=popularity.desc');
  renderRow('Thriller Movies',    '/discover/movie?with_genres=53&sort_by=popularity.desc');
  renderRow('Sci-Fi Movies',      '/discover/movie?with_genres=878&sort_by=popularity.desc');
  renderRow('Comedy Movies',      '/discover/movie?with_genres=35&sort_by=popularity.desc');
  renderRow('Documentaries',      '/discover/movie?with_genres=99&sort_by=popularity.desc');
  renderRow('Award-Winning Films','/discover/movie?sort_by=vote_average.desc&vote_count.gte=5000');
}

document.addEventListener('DOMContentLoaded', () => {
  initProfileScreen();
  initNavbar();

  // Modal close
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
});
