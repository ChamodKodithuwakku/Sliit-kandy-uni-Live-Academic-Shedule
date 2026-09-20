import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = process.env.TEST_URL || 'http://127.0.0.1:8080';
const settings = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function openPage(permission, hasTouch = false) {
  const context = await browser.newContext({ hasTouch });
  await context.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: settings + '\nObject.assign(CONFIG, { VIDEOS: [], KEEP_SCREEN_AWAKE: false });'
  }));
  const page = await context.newPage();
  if (permission) {
    const cdp = await context.newCDPSession(page);
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    await cdp.send('Browser.setPermission', {
      permission: { name: 'fullscreen', allowWithoutGesture: true },
      setting: permission,
      origin: new URL(base).origin,
      browserContextId: targetInfo.browserContextId
    });
  }
  await page.addInitScript(() => {
    const request = Element.prototype.requestFullscreen;
    window.fullscreenAttempts = [];
    Element.prototype.requestFullscreen = async function (...args) {
      const attempt = { finished: false };
      window.fullscreenAttempts.push(attempt);
      try {
        if (window.rejectNextFullscreen) {
          window.rejectNextFullscreen = false;
          throw new DOMException('Simulated temporary denial', 'NotAllowedError');
        }
        return await request.apply(this, args);
      } finally { attempt.finished = true; }
    };
  });
  await page.goto(base);
  await page.waitForFunction(() => window.fullscreenAttempts[0]?.finished);
  return { page, context };
}

try {
  if (process.argv.includes('--policy')) {
    const { page } = await openPage();
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
    console.log('PASS Installed Chrome policy opens the timetable fullscreen without any click.');
  } else {
    const promptVisible = page => page.evaluate(() => !document.getElementById('fullscreen-prompt').hidden);
    const desktop = await openPage('denied');
    assert.equal(await desktop.page.evaluate(() => !!document.fullscreenElement), false);
    assert.equal(await promptVisible(desktop.page), true);
    console.log('PASS A rejected automatic attempt shows "Click anywhere to enter fullscreen".');
    await desktop.page.evaluate(() => { window.rejectNextFullscreen = true; });
    await desktop.page.locator('#schedule-title').click();
    await desktop.page.waitForFunction(() => window.fullscreenAttempts[1]?.finished);
    assert.equal(await desktop.page.evaluate(() => !!document.fullscreenElement), false);
    await desktop.page.locator('#schedule-title').click();
    await desktop.page.waitForFunction(() => !!document.fullscreenElement);
    await desktop.page.locator('#fullscreen-button.is-active').waitFor();
    assert.equal(await promptVisible(desktop.page), false);
    console.log('PASS A click anywhere retries after a failed attempt, enters real fullscreen and hides the prompt.');

    await desktop.page.locator('#fullscreen-button').click();
    await desktop.page.waitForFunction(() => !document.fullscreenElement);
    const attempts = await desktop.page.evaluate(() => window.fullscreenAttempts.length);
    await desktop.page.locator('#schedule-title').click();
    assert.equal(await desktop.page.evaluate(() => window.fullscreenAttempts.length), attempts);
    assert.equal(await desktop.page.evaluate(() => !!document.fullscreenElement), false);
    assert.equal(await promptVisible(desktop.page), false);
    await desktop.page.locator('#fullscreen-button').click();
    await desktop.page.waitForFunction(() => !!document.fullscreenElement);
    console.log('PASS Exiting is respected, the prompt stays hidden, and the + button still enters fullscreen once.');
    await desktop.context.close();

    const touch = await openPage('denied', true);
    await touch.page.locator('#schedule-title').tap();
    await touch.page.waitForFunction(() => !!document.fullscreenElement);
    console.log('PASS Tapping outside the + button enters fullscreen on touch devices.');
    await touch.context.close();

    const automatic = await openPage('granted');
    assert.equal(await automatic.page.evaluate(() => !!document.fullscreenElement), true);
    assert.equal(await promptVisible(automatic.page), false);
    console.log('PASS With automatic-fullscreen permission, the page opens fullscreen without interaction.');
    await automatic.context.close();
  }
} finally { await browser.close(); }
