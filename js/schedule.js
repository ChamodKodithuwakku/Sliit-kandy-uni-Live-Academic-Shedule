import { DAYS, toMinutes } from './parser.js';
import { getRoomType } from './rooms.js';

export function getCurrentDay(date = new Date()) { return DAYS[date.getDay()]; }
export function getCurrentTime(date = new Date()) { return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000; }

export function formatSessionTime(value) {
  const minutes = toMinutes(value);
  if (minutes === null) return '—';
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function getSessionProgress(session, minute) {
  const start = session.start ?? toMinutes(session.startTime);
  const end = session.end ?? toMinutes(session.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(minute) || end <= start) return 0;
  return Math.max(0, Math.min(100, ((minute - start) / (end - start)) * 100));
}

export function millisecondsUntilNextChange(state, date) {
  const midnight = new Date(date);
  midnight.setHours(24, 0, 0, 0);
  let next = midnight.getTime();
  for (const minute of [...state.ongoing.map(session => session.end), ...state.upcoming.map(session => session.start)]) {
    const boundary = new Date(date);
    boundary.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    if (boundary.getTime() > date.getTime()) next = Math.min(next, boundary.getTime());
  }
  return Math.max(1, next - date.getTime());
}
export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDisplayDate(config, actual = new Date()) {
  if (!config.TEST_MODE) return actual;
  const date = new Date(`${config.TEST_DATE}T${config.TEST_TIME}:00`);
  const target = DAYS.indexOf(config.TEST_DAY);
  if (target >= 0) date.setDate(date.getDate() + target - date.getDay());
  return Number.isNaN(date.getTime()) ? actual : date;
}

const sortSessions = (a, b) => a.start - b.start || a.room.localeCompare(b.room, undefined, { numeric: true }) || a.moduleCode.localeCompare(b.moduleCode);
export function getOngoingSessions(sessions, minute) {
  return sessions.filter(session => minute >= session.start && minute < session.end).sort(sortSessions).map(session => ({ ...session, status: 'ONGOING', progressPercentage: getSessionProgress(session, minute) }));
}
export function getUpcomingSessions(sessions, minute) {
  return sessions.filter(session => minute < session.start).sort(sortSessions).map(session => ({ ...session, status: 'UPCOMING', progressPercentage: 0 }));
}

export function evaluateSchedule(sessions, date, config) {
  const key = localDateKey(date);
  const exception = config.DATE_EXCEPTIONS[key];
  const range = config.ACTIVE_DATE_RANGE;
  const outOfTerm = Boolean((range?.start && key < range.start) || (range?.end && key > range.end));
  const day = exception?.useDay || getCurrentDay(date);
  let today = sessions.filter(session => session.day === day);
  if (outOfTerm || exception?.closed) today = [];
  else if (exception) {
    today = today.filter(session => !exception.exclude?.includes(session.source) && !exception.exclude?.includes(session.id));
    const additions = (exception.add || []).map((session, i) => ({
      ...session,
      id: `${key}|exception|${i}`,
      day,
      moduleCode: session.moduleCode || '',
      faculty: session.faculty || config.UNKNOWN_FACULTY,
      locationType: getRoomType(session.room, config),
      start: toMinutes(session.startTime),
      end: toMinutes(session.endTime)
    })).filter(session => session.start !== null && session.end !== null && session.end > session.start);
    today.push(...additions);
  }
  const minute = getCurrentTime(date);
  const ongoing = getOngoingSessions(today, minute);
  const upcoming = getUpcomingSessions(today, minute);
  return { ongoing, upcoming, total: today.length, day, date: key, closed: Boolean(exception?.closed), outOfTerm };
}

function chunks(items, count) {
  return Array.from({ length: Math.ceil(items.length / count) }, (_, i) => items.slice(i * count, (i + 1) * count));
}

export function paginateSessions(ongoing, upcoming, capacity = 8) {
  capacity = Math.max(2, Math.floor(capacity));
  if (ongoing.length + upcoming.length <= capacity) return [[...ongoing, ...upcoming]];
  // Keep every ongoing class on every page whenever there is room for them.
  if (ongoing.length < capacity) {
    return chunks(upcoming, capacity - ongoing.length).map(page => [...ongoing, ...page]);
  }
  const livePages = chunks(ongoing, capacity);
  const spare = capacity - livePages[livePages.length - 1].length;
  livePages[livePages.length - 1].push(...upcoming.slice(0, spare));
  const nextPages = chunks(upcoming.slice(spare), capacity);
  if (!nextPages.length) return livePages;
  // Each upcoming page follows a full pass of the ongoing pages. Every class
  // is reachable, and live classes get more screen time than distant classes.
  return nextPages.flatMap(page => [...livePages, page]);
}
