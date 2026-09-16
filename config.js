// All deployment settings live here. Production always uses the device's local clock.
export const CONFIG = {
  EXCEL_FILE: './data/timetable.xlsx',
  // Empty means auto-detect visible sheets with room columns and time rows.
  WORKSHEETS: [],
  INCLUDE_HIDDEN_SHEETS: false,
  TIMETABLE_DURATION: 120000,
  SESSION_UPDATE_INTERVAL: 5000,
  PAGE_DURATION: 12000,
  MAX_ROWS: 10,
  LOAD_TIMEOUT: 15000,
  LOAD_RETRY_INTERVAL: 60000,
  // Only rooms explicitly mapped to COMPUTER LAB are labeled as labs.
  // Unlisted rooms, including newly added room columns, default to LECTURE HALL.
  ROOM_TYPE_MAPPING: {
    A401: 'COMPUTER LAB',
    A402: 'COMPUTER LAB',
    A403: 'COMPUTER LAB',
    A404: 'COMPUTER LAB',
    A406: 'LECTURE HALL'
  },
  FACULTY_MAPPING: {
    IT: 'Faculty of Computing',
    IE: 'Faculty of Computing',
    SE: 'Faculty of Computing',
    FCIT: 'Faculty of Computing',
    BM: 'Faculty of Business Management',
    IM: 'Faculty of Business Management'
  },
  FACULTY_LABELS: {
    FOC: 'Faculty of Computing',
    FOB: 'Faculty of Business Management'
  },
  UNKNOWN_FACULTY: 'Faculty not specified',
  // Applied only to cells whose module code is absent; no fabricated module codes.
  MODULE_FACULTY_MAPPING: {
    'Strategic Management': 'Faculty of Business Management',
    'Business Mathematics': 'Faculty of Business Management',
    'Economic Analysis for Managers': 'Faculty of Business Management'
  },
  MODULE_NAME_OVERRIDES: {},
  // The actual workbook also has named meeting rooms and a City Campus column.
  // Add an Excel column letter here if a future sheet has an unnamed location.
  ROOM_COLUMN_OVERRIDES: {},
  // Merged grid times are authoritative by default. Free-text notes may conflict.
  // Key: '<trimmed worksheet name>!<anchor cell>', e.g. 'JUL DEC 2026!H35'.
  // Value: { startTime: '16:00', endTime: '18:00' } after campus confirmation.
  SESSION_OVERRIDES: {},
  // Optional term limits: 'YYYY-MM-DD'. Null keeps the recurring weekly timetable.
  ACTIVE_DATE_RANGE: { start: '2026-07-01', end: '2026-12-31' },
  // Date keys use local time, not UTC. Exceptions can close a day, use another
  // weekday, exclude source cells, or add normalized sessions for that date only.
  // '2026-09-22': { closed: true }
  // '2026-09-23': { useDay: 'Monday', exclude: ['JUL DEC 2026!C4'], add: [] }
  DATE_EXCEPTIONS: {},
  VIDEO_FOLDER: './videos/',
  // Video 1, Video 2, Video 3: deployment copies of the replacement root MP4s.
  VIDEOS: ['1.mp4', '2.mp4', '3.mp4'],
  VIDEO_MUTED: true,
  VIDEO_LOAD_TIMEOUT: 20000,
  VIDEO_STALL_TIMEOUT: 30000,
  TRANSITION_DURATION: 450,
  // Official logo image shown top-left in the header. If the file cannot be
  // loaded the logo area is hidden and the timetable still runs.
  LOGO_PATH: './assets/logo.png',
  ATTEMPT_FULLSCREEN: true,
  KEEP_SCREEN_AWAKE: true,
  DEBUG_MODE: false,
  TEST_MODE: false,
  TEST_DAY: 'Tuesday',
  TEST_TIME: '09:00',
  TEST_DATE: '2026-09-15'
};
