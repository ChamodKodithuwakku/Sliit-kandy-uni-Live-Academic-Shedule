// Shared vocabulary for the admin panel and the TV display. Both sides turn
// Firestore documents into the same session objects, so the display code does
// not care whether a session came from the workbook or from the admin panel.

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const LOCATION_TYPES = ['LECTURE HALL', 'COMPUTER LAB'];
export const ROLES = ['admin', 'editor'];
export const SEGMENT_TYPES = ['timetable', 'exams', 'videos'];

export const DEFAULT_SETTINGS = {
  campusTitle: 'City Campus',
  subtitle: 'LIVE ACADEMIC SCHEDULE',
  logoUrl: '',
  dataSource: 'firebase',          // 'firebase' | 'excel'
  pageDuration: 12,                // seconds per timetable page
  timetableDuration: 120,          // seconds of timetable between videos
  maxRows: 10,
  videoOnlyMode: false,            // exam period: videos only
  videoMuted: true,
  showExamsOnDisplay: true,
  activeFrom: '',                  // 'YYYY-MM-DD', empty = always on
  activeTo: '',
  timezone: 'Asia/Colombo',
  updatedAt: null,
  updatedBy: ''
};

export const DEFAULT_ARRANGEMENT = {
  // The display runs this list top to bottom and then repeats.
  sequence: [
    { id: 'seg-timetable', type: 'timetable', label: "Today's timetable", enabled: true, duration: 120 },
    { id: 'seg-videos', type: 'videos', label: 'Campus videos', enabled: true, duration: 0 }
  ],
  updatedAt: null,
  updatedBy: ''
};

export const EMPTY_ENTRY = {
  day: 'Monday', startTime: '08:30', endTime: '10:30',
  moduleCode: '', moduleName: '', room: '', locationType: 'LECTURE HALL',
  faculty: '', lecturer: '', intake: '', visible: true
};

export const EMPTY_EXAM = {
  date: '', startTime: '09:00', endTime: '12:00',
  moduleCode: '', moduleName: '', room: '', lecturer: '', intake: '', visible: true
};

export const EMPTY_VIDEO = { title: '', url: '', order: 0, enabled: true };

/** '08:30', '8.30 am', '0830' and Excel-style values all become minutes. */
export function timeToMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 1 ? Math.round(value * 1440) : Math.round(value);
  }
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3];
  if (hour > 23 || minute > 59) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function minutesToTime(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function formatTime12(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '—';
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatRange(start, end) {
  return `${formatTime12(start)} – ${formatTime12(end)}`;
}

/** Local-time date key, never UTC, so a late evening change stays on today. */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekdayOf(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
}

export function formatDateLong(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Sort order used everywhere: Monday first, then by start time, then room. */
export function compareEntries(a, b) {
  const dayDiff = WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day);
  if (dayDiff) return dayDiff;
  const startDiff = (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
  if (startDiff) return startDiff;
  return String(a.room || '').localeCompare(String(b.room || ''), undefined, { numeric: true });
}

export function compareExams(a, b) {
  if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
  return (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0);
}

/** Faculty text the display shows on the right-hand column. */
export function resolveFaculty(entry, config = {}) {
  if (entry.faculty) return entry.faculty;
  const code = String(entry.moduleCode || '').toUpperCase();
  const prefix = code.match(/^[A-Z]+/)?.[0] || '';
  const map = config.FACULTY_MAPPING || {};
  for (const key of Object.keys(map)) {
    if (prefix.startsWith(key.toUpperCase())) return map[key];
  }
  return config.UNKNOWN_FACULTY || 'Faculty not specified';
}

export function resolveLocationType(entry, config = {}) {
  if (entry.locationType) return entry.locationType;
  const key = String(entry.room || '').replace(/\s+/g, '').toUpperCase();
  return config.ROOM_TYPE_MAPPING?.[key] === 'COMPUTER LAB' ? 'COMPUTER LAB' : 'LECTURE HALL';
}

/**
 * Firestore document -> display session. Returns null when the row cannot be
 * shown (hidden, or the times do not make a real block of time).
 */
export function toSession(entry, config = {}, kind = 'timetable') {
  if (entry.visible === false) return null;
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);
  if (start === null || end === null || end <= start) return null;
  const day = kind === 'exams' ? weekdayOf(entry.date) : entry.day;
  if (!day) return null;
  return {
    id: `${kind}:${entry.id}`,
    day,
    date: kind === 'exams' ? entry.date : '',
    moduleCode: String(entry.moduleCode || '').trim(),
    moduleName: String(entry.moduleName || '').trim(),
    room: String(entry.room || '').trim(),
    locationType: kind === 'exams' ? 'EXAM HALL' : resolveLocationType(entry, config),
    faculty: resolveFaculty(entry, config),
    lecturer: String(entry.lecturer || '').trim(),
    intake: String(entry.intake || '').trim(),
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    start,
    end,
    kind,
    source: `${kind}/${entry.id}`
  };
}

/** Normalises whatever the admin form produced before it is written away. */
export function cleanEntry(input) {
  const entry = { ...EMPTY_ENTRY, ...input };
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);
  return {
    day: WEEK_DAYS.includes(entry.day) ? entry.day : 'Monday',
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    moduleCode: String(entry.moduleCode || '').trim().toUpperCase(),
    moduleName: String(entry.moduleName || '').trim(),
    room: String(entry.room || '').trim().toUpperCase(),
    locationType: LOCATION_TYPES.includes(entry.locationType) ? entry.locationType : 'LECTURE HALL',
    faculty: String(entry.faculty || '').trim(),
    lecturer: String(entry.lecturer || '').trim(),
    intake: String(entry.intake || '').trim(),
    visible: entry.visible !== false
  };
}

export function cleanExam(input) {
  const entry = { ...EMPTY_EXAM, ...input };
  return {
    date: String(entry.date || '').trim(),
    startTime: minutesToTime(timeToMinutes(entry.startTime)),
    endTime: minutesToTime(timeToMinutes(entry.endTime)),
    moduleCode: String(entry.moduleCode || '').trim().toUpperCase(),
    moduleName: String(entry.moduleName || '').trim(),
    room: String(entry.room || '').trim().toUpperCase(),
    lecturer: String(entry.lecturer || '').trim(),
    intake: String(entry.intake || '').trim(),
    visible: entry.visible !== false
  };
}

/** Form validation shared by the add and edit dialogs. */
export function validateEntry(entry) {
  const errors = [];
  if (!WEEK_DAYS.includes(entry.day)) errors.push('Choose a day of the week.');
  const start = timeToMinutes(entry.startTime);
  const end = timeToMinutes(entry.endTime);
  if (start === null) errors.push('Start time is not a valid time.');
  if (end === null) errors.push('End time is not a valid time.');
  if (start !== null && end !== null && end <= start) errors.push('End time must be after the start time.');
  if (!entry.moduleName && !entry.moduleCode) errors.push('Enter a subject name or a module code.');
  if (!entry.room) errors.push('Enter the venue.');
  return errors;
}

export function validateExam(exam) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exam.date || '')) errors.push('Choose the exam date.');
  const start = timeToMinutes(exam.startTime);
  const end = timeToMinutes(exam.endTime);
  if (start === null || end === null) errors.push('Enter valid start and end times.');
  if (start !== null && end !== null && end <= start) errors.push('End time must be after the start time.');
  if (!exam.moduleName && !exam.moduleCode) errors.push('Enter a subject name or a module code.');
  if (!exam.room) errors.push('Enter the exam venue.');
  return errors;
}

/**
 * Dropbox and Google Drive share links open a web page, not a video file.
 * The display needs a direct file URL, so convert the common share formats.
 */
export function directVideoUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/dropbox\.com/i.test(value)) {
    return value
      .replace(/([?&])dl=0/, '$1raw=1')
      .replace(/([?&])dl=1/, '$1raw=1')
      .replace(/^(https:\/\/)www\.dropbox\.com/, '$1dl.dropboxusercontent.com')
      + (/[?&](raw|dl)=/.test(value) ? '' : (value.includes('?') ? '&raw=1' : '?raw=1'));
  }
  const drive = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  return value;
}
