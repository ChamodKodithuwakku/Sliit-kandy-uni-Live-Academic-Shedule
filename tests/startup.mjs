import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const filePage = await browser.newPage();
  await filePage.goto(new URL('../index.html', import.meta.url).href);
  await filePage.getByText('Start the timetable with the launcher', { exact: true }).waitFor();
  assert.equal(await filePage.locator('#loading-track').isVisible(), false);
  assert.notEqual(await filePage.locator('#clock-time').textContent(), '--:--');
  console.log('PASS Direct HTML opening shows launcher instructions and a working clock.');

  const site = await browser.newPage();
  const errors = [];
  site.on('pageerror', error => errors.push(error.message));
  const settings = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
  await site.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: settings + '\nObject.assign(CONFIG, { TEST_MODE: true, VIDEOS: [], ATTEMPT_FULLSCREEN: false });' }));
  await site.goto('http://127.0.0.1:8080');
  await site.locator('.session-row').first().waitFor();
  assert.equal(await site.locator('#ongoing-count').textContent(), '17');
  assert.equal(await site.locator('#upcoming-count').textContent(), '29');
  assert.notEqual(await site.locator('#clock-time').textContent(), '--:--');
  assert.equal(await site.locator('#empty-state').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS Local preview loads the actual workbook and displays its sessions.');
} finally { await browser.close(); }
