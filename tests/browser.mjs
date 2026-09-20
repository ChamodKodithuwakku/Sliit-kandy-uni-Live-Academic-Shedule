import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.TEST_URL || 'http://127.0.0.1:8080';
const configSource = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
const checks = [];
const record = message => { checks.push(message); console.log(`PASS ${message}`); };

async function newPage(overrides = {}, viewport = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Colombo', deviceScaleFactor: 1 });
  await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: `${configSource}\nObject.assign(CONFIG, ${JSON.stringify({ ATTEMPT_FULLSCREEN: false, KEEP_SCREEN_AWAKE: false, ...overrides })});` }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { page, context, errors };
}

try {
  const live = await newPage({ VIDEOS: [] });
  await live.page.goto(base);
  await live.page.waitForFunction(() => document.querySelector('#empty-state').hidden || document.querySelector('#loading-track').hidden);
  const actualHour = await live.page.evaluate(() => String(new Date().getHours() % 12 || 12).padStart(2, '0'));
  assert.ok((await live.page.locator('#clock-time').textContent()).startsWith(actualHour));
  const firstSecond = await live.page.locator('#clock-seconds').textContent();
  await live.page.waitForFunction(first => document.querySelector('#clock-seconds').textContent !== first, firstSecond);
  assert.deepEqual(live.errors, []);
  await live.page.screenshot({ path: 'test-results/live-device-time.png' });
  record('Production uses the local device date/time and the clock ticks');
  await live.context.close();

  const display = await newPage({ TEST_MODE: true, VIDEOS: [], PAGE_DURATION: 4000 });
  const requests = [];
  display.page.on('request', request => requests.push(request.url()));
  await display.page.goto(base);
  await display.page.locator('.session-row').first().waitFor();
  assert.equal(await display.page.locator('#ongoing-count').textContent(), '17');
  assert.equal(await display.page.locator('#upcoming-count').textContent(), '29');
  assert.ok((await display.page.locator('#session-rows').textContent()).includes('Data Communications and Computer Networks I'));
  assert.equal(await display.page.locator('input,nav,footer').count(), 0);
  assert.equal(await display.page.locator('button').count(), 3);
  const fullscreenCalls = await display.page.evaluate(async () => {
    let calls = 0;
    document.documentElement.requestFullscreen = async () => { calls++; };
    document.querySelector('#fullscreen-button').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return calls;
  });
  assert.equal(fullscreenCalls, 1);
  const buttonBox = await display.page.locator('#fullscreen-button').boundingBox();
  const pagesBox = await display.page.locator('#pagination').boundingBox();
  assert.ok(buttonBox.width >= 24 && buttonBox.x + buttonBox.width <= pagesBox.x, JSON.stringify({ buttonBox, pagesBox }));
  record('A "+" button in the footer requests fullscreen and sits left of the page indicator');
  assert.deepEqual(await display.page.locator('[role="columnheader"]').allTextContents(), ['MODULE CODE', 'MODULE NAME', 'LOCATION', 'START TIME', 'END TIME', 'STATUS', 'FACULTY']);
  assert.equal(await display.page.locator('.session-row').first().locator('[role="cell"]').count(), 7);
  assert.equal(await display.page.locator('.session-start time').first().textContent(), '08:30 AM');
  assert.equal(await display.page.locator('.session-end time').first().textContent(), '11:30 AM');
  assert.equal(await display.page.locator('.session-progress-track').first().getAttribute('aria-valuenow'), '16.7');
  assert.ok((await display.page.locator('#session-rows').textContent()).includes('COMPUTER LAB'));
  assert.ok(!/laborator/i.test(await display.page.locator('body').textContent()));
  record('Seven Excel-driven columns, Computer Lab labels, and elapsed-time bars are displayed');
  const crowdedRowHeight = await display.page.locator('.session-row').first().evaluate(row => row.getBoundingClientRect().height);
  await display.page.waitForTimeout(450);
  await display.page.screenshot({ path: 'test-results/white-dashboard-preview.png' });
  const cardLayout = await display.page.evaluate(() => ({
    headerHeight: document.querySelector('.masthead').getBoundingClientRect().height,
    tableTop: document.querySelector('.table-header').getBoundingClientRect().top,
    tableHeight: document.querySelector('.table-area').getBoundingClientRect().height,
    rowCount: document.querySelectorAll('.session-row').length,
    radius: getComputedStyle(document.querySelector('.table-area')).borderRadius,
    shadow: getComputedStyle(document.querySelector('.table-area')).boxShadow,
    rowRadius: getComputedStyle(document.querySelector('.session-row')).borderRadius,
    background: getComputedStyle(document.body).backgroundColor,
    text: document.body.textContent
  }));
  assert.ok(cardLayout.rowCount >= 8 && cardLayout.rowCount <= 10, JSON.stringify(cardLayout));
  assert.ok(cardLayout.headerHeight < 145 && cardLayout.tableTop < 230);
  assert.ok(cardLayout.tableHeight > 1080 * 0.7);
  assert.equal(cardLayout.radius, '20px');
  assert.notEqual(cardLayout.shadow, 'none');
  assert.equal(cardLayout.rowRadius, '14px');
  assert.equal(cardLayout.background, 'rgb(255, 255, 255)');
  record('White dashboard uses a rounded table card, floating rows, and readable display spacing');
  assert.ok(!/module name unavailable|unknown module|not found|\bN\/A\b/i.test(cardLayout.text));
  const blankName = display.page.locator('.session-row').filter({ has: display.page.locator('.module-code', { hasText: /^IT1221$/ }) }).first();
  assert.equal((await blankName.locator('.module-name').textContent()).trim(), '');
  assert.equal(await blankName.locator('[role="cell"]').count(), 7);
  assert.equal(await blankName.evaluate(row => Math.round(row.getBoundingClientRect().height)), Math.round(crowdedRowHeight));
  record('A session without a recoverable module name leaves the cell blank and keeps the row layout');
  const brand = await display.page.evaluate(() => {
    const logo = document.querySelector('#brand-logo');
    // Measure the stable layout, not the image's animated opacity or scale.
    const box = document.querySelector('#logo-container').getBoundingClientRect();
    const logoStyle = getComputedStyle(logo);
    const masthead = document.querySelector('.masthead');
    return {
      visible: !logo.hidden && box.width > 0 && box.height > 0,
      height: box.height, left: box.left, top: box.top,
      mastheadHeight: masthead.getBoundingClientRect().height,
      ratio: parseFloat(logoStyle.width) / parseFloat(logoStyle.height), naturalRatio: logo.naturalWidth / logo.naturalHeight,
      objectFit: getComputedStyle(logo).objectFit, radius: getComputedStyle(logo).borderRadius,
      text: masthead.textContent.replace(/\s+/g, ' ').trim(),
      symbol: document.querySelector('#brand-symbol, .brand-name')
    };
  });
  assert.ok(brand.visible && brand.height >= 60 && brand.height <= 90, JSON.stringify(brand));
  assert.ok(Math.abs(brand.ratio - brand.naturalRatio) < 0.01);
  assert.ok(brand.left < 60 && brand.top > 0 && brand.top + brand.height < brand.mastheadHeight);
  assert.equal(brand.objectFit, 'contain');
  assert.equal(brand.radius, '0px');
  assert.equal(brand.symbol, null);
  assert.ok(!/SLIIT KANDY UNI/i.test(brand.text));
  record('Header uses the supplied logo image at 60–90px, top left, with its aspect ratio and no text brand');
  const firstPage = await display.page.locator('#page-number').textContent();
  await display.page.waitForFunction(first => document.querySelector('#page-number').textContent !== first, firstPage);
  const a406 = display.page.locator('.session-row').filter({ has: display.page.locator('.location-main', { hasText: /^A406$/ }) });
  assert.equal(await a406.locator('.location-type').textContent(), 'LECTURE HALL');
  record('A406 renders as Lecture Hall while A401–A404 remain configured computer labs');
  record('Actual Tuesday sessions load, faculty labels render, and pages advance automatically');
  for (const [width, height] of [[1920,1080],[2560,1440],[3840,2160],[1600,900],[1366,768],[1280,720],[390,844]]) {
    await display.page.setViewportSize({ width, height });
    await display.page.waitForTimeout(650);
    const layout = await display.page.evaluate(() => {
      const area = document.querySelector('#table-area').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.session-row')].map(row => row.getBoundingClientRect());
      return {
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        last: rows.at(-1)?.bottom, bottom: area.bottom,
        overflow: [...document.querySelectorAll('.session-row .status-pill,.module-code,.code-badge,.faculty,.time-chip,.session-time,.session-progress-caption')].filter(node => node.scrollWidth > node.clientWidth + 2).map(node => node.className),
        cellOverflow: [...document.querySelectorAll('.session-row > [role="cell"]')].filter(node => node.getBoundingClientRect().height > node.parentElement.getBoundingClientRect().height + 1).map(node => node.className)
      };
    });
    assert.ok(layout.width <= width && layout.height <= height, JSON.stringify(layout));
    assert.ok(layout.last <= layout.bottom + 1, JSON.stringify(layout));
    assert.deepEqual(layout.overflow, [], `${width}x${height}`);
    assert.deepEqual(layout.cellOverflow, [], `${width}x${height}`);
    await display.page.screenshot({ path: `test-results/display-${width}x${height}.png` });
    record(`No scrolling or row overflow at ${width}×${height}`);
  }
  assert.equal(requests.filter(url => url.endsWith('timetable.xlsx')).length, 1);
  assert.ok(requests.every(url => url.startsWith(base)));
  assert.deepEqual(display.errors, []);
  record('Workbook fetched once; fonts, library, and assets use local files');
  await display.context.close();

  const preview = await newPage({ TEST_MODE: true, TEST_DAY: 'Thursday', TEST_TIME: '00:24', VIDEOS: [], PAGE_DURATION: 3600000 });
  await preview.page.goto(base);
  await preview.page.locator('.session-row').first().waitFor();
  const facultyIcons = {};
  const totalPages = Number(await preview.page.locator('#page-total').textContent());
  for (let index = 0; index < totalPages; index++) {
    Object.assign(facultyIcons, await preview.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.session-row')].map(row => [row.dataset.faculty, row.querySelector('.faculty-icon use').getAttribute('href')]))));
    await preview.page.locator('#next-page').click();
  }
  assert.equal(await preview.page.locator('#page-number').textContent(), '01');
  assert.equal(facultyIcons.computing, '#icon-laptop');
  assert.equal(facultyIcons.business, '#icon-briefcase');
  await preview.page.locator('#previous-page').click();
  assert.equal(Number(await preview.page.locator('#page-number').textContent()), totalPages);
  await preview.page.locator('#previous-page').click();
  await preview.page.waitForTimeout(450);
  await preview.page.screenshot({ path: 'test-results/white-dashboard-upcoming.png' });
  assert.deepEqual(preview.errors, []);
  record('Faculty icons are distinct and rounded pagination buttons move and wrap through the schedule');
  await preview.context.close();

  const quiet = await newPage({ TEST_MODE: true, TEST_DAY: 'Wednesday', TEST_TIME: '18:00', VIDEOS: [] });
  await quiet.page.goto(base);
  await quiet.page.locator('.session-row').first().waitFor();
  assert.equal(await quiet.page.locator('.session-row').count(), 1);
  const quietRowHeight = await quiet.page.locator('.session-row').first().evaluate(row => row.getBoundingClientRect().height);
  assert.ok(quietRowHeight > crowdedRowHeight + 20);
  assert.equal(await quiet.page.locator('.location-type').textContent(), 'LECTURE HALL');
  await quiet.page.screenshot({ path: 'test-results/quiet-schedule.png' });
  record('A quieter schedule uses taller rows for readability');
  await quiet.context.close();

  const progress = await newPage({ VIDEOS: [], PAGE_DURATION: 3600000 });
  await progress.page.clock.install({ time: new Date('2026-09-15T09:00:00+05:30') });
  await progress.page.goto(base);
  await progress.page.locator('.session-progress-track').first().waitFor();
  const firstProgress = Number(await progress.page.locator('.session-progress-track').first().getAttribute('aria-valuenow'));
  const savedPage = await progress.page.locator('#page-number').textContent();
  await progress.page.evaluate(() => { window.savedRow = document.querySelector('.session-row'); });
  await progress.page.clock.runFor(60000);
  const laterProgress = Number(await progress.page.locator('.session-progress-track').first().getAttribute('aria-valuenow'));
  assert.ok(laterProgress > firstProgress);
  assert.ok(await progress.page.evaluate(() => window.savedRow === document.querySelector('.session-row')));
  assert.equal(await progress.page.locator('#page-number').textContent(), savedPage);
  record('Live progress advances without recreating rows or restarting pagination');
  await progress.context.close();

  const boundary = await newPage({ VIDEOS: [] });
  await boundary.page.clock.install({ time: new Date('2026-09-15T10:29:58+05:30') });
  await boundary.page.goto(base);
  await boundary.page.locator('.session-row').first().waitFor();
  const before = await boundary.page.locator('#ongoing-count').textContent();
  await boundary.page.clock.runFor(2500);
  const after = await boundary.page.locator('#ongoing-count').textContent();
  assert.notEqual(after, before);
  assert.equal(await boundary.page.locator('#clock-time').textContent(), '10:30');
  await boundary.page.clock.setSystemTime(new Date('2026-09-16T09:00:00+05:30'));
  await boundary.page.clock.runFor(6000);
  assert.equal(await boundary.page.locator('#clock-day').textContent(), 'WEDNESDAY');
  assert.ok((await boundary.page.locator('#session-rows').textContent()).includes('Probability and Statistics'));
  record('Sessions update across a start/end boundary and the next day without reloading');
  await boundary.context.close();

  const starting = await newPage({ VIDEOS: [] });
  await starting.page.clock.install({ time: new Date('2026-09-15T08:29:58+05:30') });
  await starting.page.goto(base);
  await starting.page.locator('.session-row').first().waitFor();
  assert.equal(await starting.page.locator('.session-progress-track').count(), 0);
  assert.equal(await starting.page.locator('#ongoing-count').textContent(), '0');
  await starting.page.clock.runFor(2500);
  assert.equal(await starting.page.locator('#ongoing-count').textContent(), '17');
  assert.ok(await starting.page.locator('.session-progress-track').count() > 0);
  assert.equal(await starting.page.locator('.session-progress-caption').first().textContent(), '0% completed');
  record('Upcoming rows become ongoing at their start deadline and receive progress bars');
  await starting.context.close();

  const errorState = await newPage({ TEST_MODE: true, VIDEOS: [], LOAD_RETRY_INTERVAL: 300 });
  let attempts = 0;
  await errorState.context.route('**/data/timetable.xlsx', route => ++attempts === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await errorState.page.goto(base);
  await errorState.page.getByText('Timetable information is temporarily unavailable.').waitFor();
  await errorState.page.locator('.session-row').first().waitFor();
  assert.ok(attempts >= 2);
  record('Unavailable Excel shows the fallback and recovers on retry');
  await errorState.context.close();

  const empty = await newPage({ TEST_MODE: true, VIDEOS: [], DATE_EXCEPTIONS: { '2026-09-15': { closed: true } }, LOGO_PATH: './assets/missing-logo.png' });
  await empty.page.goto(base);
  await empty.page.getByText('NO SCHEDULED SESSIONS', { exact: true }).waitFor();
  assert.ok(await empty.page.locator('#brand-logo').isHidden());
  assert.ok(!/SLIIT KANDY UNI/i.test(await empty.page.locator('.masthead').textContent()));
  await empty.page.screenshot({ path: 'test-results/empty-state.png' });
  record('No-session state and a missing logo are handled; the logo area hides without breaking the display');
  await empty.context.close();

  const videoTest = await newPage({ TEST_MODE: true, TIMETABLE_DURATION: 800, PAGE_DURATION: 200 });
  await videoTest.page.addInitScript(() => {
    window.playbackEvents = [];
    let mediaLoad = 0;
    let recordedLoad = -1;
    document.addEventListener('loadstart', event => { if (event.target instanceof HTMLVideoElement) mediaLoad++; }, true);
    document.addEventListener('loadedmetadata', event => { if (event.target instanceof HTMLVideoElement) event.target.playbackRate = 8; }, true);
    for (const type of ['playing', 'ended']) document.addEventListener(type, event => {
      if (event.target instanceof HTMLVideoElement) {
        // Buffer recovery fires "playing" again without starting another clip.
        if (type === 'playing') {
          if (recordedLoad === mediaLoad) return;
          recordedLoad = mediaLoad;
        }
        const entry = { type, file: event.target.currentSrc.split('/').pop(), duration: event.target.duration, page: document.querySelector('#page-number').textContent };
        window.playbackEvents.push(entry);
        if (type === 'playing') setTimeout(() => { entry.badge = document.querySelector('#video-status-text').textContent; }, 0);
        if (type === 'ended') setTimeout(() => { entry.returnPage = document.querySelector('#page-number').textContent; }, 50);
      }
    }, true);
  });
  await videoTest.page.goto(base);
  await videoTest.page.waitForFunction(() => document.querySelector('#promo-video').currentSrc.endsWith('/2.mp4') && document.querySelector('#video-screen').classList.contains('active'));
  await videoTest.page.waitForTimeout(500);
  await videoTest.page.screenshot({ path: 'test-results/white-video-display.png' });
  await videoTest.page.waitForFunction(() => window.playbackEvents.filter(event => event.type === 'playing').length >= 4, null, { timeout: 45000 });
  await videoTest.page.waitForTimeout(50);
  const playback = await videoTest.page.evaluate(() => window.playbackEvents);
  assert.deepEqual(playback.filter(event => event.type === 'playing').slice(0,4).map(event => event.file), ['1.mp4','2.mp4','1.mp4','2.mp4']);
  assert.deepEqual(playback.filter(event => event.type === 'ended').slice(0,3).map(event => event.file), ['1.mp4','2.mp4','1.mp4']);
  for (const [file, duration] of [['1.mp4', 12.655], ['2.mp4', 34.833]]) {
    assert.ok(Math.abs(playback.find(event => event.file === file).duration - duration) < 0.1);
  }
  assert.deepEqual(playback.filter(event => event.type === 'playing').slice(0,4).map(event => event.badge), ['Playing Video 1 / 2', 'Playing Video 2 / 2', 'Playing Video 1 / 2', 'Playing Video 2 / 2']);
  for (const event of playback.filter(event => event.type === 'ended')) assert.equal(event.returnPage, event.page);
  assert.equal(await videoTest.page.locator('#promo-video').evaluate(video => getComputedStyle(video).objectFit), 'cover');
  assert.equal(await videoTest.page.locator('#video-screen').evaluate(screen => getComputedStyle(screen).borderRadius), '20px');
  assert.deepEqual(videoTest.errors, []);
  record('Both replacement MP4s play to natural ends and loop 1 → 2 → 1 with an accurate status badge');
  record('Timetable pagination resumes after videos instead of restarting at page one');
  await videoTest.context.close();

  const missingVideo = await newPage({ TEST_MODE: true, TIMETABLE_DURATION: 300, VIDEOS: ['0-missing.mp4', '1.mp4'] });
  await missingVideo.page.goto(base);
  await missingVideo.page.waitForFunction(() => document.querySelector('#promo-video').currentSrc.endsWith('/1.mp4') && !document.querySelector('#promo-video').paused);
  await missingVideo.page.locator('#video-screen.active').waitFor();
  record('Missing video is skipped and the next actual clip plays');
  await missingVideo.context.close();

  writeFileSync('test-results/browser-checks.json', JSON.stringify(checks, null, 2));
  console.log(`\n${checks.length} browser checks passed.`);
} finally { await browser.close(); }
