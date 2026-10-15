import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { DisplayCycle, orderedVideos } from '../js/video.js';

class MediaStub {
  currentTime = 0;
  muted = true;
  played = [];
  pause() {}
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  async play() { this.played.push(this.src); this.onplaying?.(); }
  finish() { this.onended?.(); }
}

test('video order uses natural filename sorting', () => {
  assert.deepEqual(orderedVideos({ ...CONFIG, VIDEOS: ['10.mp4', '2.mp4', '1.mp4', '2.mp4'] }), ['./videos/1.mp4', './videos/2.mp4', './videos/10.mp4']);
});

test('the configured playlist is the nine supplied videos in order', () => {
  assert.deepEqual(orderedVideos(CONFIG), Array.from({ length: 9 }, (_, i) => `./videos/${i + 1}.mp4`));
});

test('exact two-minute board timer, natural video end, reset, and sequence wrap', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const modes = [];
  const cycle = new DisplayCycle(video, CONFIG, mode => modes.push(mode));
  const playlist = orderedVideos(CONFIG);
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
  const cycle = new DisplayCycle(video, CONFIG);
  t.after(() => cycle.dispose());
  const playlist = orderedVideos(CONFIG);
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
  const cycle = new DisplayCycle(video, { ...CONFIG, VIDEO_MUTED: false });
  t.after(() => cycle.dispose());
  cycle.running = true;
  await cycle.playNextVideo();
  assert.equal(video.muted, true);
  assert.equal(video.played.length, 2);
  t.mock.timers.tick(CONFIG.VIDEO_STALL_TIMEOUT + 1);
  cycle.checkPlayback();
  assert.equal(video.src, orderedVideos(CONFIG)[1]); // The stalled Video 1 is skipped; Video 2 follows it.
  assert.equal(cycle.nextIndex, 2 % orderedVideos(CONFIG).length);
});

test('an empty video list leaves the timetable running without playback attempts', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const video = new MediaStub();
  const cycle = new DisplayCycle(video, { ...CONFIG, VIDEOS: [] });
  t.after(() => cycle.dispose());
  cycle.startDisplayCycle();
  t.mock.timers.tick(1000000);
  assert.equal(cycle.currentMode, 'TIMETABLE');
  assert.equal(video.played.length, 0);
});
