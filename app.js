import { CONFIG } from './config.js';
import { loadExcel, parseWorkbook } from './js/parser.js';
import { evaluateSchedule, getDisplayDate, getCurrentTime, formatSessionTime, getSessionProgress, millisecondsUntilNextChange, paginateSessions } from './js/schedule.js';
import { DisplayCycle } from './js/video.js';

const $ = id => document.getElementById(id);
let sessions = [];
let loadState = 'loading';
let pages = [[]];
let pageIndex = 0;
let scheduleSignature = '';
let renderedSignature = '';
let pageTimer;
let retryTimer;
let resizeTimer;
let boundaryTimer;
let wakeLock;
let destroyed = false;
const timers = [];
const visibleProgress = new Map();

document.documentElement.style.setProperty('--page-duration', `${CONFIG.PAGE_DURATION}ms`);
document.documentElement.style.setProperty('--fade-duration', `${CONFIG.TRANSITION_DURATION}ms`);

function setText(id, text) {
  const element = $(id);
  if (element.textContent !== String(text)) element.textContent = text;
}

export function updateClock() {
  const date = getDisplayDate(CONFIG);
  const hour = date.getHours();
  setText('clock-time', `${String(hour % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
  setText('clock-seconds', String(date.getSeconds()).padStart(2, '0'));
  setText('clock-ampm', hour >= 12 ? 'PM' : 'AM');
  setText('clock-day', date.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase());
  setText('clock-date', date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase());
  setText('panel-day', `${date.toLocaleDateString('en-GB', { weekday: 'long' })}'s schedule`);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function makeTimeCell(value, className) {
  const cell = element('div', `session-time ${className}`);
  const time = element('time');
  time.dateTime = value;
  const [clock, period] = formatSessionTime(value).split(' ');
  time.append(element('span', 'session-time-value', clock));
  if (period) time.append(document.createTextNode(' '), element('span', 'session-time-period', period));
  const chip = element('span', 'time-chip');
  chip.append(icon('clock'), time);
  cell.append(chip);
  return cell;
}

function updateVisibleProgress(date = getDisplayDate(CONFIG)) {
  const minute = getCurrentTime(date);
  for (const { session, track, fill, caption } of visibleProgress.values()) {
    const percentage = getSessionProgress(session, minute);
    const label = `${Math.floor(percentage)}% completed`;
    fill.style.transform = `scaleX(${percentage / 100})`;
    track.setAttribute('aria-valuenow', percentage.toFixed(1));
    track.setAttribute('aria-valuetext', label);
    if (caption.textContent !== label) caption.textContent = label;
  }
}

function makeRow(session) {
  const row = element('div', `session-row table-grid ${session.status === 'ONGOING' ? 'is-ongoing' : 'is-upcoming'}`);
  row.setAttribute('role', 'row');
  row.dataset.sessionId = session.id;
  const facultyKind = /business/i.test(session.faculty) ? 'business' : /computing/i.test(session.faculty) ? 'computing' : 'general';
  row.dataset.faculty = facultyKind;
  const code = element('div', 'module-code');
  code.append(element('span', 'code-badge', session.moduleCode || '—'));
  // An empty module name leaves the cell blank; the grid keeps the row height.
  const nameCell = element('div', 'module-name-cell');
  nameCell.append(element('span', 'module-name', session.moduleName || ''));
  const location = element('div', 'location');
  const meeting = session.room.match(/^(\d+)(?:st|nd|rd|th)\s+Floor Meeting Room$/i);
  const room = element('span', 'location-heading');
  room.append(icon('pin'), element('span', 'location-main', meeting ? `${meeting[1]}F` : session.room));
  location.append(room);
  location.append(element('span', 'location-type', meeting ? 'MEETING ROOM' : session.locationType));
  location.setAttribute('aria-label', `${session.room}, ${session.locationType.toLowerCase()}`);
  const startTime = makeTimeCell(session.startTime, 'session-start');
  const endTime = makeTimeCell(session.endTime, 'session-end');
  const status = element('div', 'session-status');
  const pill = element('span', `status-pill ${session.status.toLowerCase()}`);
  const dot = element('span', 'status-dot');
  dot.setAttribute('aria-hidden', 'true');
  pill.append(dot, document.createTextNode(session.status));
  status.append(pill);
  if (session.status === 'ONGOING') {
    const progress = element('div', 'session-progress');
    const track = element('div', 'session-progress-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `${[session.moduleName, session.room].filter(Boolean).join(', ')}, time completed`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = element('span', 'session-progress-fill');
    const caption = element('span', 'session-progress-caption');
    track.append(fill);
    progress.append(track, caption);
    status.append(progress);
    visibleProgress.set(session.id, { session, track, fill, caption });
  }
  const faculty = element('div', 'faculty');
  const facultyIcon = element('span', 'faculty-icon');
  facultyIcon.append(icon(facultyKind === 'business' ? 'briefcase' : facultyKind === 'computing' ? 'laptop' : 'academic'));
  const facultyLabel = element('span', 'faculty-label');
  if (/^Faculty of /i.test(session.faculty)) {
    facultyLabel.append(element('span', 'faculty-prefix', 'FACULTY OF'));
    facultyLabel.append(element('span', 'faculty-name', session.faculty.replace(/^Faculty of /i, '')));
  } else facultyLabel.append(element('span', 'faculty-name', session.faculty));
  faculty.append(facultyIcon, facultyLabel);
  for (const cell of [code, nameCell, location, startTime, endTime, status, faculty]) {
    cell.setAttribute('role', 'cell');
    row.append(cell);
  }
  return row;
}

function pageCapacity() {
  const areaHeight = $('table-area').getBoundingClientRect().height;
  const headerHeight = document.querySelector('.table-header').getBoundingClientRect().height
    || Math.min(48, Math.max(35, innerHeight * 0.044));
  const rowStyles = getComputedStyle($('session-rows'));
  const gap = parseFloat(rowStyles.rowGap) || 0;
  const padding = (parseFloat(rowStyles.paddingTop) || 0) + (parseFloat(rowStyles.paddingBottom) || 0);
  const minimumRow = innerWidth < 650 ? 84 : Math.max(60, innerWidth * 0.041);
  return Math.max(2, Math.min(CONFIG.MAX_ROWS, Math.floor((areaHeight - headerHeight - padding + gap) / (minimumRow + gap))));
}

function renderPagination() {
  $('pagination').hidden = false;
  $('empty-board-note').hidden = true;
  setText('page-number', String(pageIndex + 1).padStart(2, '0'));
  setText('page-total', String(pages.length).padStart(2, '0'));
  $('previous-page').disabled = $('next-page').disabled = pages.length < 2;
  const bars = document.createDocumentFragment();
  // Show a bounded window when the timetable contains many pages.
  const start = Math.max(0, Math.min(pageIndex - 3, pages.length - 7));
  for (let index = start; index < Math.min(pages.length, start + 7); index++) {
    bars.append(element('span', `page-bar ${index === pageIndex ? 'active' : index < pageIndex ? 'past' : ''}`));
  }
  $('page-bars').replaceChildren(bars);
}

export function renderTimetable() {
  const visible = pages[pageIndex] || [];
  const signature = `${pageIndex}|${visible.map(session => `${session.id}:${session.status}`).join(';')}`;
  if (signature === renderedSignature) { updateVisibleProgress(); return; }
  renderedSignature = signature;
  visibleProgress.clear();
  const rows = document.createDocumentFragment();
  for (const session of visible) rows.append(makeRow(session));
  $('session-rows').replaceChildren(rows);
  $('session-rows').dataset.density = visible.length > 5 ? 'compact' : 'normal';
  updateVisibleProgress();
  renderPagination();
}

function showEmpty(kind, state) {
  visibleProgress.clear();
  $('timetable').hidden = true;
  $('empty-state').hidden = false;
  $('pagination').hidden = true;
  $('empty-board-note').hidden = false;
  $('loading-track').hidden = kind !== 'loading';
  $('session-totals').hidden = kind === 'error' || kind === 'loading';
  const messages = {
    loading: ['CONNECTING YOUR CAMPUS', "Getting today's schedule ready", 'Your live classes and computer labs will appear here shortly.'],
    error: ['CAMPUS SCHEDULE', 'Timetable information is temporarily unavailable.', 'We’re reconnecting. Please check back shortly.'],
    empty: ['NO SCHEDULED SESSIONS', 'A little room to recharge.', 'There are no scheduled classes or computer labs today.'],
    finished: ["TODAY’S SESSIONS ARE COMPLETE", 'That’s a wrap for today.', 'All scheduled classes and computer labs have finished. See you next time.'],
    term: ['NO SCHEDULED SESSIONS', 'Between chapters.', 'There are no sessions scheduled for the current academic period.']
  };
  const [eyebrow, title, message] = messages[kind];
  setText('empty-eyebrow', eyebrow);
  setText('empty-title', title);
  setText('empty-message', message);
  setText('board-note', kind === 'error' ? 'Schedule reconnecting' : 'Your campus, in sync');
  $('board-status-dot').style.backgroundColor = kind === 'error' ? '#d7aa68' : '';
  if (state) { setText('ongoing-count', state.ongoing.length); setText('upcoming-count', state.upcoming.length); }
  renderedSignature = '';
}

function restartPageTimer() {
  clearInterval(pageTimer);
  if (pages.length < 2) return;
  pageTimer = setInterval(() => {
    if (cycle.currentMode !== 'TIMETABLE' || document.hidden) return;
    pageIndex = (pageIndex + 1) % pages.length;
    renderTimetable();
  }, CONFIG.PAGE_DURATION);
}

export function updateSessionProgress() {
  // Refresh membership/status as well as the bars. Normal progress ticks update
  // existing DOM nodes without restarting pagination or recreating the rows.
  refreshSessions();
}

export function refreshSessions(force = false) {
  if (loadState !== 'ready') { showEmpty(loadState); return; }
  const date = getDisplayDate(CONFIG);
  const state = evaluateSchedule(sessions, date, CONFIG);
  clearTimeout(boundaryTimer);
  if (!CONFIG.TEST_MODE) {
    // An independent deadline handles starts, finishes, and midnight without
    // waiting for the next five-second progress tick.
    boundaryTimer = setTimeout(updateSessionProgress, millisecondsUntilNextChange(state, date));
  }
  const capacity = pageCapacity();
  const signature = JSON.stringify([state.date, capacity, state.total, state.ongoing.map(x => x.id), state.upcoming.map(x => x.id)]);
  if (!force && signature === scheduleSignature) { updateVisibleProgress(date); return; }
  const changed = signature !== scheduleSignature;
  scheduleSignature = signature;
  pages = paginateSessions(state.ongoing, state.upcoming, capacity);
  // Resume the page rotation after videos so distant pages are never starved.
  pageIndex = changed ? 0 : Math.min(pageIndex, pages.length - 1);
  renderedSignature = '';
  setText('ongoing-count', state.ongoing.length);
  setText('upcoming-count', state.upcoming.length);
  if (!state.ongoing.length && !state.upcoming.length) {
    clearInterval(pageTimer);
    showEmpty(state.outOfTerm ? 'term' : state.total ? 'finished' : 'empty', state);
    return;
  }
  $('timetable').hidden = false;
  $('empty-state').hidden = true;
  $('session-totals').hidden = false;
  setText('board-note', state.ongoing.length ? 'Ongoing sessions first · Stay on track' : 'Coming up today · Stay on track');
  $('board-status-dot').style.backgroundColor = '';
  renderTimetable();
  restartPageTimer();
}

const cycle = new DisplayCycle($('promo-video'), CONFIG, mode => {
  const showingVideo = mode === 'VIDEO';
  if (showingVideo) {
    setText('video-status-text', `Playing Video ${cycle.currentIndex + 1} / ${cycle.playlist.length}`);
    $('promo-video').setAttribute('aria-label', `Campus promotional Video ${cycle.currentIndex + 1}`);
  }
  $('video-screen').classList.toggle('active', showingVideo);
  $('video-screen').setAttribute('aria-hidden', String(!showingVideo));
  $('timetable-screen').classList.toggle('video-active', showingVideo);
  $('timetable-screen').setAttribute('aria-hidden', String(showingVideo));
  if (!showingVideo) {
    updateClock();
    refreshSessions(true);
  }
});

async function initializeTimetable() {
  try {
    const workbook = await loadExcel(CONFIG);
    if (destroyed) return;
    const result = parseWorkbook(workbook, CONFIG);
    if (!result.sheets.length || !result.sessions.length) throw new Error('No usable timetable sessions found');
    sessions = result.sessions;
    loadState = 'ready';
    if (CONFIG.DEBUG_MODE) {
      console.info('Timetable worksheets:', result.sheets);
      console.table(result.sessions);
      console.info('Workbook notes requiring review:', result.diagnostics);
    }
    refreshSessions(true);
  } catch (error) {
    if (destroyed) return;
    loadState = 'error';
    showEmpty('error');
    if (CONFIG.DEBUG_MODE) console.warn('Timetable could not be loaded', error);
    retryTimer = setTimeout(initializeTimetable, CONFIG.LOAD_RETRY_INTERVAL);
  }
}

async function enterFullscreen() {
  const root = document.documentElement;
  if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
  else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
}

async function requestFullscreen() {
  if (!CONFIG.ATTEMPT_FULLSCREEN || document.fullscreenElement) return;
  try { await enterFullscreen(); } catch { /* User gesture may be required. */ }
}

// The on-screen "+" control always works, even when automatic fullscreen is off.
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await enterFullscreen();
  } catch { /* Fullscreen may be blocked by the embedding app. */ }
}

function updateFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  const button = $('fullscreen-button');
  button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  button.title = active ? 'Exit fullscreen' : 'Fullscreen';
  button.classList.toggle('is-active', active);
}

async function requestWakeLock() {
  if (!CONFIG.KEEP_SCREEN_AWAKE || !navigator.wakeLock || document.hidden || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* Android kiosk settings can keep the display awake. */ }
}

function setupBrand() {
  // Start the branding sequence once the logo loads. A missing file hides the
  // branding area so the header collapses gracefully and the timetable still loads.
  const logo = $('brand-logo');
  const container = $('logo-container');
  if (!CONFIG.LOGO_PATH) { logo.hidden = container.hidden = true; return; }
  logo.onload = () => { logo.hidden = container.hidden = false; };
  logo.onerror = () => { logo.hidden = container.hidden = true; logo.removeAttribute('src'); };
  logo.src = CONFIG.LOGO_PATH;
}

// First touch anywhere enters fullscreen, except on the "+" button, which
// handles fullscreen itself and must not be toggled twice by one tap.
document.addEventListener('pointerdown', function firstTouch(event) {
  if (event.target.closest?.('#fullscreen-button')) return;
  document.removeEventListener('pointerdown', firstTouch);
  requestFullscreen();
});
$('fullscreen-button').addEventListener('click', toggleFullscreen);
for (const [id, direction] of [['previous-page', -1], ['next-page', 1]]) {
  $(id).addEventListener('click', () => {
    if (pages.length < 2) return;
    pageIndex = (pageIndex + direction + pages.length) % pages.length;
    renderTimetable();
    restartPageTimer();
  });
}
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'f') requestFullscreen(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !destroyed) {
    updateClock();
    refreshSessions(true);
    cycle.resume();
    requestWakeLock();
  }
});
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => refreshSessions(true), 180);
});
window.addEventListener('pagehide', () => {
  destroyed = true;
  cycle.dispose();
  clearInterval(pageTimer);
  clearTimeout(retryTimer);
  clearTimeout(resizeTimer);
  clearTimeout(boundaryTimer);
  timers.forEach(clearInterval);
  wakeLock?.release();
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

setupBrand();
updateFullscreenButton();
updateClock();
showEmpty('loading');
timers.push(setInterval(updateClock, 1000));
timers.push(setInterval(updateSessionProgress, CONFIG.SESSION_UPDATE_INTERVAL));
initializeTimetable();
cycle.startDisplayCycle();
requestFullscreen();
requestWakeLock();
