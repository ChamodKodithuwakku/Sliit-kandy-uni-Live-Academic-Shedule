import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config.js';
import { parseModuleInformation, parseTimeSlot, parseWorkbook, removeDuplicates } from '../js/parser.js';
import { evaluateSchedule, getDisplayDate, getCurrentTime, formatSessionTime, getSessionProgress, millisecondsUntilNextChange, localDateKey, paginateSessions } from '../js/schedule.js';
import { XLSX, workbook, parsed, at } from './helpers.js';
import { getRoomType } from '../js/rooms.js';

const source = cell => parsed.sessions.find(session => session.source === `JUL DEC 2026!${cell}`);

test('supplied workbook: only the visible room timetable is used, across all seven days', () => {
  assert.deepEqual(parsed.sheets, ['JUL DEC 2026']);
  assert.equal(parsed.sessions.length, 311);
  assert.equal(new Set(parsed.sessions.map(session => session.day)).size, 7);
  assert.ok(parsed.sessions.every(session => session.end > session.start));
  assert.equal(new Set(parsed.sessions.map(session => session.id)).size, 311);
});

test('merged blocks create one continuous session including midday gaps', () => {
  assert.equal(source('H15').startTime, '08:30');
  assert.equal(source('H15').endTime, '12:30');
  assert.equal(source('D8').startTime, '13:30');
  assert.equal(source('D8').endTime, '17:30');
  assert.equal(source('K64').startTime, '11:00');
  assert.equal(source('K64').endTime, '15:00');
  assert.equal(parsed.sessions.filter(session => session.source === 'JUL DEC 2026!H15').length, 1);
  assert.equal(source('H16'), undefined);
  assert.equal(source('C4'), undefined); // Empty merged area is not a class.
});

test('all configured labs override the workbook category; A405 remains a lecture hall', () => {
  for (const [room, type] of Object.entries(CONFIG.ROOM_TYPE_MAPPING)) {
    const found = parsed.sessions.filter(session => session.room === room);
    assert.ok(found.length);
    assert.ok(found.every(session => session.locationType === type));
  }
  assert.equal(source('O4').room, 'A405');
  assert.equal(source('O4').locationType, 'LECTURE HALL');
  assert.equal(source('T61').room, 'C302');
  assert.equal(source('W61').room, '07th Floor Meeting Room');
});

test('room types default to lecture halls and require an explicit computer lab mapping', () => {
  assert.equal(getRoomType('A406', CONFIG), 'LECTURE HALL');
  assert.equal(getRoomType(' a 403 ', CONFIG), 'COMPUTER LAB');
  assert.equal(getRoomType('A999', CONFIG), 'LECTURE HALL');
  assert.equal(getRoomType('A403', { ROOM_TYPE_MAPPING: {} }), 'LECTURE HALL');
  assert.equal(getRoomType('A999', { ROOM_TYPE_MAPPING: { A999: 'COMPUTER LAB' } }), 'COMPUTER LAB');
  assert.ok(parsed.sessions.filter(session => session.room === 'A406').every(session => session.locationType === 'LECTURE HALL'));
});

test('room overrides and date exceptions use the same configurable classification', () => {
  const config = {
    ...CONFIG,
    SESSION_OVERRIDES: { 'JUL DEC 2026!H15': { room: 'A403' } },
    DATE_EXCEPTIONS: { '2026-09-15': { add: [
      { room: 'A406', moduleName: 'Confirmed session', startTime: '09:00', endTime: '10:00' },
      { room: 'A403', moduleName: 'Confirmed lab session', startTime: '09:00', endTime: '10:00' }
    ] } }
  };
  const result = parseWorkbook(workbook, config, XLSX);
  assert.equal(result.sessions.find(session => session.source.endsWith('!H15')).locationType, 'COMPUTER LAB');
  const additions = evaluateSchedule(result.sessions, at('Tuesday', '09:00'), config).ongoing.filter(session => session.id.includes('|exception|'));
  assert.deepEqual(additions.map(session => [session.room, session.locationType]), [['A403', 'COMPUTER LAB'], ['A406', 'LECTURE HALL']]);
});

test('module text supports pipes, newlines, prefix cohorts, and lecturer privacy', () => {
  assert.equal(source('D4').moduleCode, 'IT1204');
  assert.equal(source('D4').moduleName, 'ETF');
  assert.equal(source('I20').moduleName, 'Professional Skills');
  assert.equal(source('L32').moduleName, 'Business Mathematics');
  assert.equal(source('D15').moduleCode, 'BM1015'); // Later replacement is not a second recurring class.
  assert.equal(source('D15').faculty, 'Faculty of Business Management');
  assert.equal(source('L15').moduleName, ''); // Unrecoverable names stay blank, never placeholder text.
  assert.equal(source('L15').moduleCode, 'IT1113');
  assert.ok(parsed.sessions.every(session => !/unavailable|unknown|not found|n\/a/i.test(session.moduleName)));
  assert.ok(parsed.sessions.every(session => !/\b(?:Mr\.|Ms\.|Dr\.|Prof\.|Intake|FOC|FOB)\b|\|/.test(session.moduleName)));
  assert.equal(parseModuleInformation('IT1120 - Introduction to Programming - Y1S1\nMs. Example', CONFIG).moduleName, 'Introduction to Programming');
  assert.equal(parseModuleInformation('Reserved', CONFIG), null);
  assert.equal(parseModuleInformation('Y1S1 | Mr. Suresh | LSS | Y1S1 Sep 14', CONFIG), null);
});

test('explicit faculty wins over the configurable prefix mapping', () => {
  const settings = { ...CONFIG, FACULTY_MAPPING: { ZZ: 'Faculty of Design' } };
  assert.equal(parseModuleInformation('ZZ1234 - Visual Communication - Y1S1', settings).faculty, 'Faculty of Design');
  assert.equal(parseModuleInformation('IT1234 - Business Computing - Y1S1 - (FOB)', CONFIG).faculty, 'Faculty of Business Management');
});

test('12-hour times, midday, and unmarked afternoon slots normalize correctly', () => {
  assert.deepEqual(parseTimeSlot('8.30am-9.30am'), { start: 510, end: 570 });
  assert.deepEqual(parseTimeSlot('11.30am – 12.30pm'), { start: 690, end: 750 });
  assert.deepEqual(parseTimeSlot('1:30–4:30'), { start: 810, end: 990 });
  assert.deepEqual(parseTimeSlot('12.30 pm - 1.30 pm'), { start: 750, end: 810 });
  assert.equal(parseTimeSlot('10.30 am - 12.30 am'), null);
  assert.equal(parseTimeSlot('8.99am - 10.30am'), null);
});

test('long sessions stay ongoing while later overlapping sessions start, then finish at the boundary', () => {
  const before = evaluateSchedule(parsed.sessions, at('Tuesday', '10:29'), CONFIG);
  const during = evaluateSchedule(parsed.sessions, at('Tuesday', '10:30'), CONFIG);
  const end = evaluateSchedule(parsed.sessions, at('Tuesday', '12:30'), CONFIG);
  assert.ok(before.ongoing.some(session => session.source.endsWith('!H15')));
  assert.ok(before.upcoming.some(session => session.source.endsWith('!O17')));
  assert.ok(during.ongoing.some(session => session.source.endsWith('!H15')));
  assert.ok(during.ongoing.some(session => session.source.endsWith('!O17')));
  assert.ok(!end.ongoing.some(session => session.source.endsWith('!H15')));
  assert.ok(!end.upcoming.some(session => session.source.endsWith('!H15')));
});

test('all requested times and all weekdays show only their own ongoing/upcoming classes', () => {
  const times = ['08:30', '09:00', '09:30', '10:30', '11:00', '12:00', '13:00', '14:30', '16:30'];
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    for (const time of times) {
      const date = at(day, time);
      const minute = date.getHours() * 60 + date.getMinutes();
      const state = evaluateSchedule(parsed.sessions, date, CONFIG);
      assert.ok(state.ongoing.every(session => session.day === day && session.start <= minute && session.end > minute));
      assert.ok(state.upcoming.every(session => session.day === day && session.start > minute));
      assert.ok(state.ongoing.every((session, i, all) => !i || all[i - 1].start <= session.start));
      assert.ok(state.upcoming.every((session, i, all) => !i || all[i - 1].start <= session.start));
      assert.equal(state.ongoing.length + state.upcoming.length, parsed.sessions.filter(session => session.day === day && session.end > minute).length);
    }
  }
});

test('every actual session has exact start and end behavior', () => {
  for (const session of parsed.sessions) {
    const start = evaluateSchedule(parsed.sessions, at(session.day, session.startTime), CONFIG);
    const end = evaluateSchedule(parsed.sessions, at(session.day, session.endTime), CONFIG);
    assert.ok(start.ongoing.some(item => item.id === session.id), session.source);
    assert.ok(![...end.ongoing, ...end.upcoming].some(item => item.id === session.id), session.source);
  }
});

test('pagination retains ongoing classes when they fit and never loses other classes', () => {
  const state = evaluateSchedule(parsed.sessions, at('Tuesday', '11:30'), CONFIG);
  const pinned = state.ongoing.slice(0, 3);
  const pages = paginateSessions(pinned, state.upcoming, 8);
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => pinned.every(session => page.includes(session))));
  for (const capacity of [2, 6, 8]) {
    const all = paginateSessions(state.ongoing, state.upcoming, capacity);
    assert.ok(all.every(page => page.length <= capacity));
    assert.equal(new Set(all.flat().map(session => session.id)).size, state.ongoing.length + state.upcoming.length);
    assert.equal(all[0][0].status, 'ONGOING');
  }
});

test('date exceptions can close, substitute, exclude, and add sessions without affecting the next week', () => {
  const closed = { ...CONFIG, DATE_EXCEPTIONS: { '2026-09-15': { closed: true } } };
  assert.equal(evaluateSchedule(parsed.sessions, at('Tuesday', '09:00'), closed).total, 0);
  assert.equal(evaluateSchedule(parsed.sessions, new Date('2026-09-22T09:00:00'), closed).total, 46);
  const substitute = { ...CONFIG, DATE_EXCEPTIONS: { '2026-09-15': { useDay: 'Monday', exclude: ['JUL DEC 2026!D4'], add: [{ room: 'A401', moduleName: 'Confirmed extra session', faculty: 'Faculty of Computing', startTime: '09:00', endTime: '10:00' }] } } };
  const result = evaluateSchedule(parsed.sessions, at('Tuesday', '09:00'), substitute);
  assert.equal(result.total, 28);
  assert.ok(result.ongoing.some(session => session.moduleName === 'Confirmed extra session'));
  assert.ok(!result.ongoing.some(session => session.source === 'JUL DEC 2026!D4'));
  assert.equal(evaluateSchedule(parsed.sessions, new Date('2027-01-05T09:00:00'), CONFIG).total, 0);
});

test('test mode is opt-in and local dates are stable around midnight', () => {
  const actual = new Date('2026-09-15T00:01:00');
  assert.equal(getDisplayDate(CONFIG, actual), actual);
  const simulated = getDisplayDate({ ...CONFIG, TEST_MODE: true, TEST_DAY: 'Monday', TEST_TIME: '09:00', TEST_DATE: '2026-09-15' });
  assert.equal(simulated.getDay(), 1);
  assert.equal(simulated.getHours(), 9);
  assert.equal(localDateKey(actual), '2026-09-15');
});

test('source ambiguities are reported and confirmed cell overrides are supported', () => {
  assert.equal(parsed.diagnostics.filter(note => note.type === 'conflicting-time-note').length, 16);
  const changed = parseWorkbook(workbook, { ...CONFIG, SESSION_OVERRIDES: { 'JUL DEC 2026!H35': { startTime: '16:00', endTime: '18:00' } } }, XLSX);
  const session = changed.sessions.find(item => item.source === 'JUL DEC 2026!H35');
  assert.equal(session.start, 960);
  assert.equal(session.end, 1080);
  assert.equal(removeDuplicates([session, session]).length, 1);
});

test('session times use 12-hour AM/PM formatting without changing the source', () => {
  assert.equal(formatSessionTime(source('H15').startTime), '08:30 AM');
  assert.equal(formatSessionTime(source('H15').endTime), '12:30 PM');
  assert.equal(formatSessionTime(source('D8').endTime), '05:30 PM');
  assert.equal(formatSessionTime('00:00'), '12:00 AM');
  assert.equal(formatSessionTime('12:00'), '12:00 PM');
  assert.equal(formatSessionTime('invalid'), '—');
});

test('actual four-hour merged session progresses from 0 to 100 percent, clamped at both ends', () => {
  const session = source('H15');
  for (const [time, expected] of [['08:00', 0], ['08:30', 0], ['09:30', 25], ['10:30', 50], ['11:30', 75], ['12:30', 100], ['13:00', 100]]) {
    assert.equal(getSessionProgress(session, getCurrentTime(at('Tuesday', time))), expected);
  }
  assert.equal(getSessionProgress({ start: 540, end: 540 }, 600), 0);
  assert.equal(getSessionProgress({ startTime: '09:00', endTime: '11:00' }, 600), 50);
  assert.equal(Object.hasOwn(session, 'progressPercentage'), false);
});

test('evaluated session objects get fresh progress while upcoming sessions stay at zero', () => {
  const first = evaluateSchedule(parsed.sessions, at('Tuesday', '09:30'), CONFIG);
  const later = evaluateSchedule(parsed.sessions, at('Tuesday', '10:30'), CONFIG);
  assert.equal(first.ongoing.find(session => session.source.endsWith('!H15')).progressPercentage, 25);
  assert.equal(later.ongoing.find(session => session.source.endsWith('!H15')).progressPercentage, 50);
  assert.ok(first.upcoming.every(session => session.progressPercentage === 0));
  assert.ok(parsed.sessions.every(session => !Object.hasOwn(session, 'progressPercentage')));
});

test('the next update deadline follows real session boundaries and midnight', () => {
  const before = new Date('2026-09-15T10:29:58.250');
  const state = evaluateSchedule(parsed.sessions, before, CONFIG);
  assert.equal(millisecondsUntilNextChange(state, before), 1750);
  const evening = new Date('2026-09-15T23:59:59.500');
  assert.equal(millisecondsUntilNextChange(evaluateSchedule(parsed.sessions, evening, CONFIG), evening), 500);
});
