import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { DisplayCycle, orderedVideos } from '../js/video.js';

class MediaStub {
  currentTime = 0;
  muted = true;
  played = [];
  paused = true;
  ended = false;
  pause() { this.paused = true; }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  async play() { this.paused = false; this.played.push(this.src); this.onplaying?.(); }
  finish() { this.ended = true; this.paused = true; this.onended?.(); }
}

// The deployed config is in exam video-only mode. These tests cover the
// timetable/video cycle, so they opt back into it explicitly.
// The cycle tests use the multi-clip playlist so they do not depend on what
// the deployed config.js happens to play.
const MULTI_CONFIG = { ...CONFIG, VIDEOS: ['1.mp4', '2.mp4', '4.mp4', '5.mp4', '6.mp4', '7.mp4', '8.mp4', '9.mp4'] };
const CYCLE_CONFIG = { ...MULTI_CONFIG, VIDEO_ONLY_MODE: false };

test('video order uses natural filename sorting', () => {
  assert.deepEqual(orderedVideos({ ...CONFIG, VIDEOS: ['10.mp4', '2.mp4', '1.mp4', '2.mp4'] }), ['./videos/1.mp4', './videos/2.mp4', './videos/10.mp4']);
});

test('the multi-clip playlist skips the removed Video 3', () => {
  assert.deepEqual(orderedVideos(MULTI_CONFIG), [1, 2, 4, 5, 6, 7, 8, 9].map(n => `./videos/${n}.mp4`));
});

test('the deployed board plays Videos 1-9 (no 3) in order, each once, then repeats', () => {
  assert.deepEqual(orderedVideos(CONFIG), orderedVideos(MULTI_CONFIG));
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, CONFIG);
  const playlist = orderedVideos(CONFIG);
  cycle.startDisplayCycle();
  assert.equal(video.loop, false);
  for (let i = 1; i <= playlist.length; i++) video.finish();
  assert.deepEqual(video.played, [...playlist, playlist[0]]);
  cycle.dispose();
});

test('a single clip in video-only mode loops without a reload', () => {
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, { ...CONFIG, VIDEOS: ['1.mp4'] });
  cycle.startDisplayCycle();
  assert.equal(video.loop, true);
  cycle.dispose();
});

test('a multi-clip playlist does not loop a single clip', () => {
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, MULTI_CONFIG);
  cycle.running = true;
  cycle.playNextVideo();
  assert.equal(video.loop, false);
  cycle.dispose();
});

test('exact two-minute board timer, natural video end, reset, and sequence wrap', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const modes = [];
  const cycle = new DisplayCycle(video, CYCLE_CONFIG, mode => modes.push(mode));
  const playlist = orderedVideos(MULTI_CONFIG);
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  t.mock.timers.tick(119999);
  assert.equal(video.played.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(video.played, [playlist[0]]);
  for (let i = 0; i < 150; i++) {
    video.currentTime++;
    video.ontimeupdate();
    t.mock.timers.tick(1000);
  }
  assert.equal(cycle.currentMode, 'VIDEO'); // A long clip is never cut at two minutes.
  video.finish();
  assert.equal(cycle.currentMode, 'TIMETABLE');
  t.mock.timers.tick(119999);
  assert.equal(video.played.length, 1);
  t.mock.timers.tick(1);
  assert.equal(video.played.at(-1), playlist[1]);
  // Every remaining clip plays in filename order, then the sequence wraps to Video 1.
  for (let i = 2; i <= playlist.length; i++) {
    video.finish();
    assert.equal(cycle.currentMode, 'TIMETABLE');
    t.mock.timers.tick(120000);
    assert.equal(video.played.at(-1), playlist[i % playlist.length]);
  }
  assert.deepEqual(video.played, [...playlist, playlist[0]]);
  assert.deepEqual(modes.slice(0, 4), ['VIDEO', 'TIMETABLE', 'VIDEO', 'TIMETABLE']);
});

test('failed files skip forward; all failed files return to a functioning timetable', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, CYCLE_CONFIG);
  t.after(() => cycle.dispose());
  const playlist = orderedVideos(MULTI_CONFIG);
  cycle.startDisplayCycle();
  t.mock.timers.tick(120000);
  for (let i = 1; i < playlist.length; i++) {
    video.onerror();
    assert.equal(video.src, playlist[i]);
    assert.equal(cycle.currentMode, 'VIDEO');
  }
  video.onerror();
  assert.equal(cycle.currentMode, 'TIMETABLE');
  assert.equal(video.played.length, playlist.length);
  t.mock.timers.tick(119999);
  assert.equal(video.played.length, playlist.length);
});

test('blocked unmuted autoplay retries muted and a stalled video recovers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  video.play = async function () {
    this.played.push(this.src);
    if (!this.muted) throw Object.assign(new Error('Blocked'), { name: 'NotAllowedError' });
    this.onplaying?.();
  };
  const cycle = new DisplayCycle(video, { ...CYCLE_CONFIG, VIDEO_MUTED: false });
  t.after(() => cycle.dispose());
  cycle.running = true;
  await cycle.playNextVideo();
  assert.equal(video.muted, true);
  assert.equal(video.played.length, 2);
  t.mock.timers.tick(CONFIG.VIDEO_STALL_TIMEOUT + 1);
  cycle.checkPlayback();
  assert.equal(video.src, orderedVideos(MULTI_CONFIG)[1]); // The stalled Video 1 is skipped; Video 2 follows it.
  assert.equal(cycle.nextIndex, 2 % orderedVideos(MULTI_CONFIG).length);
});

test('an empty video list leaves the timetable running without playback attempts', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, { ...CYCLE_CONFIG, VIDEOS: [] });
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  t.mock.timers.tick(1000000);
  assert.equal(cycle.currentMode, 'TIMETABLE');
  assert.equal(video.played.length, 0);
});

test('exam video-only mode plays clip after clip and never shows the board', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const modes = [];
  const cycle = new DisplayCycle(video, MULTI_CONFIG, mode => modes.push(mode));
  const playlist = orderedVideos(MULTI_CONFIG);
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  // No two-minute board wait: Video 1 starts as soon as the display opens.
  assert.deepEqual(video.played, [playlist[0]]);
  assert.equal(cycle.currentMode, 'VIDEO');
  for (let i = 1; i <= playlist.length; i++) {
    video.finish();
    assert.equal(cycle.currentMode, 'VIDEO');
    assert.equal(video.played.at(-1), playlist[i % playlist.length]);
  }
  assert.deepEqual(video.played, [...playlist, playlist[0]]);
  assert.deepEqual(new Set(modes), new Set(['VIDEO']));
});

test('video-only mode skips a bad clip without a board flash and recovers if all fail', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const modes = [];
  const cycle = new DisplayCycle(video, MULTI_CONFIG, mode => modes.push(mode));
  const playlist = orderedVideos(MULTI_CONFIG);
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  for (let i = 1; i < playlist.length; i++) {
    video.onerror();
    assert.equal(video.src, playlist[i]);
    assert.equal(cycle.currentMode, 'VIDEO');
  }
  assert.deepEqual(new Set(modes), new Set(['VIDEO']));
  // Even an unplayable playlist never brings the timetable back: the video
  // screen stays up and the whole playlist is retried after a short pause.
  video.onerror();
  assert.equal(cycle.currentMode, 'VIDEO');
  assert.equal(video.played.length, playlist.length);
  t.mock.timers.tick(10000);
  assert.equal(video.played.length, playlist.length + 1);
  assert.equal(video.src, playlist[0]);
  assert.deepEqual(new Set(modes), new Set(['VIDEO']));
});

test('video-only mode keeps a playing clip through a wake-up and restarts a stopped one', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, MULTI_CONFIG);
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  cycle.resume();
  assert.equal(video.played.length, 1); // A healthy clip is not skipped on wake-up.
  // The browser suspending the decoder leaves the player paused, so the next
  // clip starts instead of the screen staying frozen.
  video.paused = true;
  cycle.resume();
  assert.equal(video.played.length, 2);
  assert.equal(cycle.currentMode, 'VIDEO');
});
