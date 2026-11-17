// Live link between the admin panel and the TV display.
//
// With Firebase connected the board reads its timetable, exams, videos and
// settings straight from Firestore and re-renders whenever an administrator
// saves something. With Firebase left unconfigured this module does nothing at
// all and the display keeps parsing data/timetable.xlsx exactly as before.
import { FIREBASE_CONFIG, FIREBASE_SDK, ADMIN_OPTIONS, isFirebaseConfigured } from '../firebase-config.js';
import { DEFAULT_SETTINGS, DEFAULT_ARRANGEMENT, toSession, dateKey, directVideoUrl } from './schema.js';

const NAMES = ADMIN_OPTIONS.COLLECTIONS;

export function createRemote(config) {
  const state = {
    configured: isFirebaseConfigured(),
    live: false,
    entries: [],
    exams: [],
    videos: [],
    settings: { ...DEFAULT_SETTINGS, dataSource: ADMIN_OPTIONS.DEFAULT_DATA_SOURCE },
    arrangement: { ...DEFAULT_ARRANGEMENT }
  };
  let handlers = {};
  let unsubscribes = [];

  /** Sessions for one calendar day, ready for evaluateSchedule(). */
  function sessionsFor(date = new Date()) {
    const key = dateKey(date);
    const weekly = state.entries.map(entry => toSession(entry, config, 'timetable')).filter(Boolean);
    if (!state.settings.showExamsOnDisplay) return weekly;
    const sittings = state.exams
      .filter(exam => exam.date === key)
      .map(exam => toSession(exam, config, 'exams'))
      .filter(Boolean);
    return [...weekly, ...sittings];
  }

  function playlist() {
    return [...state.videos]
      .filter(video => video.enabled !== false && (video.playbackUrl || video.url))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title).localeCompare(String(b.title)))
      .map(video => {
        const url = video.playbackUrl || directVideoUrl(video.url);
        return /^https?:\/\//i.test(url) ? url : `./${String(url).replace(/^\.?\//, '')}`;
      });
  }

  /** Copies the admin settings over the deployment defaults in config.js. */
  function applySettings() {
    const settings = state.settings;
    config.PAGE_DURATION = Math.max(4, Number(settings.pageDuration) || DEFAULT_SETTINGS.pageDuration) * 1000;
    config.TIMETABLE_DURATION = Math.max(20, Number(settings.timetableDuration) || DEFAULT_SETTINGS.timetableDuration) * 1000;
    config.MAX_ROWS = Math.max(2, Number(settings.maxRows) || DEFAULT_SETTINGS.maxRows);
    config.VIDEO_ONLY_MODE = Boolean(settings.videoOnlyMode);
    config.VIDEO_MUTED = settings.videoMuted !== false;
    config.ACTIVE_DATE_RANGE = { start: settings.activeFrom || null, end: settings.activeTo || null };
    if (settings.logoUrl) config.LOGO_PATH = settings.logoUrl;
    config.CAMPUS_TITLE = settings.campusTitle || DEFAULT_SETTINGS.campusTitle;
    config.DISPLAY_SUBTITLE = settings.subtitle || DEFAULT_SETTINGS.subtitle;

    // A timetable block in the arrangement overrides the plain duration, and a
    // disabled video block empties the playlist without deleting any clips.
    const sequence = (state.arrangement.sequence || []).filter(segment => segment.enabled !== false);
    const timetableBlock = sequence.find(segment => segment.type === 'timetable');
    if (timetableBlock?.duration) config.TIMETABLE_DURATION = Math.max(20, Number(timetableBlock.duration)) * 1000;
    const videosOn = sequence.some(segment => segment.type === 'videos');
    config.VIDEO_PLAYLIST = videosOn || settings.videoOnlyMode ? playlist() : [];
  }

  /**
   * Opens the live connection. Resolves once the first snapshot of every
   * collection has arrived, so the first paint is never half-empty.
   */
  async function start(callbacks = {}) {
    handlers = callbacks;
    if (!state.configured) return { live: false, dataSource: 'excel' };

    const [appSdk, dbSdk] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`)
    ]);
    const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
    const db = dbSdk.getFirestore(app);

    const pending = new Set(['timetable', 'exams', 'videos', 'settings', 'arrangement']);
    let settle;
    const first = new Promise(resolve => { settle = resolve; });
    const done = key => { pending.delete(key); if (!pending.size) settle(); };

    const listen = (key, reference, onSnapshotData) => {
      unsubscribes.push(dbSdk.onSnapshot(reference, snapshot => {
        onSnapshotData(snapshot);
        const firstTime = pending.has(key);
        done(key);
        if (!firstTime) notify(key);
      }, error => {
        console.warn(`[signage] live ${key} feed stopped:`, error?.message || error);
        done(key);
      }));
    };

    listen('timetable', dbSdk.collection(db, NAMES.timetable), snapshot => {
      state.entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
    listen('exams', dbSdk.collection(db, NAMES.exams), snapshot => {
      state.exams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
    listen('videos', dbSdk.collection(db, NAMES.videos), snapshot => {
      state.videos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
    listen('settings', dbSdk.doc(db, NAMES.settings, 'display'), snapshot => {
      state.settings = { ...DEFAULT_SETTINGS, dataSource: ADMIN_OPTIONS.DEFAULT_DATA_SOURCE, ...(snapshot.exists() ? snapshot.data() : {}) };
    });
    listen('arrangement', dbSdk.doc(db, NAMES.settings, 'arrangement'), snapshot => {
      const stored = snapshot.exists() ? snapshot.data() : {};
      state.arrangement = {
        ...DEFAULT_ARRANGEMENT,
        ...stored,
        sequence: Array.isArray(stored.sequence) && stored.sequence.length ? stored.sequence : DEFAULT_ARRANGEMENT.sequence
      };
    });

    // Never hang the board on a slow or blocked Firestore connection.
    await Promise.race([first, new Promise(resolve => setTimeout(resolve, config.LOAD_TIMEOUT || 15000))]);
    state.live = true;
    applySettings();
    return { live: true, dataSource: effectiveSource() };
  }

  /**
   * An empty timetable collection means the admin panel has not been filled in
   * yet, not that the campus has no classes all week, so the board keeps using
   * the workbook until the first entry is saved.
   */
  function effectiveSource() {
    if (state.settings.dataSource === 'excel') return 'excel';
    return state.entries.length ? 'firebase' : 'excel';
  }

  function notify(key) {
    const before = JSON.stringify([config.VIDEO_PLAYLIST, config.VIDEO_ONLY_MODE]);
    applySettings();
    const after = JSON.stringify([config.VIDEO_PLAYLIST, config.VIDEO_ONLY_MODE]);
    handlers.onChange?.({ key, playlistChanged: before !== after, dataSource: effectiveSource() });
  }

  function stop() {
    for (const unsubscribe of unsubscribes) { try { unsubscribe(); } catch { /* already closed */ } }
    unsubscribes = [];
  }

  return {
    get configured() { return state.configured; },
    get live() { return state.live; },
    get settings() { return state.settings; },
    get arrangement() { return state.arrangement; },
    get usingRemoteTimetable() { return state.live && effectiveSource() === 'firebase'; },
    sessionsFor, playlist, start, stop
  };
}
