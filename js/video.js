export function orderedVideos(config) {
  // A playlist published from the admin panel keeps the order set there; the
  // local VIDEOS list falls back to numeric filename order.
  if (Array.isArray(config.VIDEO_PLAYLIST)) return [...new Set(config.VIDEO_PLAYLIST)].filter(Boolean);
  return [...new Set(config.VIDEOS)].sort((a, b) => a.split('/').pop().localeCompare(b.split('/').pop(), undefined, { numeric: true, sensitivity: 'base' }))
    .map(file => /^(?:https?:\/\/|\.\/|\/|videos\/)/.test(file) ? file : `${config.VIDEO_FOLDER}${file}`);
}

export class DisplayCycle {
  constructor(video, config, onModeChange = () => {}) {
    this.video = video;
    this.config = config;
    this.onModeChange = onModeChange;
    this.playlist = orderedVideos(config);
    // Exam periods pause the board: videos play back to back and the timetable
    // is only used as a fallback if every clip fails to load.
    this.videoOnly = Boolean(config.VIDEO_ONLY_MODE) && this.playlist.length > 0;
    this.currentMode = 'TIMETABLE';
    this.nextIndex = 0;
    this.currentIndex = -1;
    this.generation = 0;
    this.failed = 0;
    this.running = false;
    this.lastProgress = 0;
    this.lastMediaTime = 0;
    this.isPlaying = false;
    this.deadline = 0;
  }

  startDisplayCycle() {
    if (this.running) return;
    this.running = true;
    this.watchdog = setInterval(() => this.checkPlayback(), 3000);
    // Video-only mode covers the timetable from the very first frame, so the
    // board never appears, not even while the first clip loads.
    if (this.videoOnly) {
      this.playNextVideo();
      this.switchToVideo();
    } else this.startTimetableTimer();
  }

  /**
   * Picks up a playlist or exam-mode change published from the admin panel
   * without reloading the page. Returns true when something actually changed.
   */
  reload() {
    const playlist = orderedVideos(this.config);
    const videoOnly = Boolean(this.config.VIDEO_ONLY_MODE) && playlist.length > 0;
    if (playlist.join('|') === this.playlist.join('|') && videoOnly === this.videoOnly) return false;
    this.playlist = playlist;
    this.videoOnly = videoOnly;
    this.nextIndex = 0;
    this.failed = 0;
    if (!this.running) return true;
    if (videoOnly || this.currentMode === 'VIDEO') this.playNextVideo();
    else this.switchToTimetable();
    return true;
  }

  startTimetableTimer() {
    clearTimeout(this.timetableTimer);
    if (!this.running || !this.playlist.length) return;
    this.deadline = Date.now() + this.config.TIMETABLE_DURATION;
    this.timetableTimer = setTimeout(() => {
      this.failed = 0;
      this.playNextVideo();
    }, this.config.TIMETABLE_DURATION);
  }

  async playNextVideo() {
    if (!this.running || !this.playlist.length) return;
    clearTimeout(this.timetableTimer);
    clearTimeout(this.cleanupTimer);
    clearTimeout(this.loadTimer);
    this.clearMediaHandlers();
    this.video.pause();
    this.isPlaying = false;
    this.currentMode = 'VIDEO';
    const token = ++this.generation;
    this.currentIndex = this.nextIndex;
    const path = this.playlist[this.currentIndex];
    this.nextIndex = (this.nextIndex + 1) % this.playlist.length;
    const active = () => this.running && this.generation === token;
    this.video.muted = this.config.VIDEO_MUTED;
    this.video.defaultMuted = this.config.VIDEO_MUTED;
    this.video.loop = false;
    this.video.onended = () => { if (active()) this.handleVideoEnded(); };
    this.video.onerror = () => { if (active()) this.skipFailedVideo(); };
    this.video.onplaying = () => {
      if (!active()) return;
      clearTimeout(this.loadTimer);
      this.isPlaying = true;
      this.lastProgress = Date.now();
      this.lastMediaTime = this.video.currentTime;
      this.switchToVideo();
    };
    this.video.ontimeupdate = () => {
      if (active() && this.video.currentTime !== this.lastMediaTime) {
        this.lastMediaTime = this.video.currentTime;
        this.lastProgress = Date.now();
      }
    };
    this.loadTimer = setTimeout(() => { if (active()) this.skipFailedVideo(); }, this.config.VIDEO_LOAD_TIMEOUT);
    this.video.src = path;
    this.video.load();
    try {
      await this.video.play();
    } catch (error) {
      if (!active()) return;
      // A kiosk configured for sound may still be subject to browser autoplay
      // restrictions. Retry muted before skipping the clip.
      if (!this.video.muted && error.name === 'NotAllowedError') {
        this.video.muted = true;
        try { await this.video.play(); } catch { if (active()) this.skipFailedVideo(); }
      } else this.skipFailedVideo();
    }
  }

  switchToVideo() { this.onModeChange('VIDEO'); }

  handleVideoEnded() {
    if (!this.videoOnly) { this.switchToTimetable(); return; }
    this.failed = 0;
    this.playNextVideo();
  }

  skipFailedVideo() {
    this.failed++;
    // Keep the timetable visible while another video loads. Bounded attempts
    // prevent a missing playlist from causing an endless retry loop.
    // Video-only mode holds the video screen so a bad clip causes no flash.
    if (!this.videoOnly) this.onModeChange('TIMETABLE');
    if (this.failed < this.playlist.length) this.playNextVideo();
    else if (!this.videoOnly) this.switchToTimetable();
    else {
      // Video-only mode never falls back to the timetable: it stays on the
      // video screen and tries the whole playlist again after a short pause.
      this.failed = 0;
      clearTimeout(this.timetableTimer);
      this.timetableTimer = setTimeout(() => this.playNextVideo(), this.config.VIDEO_RETRY_DELAY ?? 10000);
    }
  }

  switchToTimetable() {
    ++this.generation;
    clearTimeout(this.loadTimer);
    this.clearMediaHandlers();
    this.video.pause();
    this.isPlaying = false;
    this.currentMode = 'TIMETABLE';
    this.onModeChange('TIMETABLE');
    this.startTimetableTimer();
    // Retain the final video frame during the fade, then release the decoder.
    this.cleanupTimer = setTimeout(() => {
      this.video.removeAttribute('src');
      this.video.load();
    }, this.config.TRANSITION_DURATION);
  }

  checkPlayback() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.currentMode === 'VIDEO' && this.isPlaying && Date.now() - this.lastProgress > this.config.VIDEO_STALL_TIMEOUT) this.skipFailedVideo();
  }

  resume() {
    if (!this.running) return;
    if (this.videoOnly) {
      // Nothing to fall back to, so restart playback unless a clip is still
      // loading or survived the screen sleeping. A genuinely stalled clip is
      // left to the watchdog instead of being skipped on every wake-up.
      if (this.currentMode === 'VIDEO' && !this.video.paused && !this.video.ended) return;
      this.failed = 0;
      this.playNextVideo();
    } else if (this.currentMode === 'VIDEO') {
      // Recover from the browser suspending the decoder while the screen slept.
      this.switchToTimetable();
    } else if (this.deadline && Date.now() >= this.deadline) {
      this.failed = 0;
      this.playNextVideo();
    }
  }

  clearMediaHandlers() {
    this.video.onended = null;
    this.video.onerror = null;
    this.video.onplaying = null;
    this.video.ontimeupdate = null;
  }

  dispose() {
    this.running = false;
    ++this.generation;
    clearTimeout(this.timetableTimer);
    clearTimeout(this.loadTimer);
    clearTimeout(this.cleanupTimer);
    clearInterval(this.watchdog);
    this.clearMediaHandlers();
    this.video.pause();
  }
}
