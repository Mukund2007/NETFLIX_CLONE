/**
 * Netflix Clone - Premium Application Script
 * Orchestrates Profile selection, TMDB API proxy queries, dynamic carousels,
 * edge-aligned card scaling zoom, detailed media modal player, and list persistence.
 */

const BASE_URL = '/.netlify/functions/tmdb?path=';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const ORIGIN = window.location.origin || 'http://localhost';

const GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

const LS_LIST_KEY = 'netflix_clone_mylist';
const LS_LIKES_KEY = 'netflix_clone_likes';

// State Management
let myPersonalList = loadMyListFromStorage();
let likedIds = loadLikesFromStorage();
let soundMuted = true;
let isKidsMode = false;
let searchDebounceTimeout = null;

const requests = {
  fetchRecentReleases: '/movie/now_playing?language=en-US&page=1',
  fetchTrendingToday: '/trending/all/day',
  fetchActionMovies: '/discover/movie?with_genres=28',
  fetchSciFiMovies: '/discover/movie?with_genres=878',
  fetchHorrorMovies: '/discover/movie?with_genres=27',
  fetchRomanceMovies: '/discover/movie?with_genres=10749',
  fetchThrillerMovies: '/discover/movie?with_genres=53',
  fetchComedyMovies: '/discover/movie?with_genres=35',
  fetchDocumentaries: '/discover/movie?with_genres=99'
};

// Storage helpers
function loadMyListFromStorage() {
  try {
    const list = localStorage.getItem(LS_LIST_KEY);
    return list ? JSON.parse(list) : [];
  } catch {
    return [];
  }
}

function saveMyListToStorage() {
  try {
    localStorage.setItem(LS_LIST_KEY, JSON.stringify(myPersonalList));
  } catch {}
}

function loadLikesFromStorage() {
  try {
    const likes = localStorage.getItem(LS_LIKES_KEY);
    return likes ? new Set(JSON.parse(likes)) : new Set();
  } catch {
    return new Set();
  }
}

function saveLikesToStorage() {
  try {
    localStorage.setItem(LS_LIKES_KEY, JSON.stringify([...likedIds]));
  } catch {}
}

// Toast alerts
function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const textSpan = document.getElementById('toast-message');
  if (toast && textSpan) {
    textSpan.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// Age rating fallback helper
function resolveAgeRating(movie) {
  if (movie.adult) return '18+';
  const genres = movie.genre_ids || [];
  if (genres.includes(16) || genres.includes(10751)) return 'G';
  if (genres.includes(27) || genres.includes(80) || genres.includes(53)) return '16+';
  return '13+';
}

// ─── INITIALIZATION ────────────────────────────────────────────────────────────
async function initApp() {
  setupUIEventListeners();
  setupProfileSelection();
  
  // Handle initial routing if profile is bypassed (already loaded)
  const isProfileSelected = sessionStorage.getItem('netflix_profile_selected') === 'true';
  if (isProfileSelected) {
    hideProfileSelectionImmediate();
    handleRouting();
  }
}

function setupProfileSelection() {
  const user1Btn = document.getElementById('profile-user1-btn');
  const kidsBtn = document.getElementById('profile-kids-btn');
  
  const switchUser1 = document.getElementById('switch-profile-user1');
  const switchKids = document.getElementById('switch-profile-kids');
  const signoutBtn = document.getElementById('nav-signout-btn');
  
  user1Btn.addEventListener('click', () => selectProfile('user1'));
  kidsBtn.addEventListener('click', () => selectProfile('kids'));
  
  switchUser1.addEventListener('click', (e) => {
    e.preventDefault();
    selectProfile('user1', true);
  });
  
  switchKids.addEventListener('click', (e) => {
    e.preventDefault();
    selectProfile('kids', true);
  });

  signoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('netflix_profile_selected');
    window.location.hash = '#home';
    showProfileSelectionPage();
    showToast('Signed out of profile successfully!');
  });
}

function selectProfile(profileType, isSwitching = false) {
  sessionStorage.setItem('netflix_profile_selected', 'true');
  
  if (profileType === 'kids') {
    isKidsMode = true;
    window.location.hash = '#kids';
  } else {
    isKidsMode = false;
    window.location.hash = '#home';
  }
  
  if (isSwitching) {
    handleRouting();
    showToast(`Switched profile to ${profileType === 'kids' ? 'Kids' : 'User 1'}!`);
    return;
  }
  
  const selectionScreen = document.getElementById('profile-selection');
  const appWrapper = document.getElementById('app-wrapper');
  
  selectionScreen.classList.add('fade-out');
  setTimeout(() => {
    selectionScreen.classList.add('hidden');
    appWrapper.classList.add('fade-in');
    handleRouting();
  }, 400);
}

function hideProfileSelectionImmediate() {
  const selectionScreen = document.getElementById('profile-selection');
  const appWrapper = document.getElementById('app-wrapper');
  selectionScreen.classList.add('hidden', 'fade-out');
  appWrapper.classList.add('fade-in');
}

function showProfileSelectionPage() {
  const selectionScreen = document.getElementById('profile-selection');
  const appWrapper = document.getElementById('app-wrapper');
  appWrapper.classList.remove('fade-in');
  selectionScreen.classList.remove('hidden', 'fade-out');
}

// ─── API DATA FETCHING ──────────────────────────────────────────────────────────
async function fetchFromTMDB(endpoint) {
  const url = `${BASE_URL}${encodeURIComponent(endpoint)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) showConnectionError();
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (window.location.hostname === 'localhost') {
      console.error(`Error loading data from ${url}:`, error);
    }
    showConnectionError();
    return null;
  }
}

function showConnectionError() {
  showToast('Could not connect to the API. Please run the app using netlify dev.');
  const container = document.getElementById('rows-container');
  if (container && !container.querySelector('.connection-error')) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'connection-error';
    errorDiv.style.cssText = 'text-align: center; padding: 100px 20px; color: var(--netflix-red); font-size: 1.25rem; font-weight: bold; display: flex; flex-direction: column; align-items: center; gap: 15px; grid-column: 1/-1;';
    errorDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem;"></i> Could not connect to the API. Please run the app using netlify dev.';
    container.appendChild(errorDiv);
  }
}

// ─── NAV & UI EVENT BINDINGS ────────────────────────────────────────────────────
function setupUIEventListeners() {
  const searchBtn = document.getElementById('search-btn');
  const searchContainer = document.getElementById('search-box-container');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');

  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    searchContainer.classList.toggle('active');
    if (searchContainer.classList.contains('active')) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      triggerSearch('');
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
      if (searchContainer.classList.contains('active')) {
        searchContainer.classList.remove('active');
        searchInput.value = '';
        triggerSearch('');
      }
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

  const modalMuteBtn = document.getElementById('modal-mute-btn');
  modalMuteBtn.addEventListener('click', () => {
    const iframe = document.querySelector('#modal-video-player iframe');
    if (iframe) {
      soundMuted = !soundMuted;
      const cmd = soundMuted ? 'mute' : 'unMute';
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: [] }), '*');
      
      const icon = modalMuteBtn.querySelector('i');
      const tooltip = modalMuteBtn.querySelector('.tooltiptext');
      if (soundMuted) {
        icon.className = 'fa-solid fa-volume-xmark';
        tooltip.innerText = 'Unmute';
      } else {
        icon.className = 'fa-solid fa-volume-high';
        tooltip.innerText = 'Mute';
      }
    }
  });

  // Mobile Drawer toggles
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileOverlay = document.getElementById('mobile-menu-overlay');
  const mobileClose = document.getElementById('mobile-menu-close');

  function closeMobileDrawer() {
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', () => {
    mobileMenu.classList.add('open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  });

  mobileClose.addEventListener('click', closeMobileDrawer);
  mobileOverlay.addEventListener('click', closeMobileDrawer);

  // Bind Drawer links
  const drawerLinks = [
    { id: 'm-link-home', hash: '#home' },
    { id: 'm-link-tv', hash: '#tv' },
    { id: 'm-link-movies', hash: '#movies' },
    { id: 'm-link-latest', hash: '#latest' },
    { id: 'm-link-mylist', hash: '#mylist' },
    { id: 'm-link-kids', hash: '#kids' }
  ];

  drawerLinks.forEach(({ id, hash }) => {
    const linkEl = document.getElementById(id);
    if (linkEl) {
      linkEl.addEventListener('click', (e) => {
        e.preventDefault();
        closeMobileDrawer();
        window.location.hash = hash;
      });
    }
  });

  // Desktop links
  const desktopHome = document.getElementById('link-home');
  const desktopTV = document.getElementById('link-tv');
  const desktopMovies = document.getElementById('link-movies');
  const desktopLatest = document.getElementById('link-latest');
  const desktopMyList = document.getElementById('link-mylist');

  desktopHome.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#home'; });
  desktopTV.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#tv'; });
  desktopMovies.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#movies'; });
  desktopLatest.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#latest'; });
  desktopMyList.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = '#mylist'; });

  // Kids Label trigger
  const kidsLabel = document.getElementById('kids-label');
  kidsLabel.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#kids';
  });
  kidsLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.hash = '#kids';
    }
  });

  // Notification items click binding
  const notificationItems = document.querySelectorAll('.notification-item');
  const notifBadge = document.getElementById('notification-badge');
  notificationItems.forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      const type = item.getAttribute('data-type');
      if (id && type) openMovieModal(id, type);
      if (notifBadge && notifBadge.innerText !== '0') {
        const cnt = parseInt(notifBadge.innerText, 10);
        notifBadge.innerText = cnt - 1;
        if (cnt - 1 === 0) notifBadge.style.display = 'none';
      }
    });
  });
}

// ─── HERO BANNER POPULATION ─────────────────────────────────────────────────────
async function setupHeroBanner(movies, forcedType = 'movie') {
  const eligible = movies.filter(m => m.backdrop_path && m.overview);
  if (eligible.length === 0) return;

  const banner = document.getElementById('hero-banner');
  banner.removeAttribute('data-loaded');

  const selected = eligible[Math.floor(Math.random() * Math.min(eligible.length, 5))];
  const resolvedType = selected.first_air_date ? 'tv' : forcedType || 'movie';

  const fullDetails = await fetchFromTMDB(`/${resolvedType}/${selected.id}`) || selected;

  const titleEl = document.getElementById('hero-title');
  const descEl = document.getElementById('hero-description');
  const matchEl = document.getElementById('hero-match');
  const yearEl = document.getElementById('hero-year');
  const durationEl = document.getElementById('hero-duration');
  const badgeEl = document.getElementById('hero-badge');

  const imgPath = `${IMAGE_BASE_URL}/w1280${fullDetails.backdrop_path}`;

  // Image load detection for Skeleton Loader
  const bannerImg = document.getElementById('hero-lcp-img');
  if (bannerImg) {
    bannerImg.onload = () => { banner.setAttribute('data-loaded', 'true'); };
    bannerImg.onerror = () => { banner.setAttribute('data-loaded', 'true'); };
    bannerImg.src = imgPath;
    bannerImg.sizes = "100vw";
  } else {
    // Fallback Image object loader
    const tempImg = new Image();
    tempImg.onload = () => { banner.setAttribute('data-loaded', 'true'); };
    tempImg.onerror = () => { banner.setAttribute('data-loaded', 'true'); };
    tempImg.src = imgPath;
  }

  titleEl.innerText = fullDetails.name || fullDetails.title || fullDetails.original_name;
  descEl.innerText = fullDetails.overview;
  
  const matchPercent = Math.min(99, Math.floor(fullDetails.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
  matchEl.innerText = `${matchPercent}% Match`;

  const dateStr = fullDetails.first_air_date || fullDetails.release_date;
  yearEl.innerText = dateStr ? new Date(dateStr).getFullYear() : '2024';

  const isTv = resolvedType === 'tv';
  if (isTv) {
    const episodeDuration = Array.isArray(fullDetails.episode_run_time) && fullDetails.episode_run_time.length > 0
      ? fullDetails.episode_run_time[0]
      : null;
    durationEl.innerText = episodeDuration
      ? `${episodeDuration}m / episode`
      : (fullDetails.number_of_seasons ? `${fullDetails.number_of_seasons} Season${fullDetails.number_of_seasons > 1 ? 's' : ''}` : 'Series');
  } else {
    durationEl.innerText = fullDetails.runtime
      ? `${fullDetails.runtime}m`
      : (fullDetails.number_of_seasons ? `${fullDetails.number_of_seasons} Seasons` : '');
  }

  // Originals Badge toggle
  if (badgeEl) {
    if (isKidsMode) {
      badgeEl.style.display = 'flex';
      badgeEl.innerHTML = '<span style="color:#e9a716; font-weight:800; font-size:0.85rem; letter-spacing:2px;">NETFLIX KIDS</span>';
    } else if (isTv) {
      badgeEl.style.display = 'flex';
      badgeEl.innerHTML = `
        <svg class="n-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 0h20v80H20z" fill="#B20710"/>
          <path d="M60 0h20v100H60z" fill="#B20710"/>
          <path d="M20 0l40 100H40L20 0z" fill="#E50914"/>
        </svg>
        <span>ORIGINAL SERIES</span>
      `;
    } else {
      badgeEl.style.display = 'none';
    }
  }

  document.getElementById('hero-play-btn').setAttribute('data-id', fullDetails.id);
  document.getElementById('hero-play-btn').setAttribute('data-type', resolvedType);
  document.getElementById('hero-info-btn').setAttribute('data-id', fullDetails.id);
  document.getElementById('hero-info-btn').setAttribute('data-type', resolvedType);
}

// ─── CAROUSELS GENERATOR ────────────────────────────────────────────────────────
async function renderMovieRow(title, endpoint, isLarge = false) {
  const container = document.getElementById('rows-container');
  const data = await fetchFromTMDB(endpoint);
  if (!data || !data.results || data.results.length === 0) {
    renderRowError(title, container, isLarge);
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

  const seen = new Set();
  const unique = data.results.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  unique.forEach(movie => {
    const poster = isLarge ? movie.poster_path : (movie.backdrop_path || movie.poster_path);
    if (!poster) return;

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('data-id', movie.id);
    const resolvedType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
    card.setAttribute('data-type', resolvedType);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', movie.title || movie.name || 'Movie Card');

    // Bounds detection for scaled transform alignment
    card.addEventListener('mouseenter', () => {
      const rect = card.getBoundingClientRect();
      if (rect.left < 60) {
        card.style.transformOrigin = 'left center';
      } else if (window.innerWidth - rect.right < 60) {
        card.style.transformOrigin = 'right center';
      } else {
        card.style.transformOrigin = 'center center';
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transformOrigin = '';
    });

    // Keyboard bindings
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
      }
    });

    const isMobile = window.innerWidth <= 768;
    let imgSize = 'w342';
    if (!isLarge) {
      imgSize = movie.backdrop_path ? (isMobile ? 'w300' : 'w780') : (isMobile ? 'w185' : 'w342');
    }

    const img = document.createElement('img');
    img.src = `${IMAGE_BASE_URL}/${imgSize}${poster}`;
    img.alt = movie.title || movie.name || 'Movie poster';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = isLarge ? 342 : 780;
    img.height = isLarge ? 513 : 439;
    img.onerror = () => { img.src = `https://image.tmdb.org/t/p/w342${movie.poster_path || movie.backdrop_path}`; };
    card.appendChild(img);

    // Details overlay Card
    const hoverDetails = document.createElement('div');
    hoverDetails.className = 'card-hover-details';

    const actionRow = document.createElement('div');
    actionRow.className = 'card-action-row';
    actionRow.innerHTML = `
      <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
      <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
      <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
      <button class="card-btn more-info-btn tooltip" aria-label="More Info"><i class="fa-solid fa-chevron-down"></i><span class="tooltiptext">More Info</span></button>
    `;
    hoverDetails.appendChild(actionRow);

    const matchPercent = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
    const releaseYear = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';
    const genres = (movie.genre_ids || []).slice(0, 3).map(id => GENRE_MAP[id] || '').filter(Boolean).join(' • ');

    const metaRow = document.createElement('div');
    metaRow.className = 'card-meta';
    metaRow.innerHTML = `
      <span class="card-match">${matchPercent}% Match</span>
      <span class="card-rating">${resolveAgeRating(movie)}</span>
      <span>${releaseYear}</span>
    `;
    hoverDetails.appendChild(metaRow);

    const titleRow = document.createElement('div');
    titleRow.className = 'card-title';
    titleRow.innerText = movie.title || movie.name || movie.original_name;
    hoverDetails.appendChild(titleRow);

    if (genres) {
      const genresRow = document.createElement('div');
      genresRow.className = 'card-genres';
      genresRow.innerText = genres;
      hoverDetails.appendChild(genresRow);
    }

    card.appendChild(hoverDetails);

    // List and Like synchronizer
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

    const moreInfoBtn = hoverDetails.querySelector('.more-info-btn');
    if (moreInfoBtn) {
      moreInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMovieModal(movie.id, resolvedType);
      });
    }

    const playBtn = hoverDetails.querySelector('.card-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMovieModal(movie.id, resolvedType);
      });
    }

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
  container.appendChild(rowDiv);

  arrowLeft.addEventListener('click', () => { cardsContainer.scrollLeft -= cardsContainer.offsetWidth * 0.75; });
  arrowRight.addEventListener('click', () => { cardsContainer.scrollLeft += cardsContainer.offsetWidth * 0.75; });
}

// ─── TOP 10 RANKINGS CAROUSEL ─────────────────────────────────────────────────
async function renderTop10Row(title, endpoint) {
  const container = document.getElementById('rows-container');
  const data = await fetchFromTMDB(endpoint);
  if (!data || !data.results || data.results.length === 0) {
    renderRowError(title, container, false);
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

    // Bounds detection for Top 10 card scaling
    card.addEventListener('mouseenter', () => {
      const rect = card.getBoundingClientRect();
      if (rect.left < 60) {
        card.style.transformOrigin = 'left center';
      } else if (window.innerWidth - rect.right < 60) {
        card.style.transformOrigin = 'right center';
      } else {
        card.style.transformOrigin = 'center center';
      }
    });

    card.addEventListener('mouseleave', () => {
      card.style.transformOrigin = '';
    });

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

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(card.getAttribute('data-id'), card.getAttribute('data-type'));
      }
    });

    const hoverDetails = document.createElement('div');
    hoverDetails.className = 'card-hover-details top-10-hover-details';

    const matchPercent = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
    const releaseYear = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';

    hoverDetails.innerHTML = `
      <div class="card-action-row">
        <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
        <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
        <button class="card-btn more-info-btn tooltip" aria-label="More Info"><i class="fa-solid fa-chevron-down"></i><span class="tooltiptext">More Info</span></button>
      </div>
      <div class="card-meta">
        <span class="card-match">${matchPercent}% Match</span>
        <span class="card-rating">13+</span>
        <span>${releaseYear}</span>
      </div>
      <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
    `;

    card.appendChild(hoverDetails);

    // Bind event handlers directly
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

    const moreInfoBtn = hoverDetails.querySelector('.more-info-btn');
    if (moreInfoBtn) {
      moreInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMovieModal(movie.id, movie.media_type || 'movie');
      });
    }

    const playBtn = hoverDetails.querySelector('.card-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMovieModal(movie.id, movie.media_type || 'movie');
      });
    }

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
  container.appendChild(rowDiv);

  arrowLeft.addEventListener('click', () => { cardsContainer.scrollLeft -= cardsContainer.offsetWidth * 0.75; });
  arrowRight.addEventListener('click', () => { cardsContainer.scrollLeft += cardsContainer.offsetWidth * 0.75; });
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

// ─── MY LIST & LIKE TOGGLE FUNCTIONS ───────────────────────────────────────────
function toggleMyList(movie, btnElement) {
  if (!movie) return;
  const index = myPersonalList.findIndex(m => m.id === movie.id);
  let nowInList = false;

  if (index === -1) {
    myPersonalList.push(movie);
    nowInList = true;
    showToast(`Added "${movie.title || movie.name}" to My List.`);
  } else {
    myPersonalList.splice(index, 1);
    nowInList = false;
    showToast(`Removed "${movie.title || movie.name}" from My List.`);
  }
  
  saveMyListToStorage();
  syncListButtonsAcrossPage(movie.id, nowInList);
}

function toggleLikeButton(btnElement, movieId) {
  if (!btnElement || !movieId) return;
  let nowLiked = false;

  if (likedIds.has(String(movieId))) {
    likedIds.delete(String(movieId));
    nowLiked = false;
    showToast('Removed like from title.');
  } else {
    likedIds.add(String(movieId));
    nowLiked = true;
    showToast('Liked title!');
  }
  
  saveLikesToStorage();
  syncLikeButtonsAcrossPage(movieId, nowLiked);
}

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

function applyListState(btnElement, movieId) {
  if (!btnElement || !movieId) return;
  const isAdded = myPersonalList.some(m => String(m.id) === String(movieId));
  
  if (isAdded) {
    btnElement.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from List</span>';
    btnElement.style.backgroundColor = '#46d369';
    btnElement.style.borderColor = '#46d369';
  } else {
    btnElement.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span>';
    btnElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    btnElement.style.borderColor = 'rgba(255, 255, 255, 0.4)';
  }
}

function syncListButtonsAcrossPage(movieId, isAdded) {
  document.querySelectorAll(`.add-to-list-btn[data-id="${movieId}"]`).forEach(btn => {
    applyListState(btn, movieId);
  });

  document.querySelectorAll(`.rec-card[data-id="${movieId}"]`).forEach(card => {
    const addBtn = card.querySelector('.rec-add-btn');
    if (addBtn) applyListState(addBtn, movieId);
  });

  const modalBtn = document.getElementById('modal-add-list-btn');
  if (modalBtn && modalBtn.getAttribute('data-id') == movieId) {
    if (isAdded) {
      modalBtn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from My List</span>';
      modalBtn.style.backgroundColor = '#46d369';
      modalBtn.style.borderColor = '#46d369';
    } else {
      modalBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to My List</span>';
      modalBtn.style.backgroundColor = '';
      modalBtn.style.borderColor = '';
    }
  }
}

function syncLikeButtonsAcrossPage(movieId, isLiked) {
  document.querySelectorAll(`.movie-card[data-id="${movieId}"], .top-10-card[data-id="${movieId}"]`).forEach(card => {
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
      applyLikedState(likeBtn, movieId);
      if (isLiked) {
        likeBtn.style.transform = 'scale(1.25)';
        setTimeout(() => { likeBtn.style.transform = ''; }, 200);
      }
    }
  });

  const modalBtn = document.getElementById('modal-like-btn');
  if (modalBtn && modalBtn.getAttribute('data-id') == movieId) {
    applyLikedState(modalBtn, movieId);
    if (!isLiked) {
      modalBtn.style.backgroundColor = 'rgba(20, 20, 20, 0.6)';
    }
    if (isLiked) {
      modalBtn.style.transform = 'scale(1.25)';
      setTimeout(() => { modalBtn.style.transform = ''; }, 200);
    }
  }
}

// ─── SEARCH HANDLER ────────────────────────────────────────────────────────────
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
    const data = await fetchFromTMDB(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false`);
    searchResultsGrid.innerHTML = '';

    if (!data || !data.results || data.results.length === 0) {
      searchResultsGrid.innerHTML = `<div style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding: 80px;">No matches for "${query}".</div>`;
      return;
    }

    const filtered = data.results.filter(m => m.backdrop_path || m.poster_path);

    filtered.forEach(movie => {
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.setAttribute('data-id', movie.id);
      card.setAttribute('data-type', movie.media_type || 'movie');
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', movie.title || movie.name || 'Search result');

      card.addEventListener('mouseenter', () => {
        const rect = card.getBoundingClientRect();
        if (rect.left < 60) {
          card.style.transformOrigin = 'left center';
        } else if (window.innerWidth - rect.right < 60) {
          card.style.transformOrigin = 'right center';
        } else {
          card.style.transformOrigin = 'center center';
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transformOrigin = '';
      });

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

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMovieModal(movie.id, movie.media_type || 'movie');
        }
      });

      const hoverDetails = document.createElement('div');
      hoverDetails.className = 'card-hover-details';
      const matchPercent = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
      const releaseYear = movie.release_date || movie.first_air_date
        ? new Date(movie.release_date || movie.first_air_date).getFullYear()
        : '2024';

      hoverDetails.innerHTML = `
        <div class="card-action-row">
          <button class="card-btn card-play-btn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
          <button class="card-btn add-to-list-btn tooltip" data-id="${movie.id}" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
          <button class="card-btn like-btn tooltip" aria-label="Like"><i class="fa-regular fa-thumbs-up"></i><span class="tooltiptext">Like</span></button>
          <button class="card-btn more-info-btn tooltip" aria-label="More Info"><i class="fa-solid fa-chevron-down"></i><span class="tooltiptext">More Info</span></button>
        </div>
        <div class="card-meta">
          <span class="card-match">${matchPercent}% Match</span>
          <span class="card-rating">${resolveAgeRating(movie)}</span>
          <span>${releaseYear}</span>
        </div>
        <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
      `;

      card.appendChild(hoverDetails);

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

      const moreInfoBtn = hoverDetails.querySelector('.more-info-btn');
      if (moreInfoBtn) {
        moreInfoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openMovieModal(movie.id, movie.media_type || 'movie');
        });
      }

      const playBtn = hoverDetails.querySelector('.card-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openMovieModal(movie.id, movie.media_type || 'movie');
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-row')) return;
        openMovieModal(movie.id, movie.media_type || 'movie');
      });

      searchResultsGrid.appendChild(card);
    });
  }, 400);
}

// ─── DETAILED MEDIA MODAL ──────────────────────────────────────────────────────
async function openMovieModal(id, type = 'movie') {
  const modal = document.getElementById('movie-modal');
  document.body.style.overflow = 'hidden';

  let resolvedType = (type === 'tv') ? 'tv' : 'movie';

  // Reset modal values
  document.getElementById('modal-movie-title').innerText = 'Loading...';
  document.getElementById('modal-overview').innerText = 'Gathering details...';
  document.getElementById('modal-backdrop-img').style.display = 'block';
  document.getElementById('modal-video-player').innerHTML = '';
  modal.classList.remove('hidden');

  let details = await fetchFromTMDB(`/${resolvedType}/${id}?append_to_response=videos,credits,similar`);
  
  // Try TV/Movie cross-fallback if initial query fails
  if (!details || details.success === false) {
    resolvedType = (resolvedType === 'tv') ? 'movie' : 'tv';
    details = await fetchFromTMDB(`/${resolvedType}/${id}?append_to_response=videos,credits,similar`);
  }

  if (!details) {
    document.getElementById('modal-movie-title').innerText = 'Error loading content';
    document.getElementById('modal-overview').innerText = 'Unable to fetch data from TMDB API.';
    return;
  }

  const backdropImg = document.getElementById('modal-backdrop-img');
  if (details.backdrop_path) {
    backdropImg.src = `${IMAGE_BASE_URL}/w1280${details.backdrop_path}`;
    backdropImg.style.display = 'block';
  } else {
    backdropImg.style.display = 'none';
  }

  // Find standard trailer
  const videos = details.videos ? details.videos.results : [];
  const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip'));
  const playerDiv = document.getElementById('modal-video-player');

  if (trailer) {
    playerDiv.innerHTML = `
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
    playerDiv.innerHTML = '';
    backdropImg.style.display = 'block';
  }

  soundMuted = true;
  const muteBtn = document.getElementById('modal-mute-btn');
  if (muteBtn) {
    muteBtn.style.display = trailer ? 'flex' : 'none';
    muteBtn.querySelector('i').className = 'fa-solid fa-volume-xmark';
    muteBtn.querySelector('.tooltiptext').innerText = 'Unmute';
  }

  document.getElementById('modal-play-btn').onclick = () => {
    const iframe = document.querySelector('#modal-video-player iframe');
    if (iframe) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
      soundMuted = false;
      if (muteBtn) {
        muteBtn.querySelector('i').className = 'fa-solid fa-volume-high';
        muteBtn.querySelector('.tooltiptext').innerText = 'Mute';
      }
    }
  };

  const likeBtn = document.getElementById('modal-like-btn');
  if (likeBtn) {
    likeBtn.setAttribute('data-id', id);
    likeBtn.querySelector('i').className = 'fa-regular fa-thumbs-up';
    likeBtn.style.color = 'white';
    likeBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    likeBtn.style.backgroundColor = 'rgba(20, 20, 20, 0.6)';
    const tooltip = likeBtn.querySelector('.tooltiptext');
    if (tooltip) tooltip.innerText = 'Like';

    applyLikedState(likeBtn, id);
    likeBtn.onclick = () => toggleLikeButton(likeBtn, id);
  }

  const listBtn = document.getElementById('modal-add-list-btn');
  if (listBtn) {
    listBtn.setAttribute('data-id', id);
    const inList = myPersonalList.some(m => String(m.id) === String(id));
    if (inList) {
      listBtn.innerHTML = '<i class="fa-solid fa-check"></i><span class="tooltiptext">Remove from My List</span>';
      listBtn.style.backgroundColor = '#46d369';
      listBtn.style.borderColor = '#46d369';
    } else {
      listBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to My List</span>';
      listBtn.style.backgroundColor = '';
      listBtn.style.borderColor = '';
    }
    listBtn.onclick = () => {
      toggleMyList(details, listBtn);
    };
  }

  document.getElementById('modal-movie-title').innerText = details.title || details.name || details.original_name;
  document.getElementById('modal-overview').innerText = details.overview || 'No overview available.';

  const matchPercent = Math.min(99, Math.floor(details.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
  document.getElementById('modal-match').innerText = `${matchPercent}% Match`;

  const dateStr = details.release_date || details.first_air_date;
  document.getElementById('modal-year').innerText = dateStr ? new Date(dateStr).getFullYear() : '2024';

  const durationStr = details.runtime
    ? `${details.runtime}m`
    : (details.number_of_seasons ? `${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}` : 'HD');
  document.getElementById('modal-duration').innerText = durationStr;

  const genres = details.genres || [];
  const genreIds = genres.map(g => g.id);
  const rating = details.adult ? '18+' : (genreIds.includes(16) || genreIds.includes(10751) ? 'G' : (genreIds.includes(27) || genreIds.includes(80) ? '16+' : '13+'));
  document.getElementById('modal-age-rating').innerText = rating;

  const castList = details.credits ? details.credits.cast : [];
  document.getElementById('modal-cast').innerText = castList.slice(0, 5).map(c => c.name).join(', ') || 'N/A';
  document.getElementById('modal-genres').innerText = genres.map(g => g.name).join(', ') || 'N/A';
  
  const vibe = genres.slice(0, 2).map(g => g.name).join(', ') || 'Exciting';
  document.getElementById('modal-vibe').innerText = vibe;

  populateRecommendations((details.similar ? details.similar.results : []).slice(0, 9));
}

function populateRecommendations(items) {
  const grid = document.getElementById('modal-recommendations-grid');
  grid.innerHTML = '';

  if (!items || items.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted); grid-column: 1/-1; padding: 20px;">No similar titles found.</div>';
    return;
  }

  items.forEach(movie => {
    const poster = movie.backdrop_path || movie.poster_path;
    if (!poster) return;

    const card = document.createElement('div');
    card.className = 'rec-card';
    card.setAttribute('data-id', movie.id);
    const type = movie.first_air_date ? 'tv' : 'movie';
    card.setAttribute('data-type', type);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', movie.title || movie.name || 'Similar title');

    const isMobile = window.innerWidth <= 768;
    let size = movie.backdrop_path ? (isMobile ? 'w300' : 'w780') : (isMobile ? 'w185' : 'w342');
    const imgUrl = `${IMAGE_BASE_URL}/${size}${poster}`;
    const year = movie.release_date || movie.first_air_date
      ? new Date(movie.release_date || movie.first_air_date).getFullYear()
      : '2024';
    const match = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);

    card.innerHTML = `
      <div class="rec-img-container">
        <img src="${imgUrl}" alt="${movie.title || movie.name}" loading="lazy" decoding="async" width="266" height="150">
        <span class="rec-badge">HD</span>
      </div>
      <div class="rec-details">
        <div class="rec-meta">
          <div class="rec-meta-left">
            <span class="rec-match">${match}% Match</span>
            <span class="rec-age">13+</span>
            <span>${year}</span>
          </div>
          <button class="rec-add-btn tooltip" aria-label="Add to List"><i class="fa-solid fa-plus"></i><span class="tooltiptext">Add to List</span></button>
        </div>
        <h4 class="rec-title">${movie.title || movie.name || movie.original_name}</h4>
        <p class="rec-description">${movie.overview || 'No overview available.'}</p>
      </div>
    `;

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieModal(movie.id, type);
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.rec-add-btn')) return;
      openMovieModal(movie.id, type);
    });

    const addBtn = card.querySelector('.rec-add-btn');
    if (addBtn) {
      applyListState(addBtn, movie.id);
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMyList(movie, addBtn);
        const inList = myPersonalList.some(m => m.id === movie.id);
        addBtn.querySelector('.tooltiptext').innerText = inList ? 'Remove from List' : 'Add to List';
      });
    }

    grid.appendChild(card);
  });
}

function closeModal() {
  document.getElementById('movie-modal').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('modal-video-player').innerHTML = '';
}

// ─── FEEDS POPULATORS ─────────────────────────────────────────────────────────
function clearFeed() {
  document.getElementById('rows-container').innerHTML = '';
  document.getElementById('search-grid-container').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('hero-banner').style.display = 'flex';
  window.scrollTo(0, 0);
}

function setKidsMode(active) {
  isKidsMode = active;
  const label = document.querySelector('.kids-label');
  const avatar = document.getElementById('nav-avatar-img');
  
  if (active) {
    document.body.classList.add('kids-mode');
    if (avatar) avatar.src = "data:image/svg+xml;utf8,<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><rect width='100' height='100' rx='10' fill='%23e9a716'/><circle cx='32' cy='38' r='6' fill='white'/><circle cx='68' cy='38' r='6' fill='white'/><path d='M 30,55 A 25,25 0 0,0 70,55' fill='none' stroke='white' stroke-width='8' stroke-linecap='round'/></svg>";
    if (label) label.style.fontWeight = '700';
  } else {
    document.body.classList.remove('kids-mode');
    if (avatar) avatar.src = "https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png";
    if (label) label.style.fontWeight = '';
  }
}

async function showHomeFeed() {
  clearFeed();
  setKidsMode(false);

  const releases = await fetchFromTMDB(requests.fetchRecentReleases);
  if (releases && releases.results.length > 0) {
    await setupHeroBanner(releases.results, 'movie');
  }

  await renderTop10Row('Top 10 Trending Today', requests.fetchTrendingToday);
  await renderMovieRow('Horror Movies', requests.fetchHorrorMovies, false);
  await renderMovieRow('Romance Movies', requests.fetchRomanceMovies, false);
  await renderMovieRow('Action Movies', requests.fetchActionMovies, false);
  await renderMovieRow('Thriller Movies', requests.fetchThrillerMovies, false);
  await renderMovieRow('Sci-Fi Movies', requests.fetchSciFiMovies, false);
  await renderMovieRow('Comedy Movies', requests.fetchComedyMovies, false);
  await renderMovieRow('Documentaries', requests.fetchDocumentaries, false);
}

async function showTVFeed() {
  clearFeed();
  setKidsMode(false);

  const tvResponse = await fetchFromTMDB('/discover/tv?with_networks=213');
  if (tvResponse && tvResponse.results.length > 0) {
    await setupHeroBanner(tvResponse.results, 'tv');
  }

  await renderMovieRow('Trending TV Series', '/trending/tv/week', false);
  await renderMovieRow('Top Rated Series', '/tv/top_rated', false);
  await renderMovieRow('Action & Adventure Shows', '/discover/tv?with_genres=10759', false);
  await renderMovieRow('Sci-Fi & Fantasy Series', '/discover/tv?with_genres=10765', false);
  await renderMovieRow('Comedy Series', '/discover/tv?with_genres=35', false);
}

async function showMoviesFeed() {
  clearFeed();
  setKidsMode(false);

  const moviesResponse = await fetchFromTMDB(requests.fetchRecentReleases);
  if (moviesResponse && moviesResponse.results.length > 0) {
    await setupHeroBanner(moviesResponse.results, 'movie');
  }

  await renderMovieRow('Trending Movies', '/trending/movie/week', false);
  await renderMovieRow('Horror Movies', requests.fetchHorrorMovies, false);
  await renderMovieRow('Romance Movies', requests.fetchRomanceMovies, false);
  await renderMovieRow('Action Movies', requests.fetchActionMovies, false);
  await renderMovieRow('Thriller Movies', requests.fetchThrillerMovies, false);
  await renderMovieRow('Sci-Fi Movies', requests.fetchSciFiMovies, false);
  await renderMovieRow('Comedy Movies', requests.fetchComedyMovies, false);
}

async function showLatestFeed() {
  clearFeed();
  setKidsMode(false);

  const upcomingUrl = '/movie/upcoming?language=en-US&page=1';
  const upcoming = await fetchFromTMDB(upcomingUrl);
  if (upcoming && upcoming.results.length > 0) {
    await setupHeroBanner(upcoming.results, 'movie');
  }

  await renderMovieRow('Upcoming Releases', upcomingUrl, false);
  await renderMovieRow('Now Playing in Theaters', requests.fetchRecentReleases, false);
}

async function showMyListFeed() {
  clearFeed();
  setKidsMode(false);
  document.getElementById('hero-banner').style.display = 'none';

  const container = document.getElementById('rows-container');
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
        Your list is empty. Browse movies and hit + to save them here.
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

      card.addEventListener('mouseenter', () => {
        const rect = card.getBoundingClientRect();
        if (rect.left < 60) {
          card.style.transformOrigin = 'left center';
        } else if (window.innerWidth - rect.right < 60) {
          card.style.transformOrigin = 'right center';
        } else {
          card.style.transformOrigin = 'center center';
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transformOrigin = '';
      });

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

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMovieModal(movie.id, type);
        }
      });

      const hoverDetails = document.createElement('div');
      hoverDetails.className = 'card-hover-details';
      const matchPercent = Math.min(99, Math.floor(movie.vote_average * 10)) || (Math.floor(Math.random() * 10) + 88);
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
          <button class="card-btn more-info-btn tooltip" aria-label="More Info"><i class="fa-solid fa-chevron-down"></i><span class="tooltiptext">More Info</span></button>
        </div>
        <div class="card-meta">
          <span class="card-match">${matchPercent}% Match</span>
          <span class="card-rating">${resolveAgeRating(movie)}</span>
          <span>${releaseYear}</span>
        </div>
        <div class="card-title">${movie.title || movie.name || movie.original_name}</div>
      `;

      card.appendChild(hoverDetails);

      const removeBtn = hoverDetails.querySelector('.add-to-list-btn');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMyList(movie, removeBtn);
        showMyListFeed();
      });

      const likeBtn = hoverDetails.querySelector('.like-btn');
      if (likeBtn) {
        applyLikedState(likeBtn, movie.id);
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLikeButton(likeBtn, movie.id);
        });
      }

      const moreInfoBtn = hoverDetails.querySelector('.more-info-btn');
      if (moreInfoBtn) {
        moreInfoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openMovieModal(movie.id, type);
        });
      }

      const playBtn = hoverDetails.querySelector('.card-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openMovieModal(movie.id, type);
        });
      }

      grid.appendChild(card);
    });
  }

  section.appendChild(grid);
  container.appendChild(section);
}

async function showKidsFeed() {
  clearFeed();
  setKidsMode(true);

  document.getElementById('hero-banner').classList.add('kids-hero');
  const kidsResponse = await fetchFromTMDB('/discover/movie?with_genres=16&sort_by=popularity.desc&page=1');
  if (kidsResponse && kidsResponse.results.length > 0) {
    await setupHeroBanner(kidsResponse.results, 'movie');
  }

  await renderMovieRow('Popular Animations', '/discover/movie?with_genres=16&sort_by=popularity.desc&page=1', false);
  await renderMovieRow('Family Favourites', '/discover/movie?with_genres=10751&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=1', false);
  await renderMovieRow('Adventure & Fantasy', '/discover/movie?with_genres=12&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=2', false);
  await renderMovieRow('Kids TV Shows', '/discover/tv?with_genres=10762&sort_by=popularity.desc&page=1', false);
  await renderMovieRow('Fun Comedies', '/discover/movie?with_genres=35&certification_country=US&certification.lte=G&sort_by=popularity.desc&page=1', false);
}

// ─── ROUTING HANDLER ────────────────────────────────────────────────────────────
function handleRouting() {
  const hash = window.location.hash || '#home';
  const desktopHome = document.getElementById('link-home');
  const desktopTV = document.getElementById('link-tv');
  const desktopMovies = document.getElementById('link-movies');
  const desktopLatest = document.getElementById('link-latest');
  const desktopMyList = document.getElementById('link-mylist');

  const links = [desktopHome, desktopTV, desktopMovies, desktopLatest, desktopMyList];
  
  const drawerLinks = {
    '#home': 'm-link-home',
    '#tv': 'm-link-tv',
    '#movies': 'm-link-movies',
    '#latest': 'm-link-latest',
    '#mylist': 'm-link-mylist',
    '#kids': 'm-link-kids'
  };

  function highlightLink(activeLink) {
    links.forEach(l => { if (l) l.classList.remove('active'); });
    if (activeLink) activeLink.classList.add('active');

    // Highlight mobile links
    Object.values(drawerLinks).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    const activeDrawerId = drawerLinks[hash];
    if (activeDrawerId) {
      const el = document.getElementById(activeDrawerId);
      if (el) el.classList.add('active');
    }
  }

  // Check if profile selector is bypassed
  const isProfileSelected = sessionStorage.getItem('netflix_profile_selected') === 'true';
  if (!isProfileSelected) {
    showProfileSelectionPage();
    return;
  }

  if (hash === '#tv') {
    highlightLink(desktopTV);
    showTVFeed();
  } else if (hash === '#movies') {
    highlightLink(desktopMovies);
    showMoviesFeed();
  } else if (hash === '#latest') {
    highlightLink(desktopLatest);
    showLatestFeed();
  } else if (hash === '#mylist') {
    highlightLink(desktopMyList);
    showMyListFeed();
  } else if (hash === '#kids') {
    highlightLink(null);
    showKidsFeed();
  } else {
    highlightLink(desktopHome);
    showHomeFeed();
  }
}

// Global Event Listeners
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

window.addEventListener('hashchange', handleRouting);
