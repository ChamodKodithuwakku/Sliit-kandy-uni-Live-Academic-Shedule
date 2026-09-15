// The workbook is parsed in the browser. No generated timetable or server is used.
import { getRoomType } from './rooms.js';
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CODE_PATTERN = /\b([A-Z]{2,6})\s*(\d{3,5})\b/i;
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const compact = value => clean(value).replace(/\s+/g, ' ');
const isNote = line => /^(?:temp(?:orary|orar)?\b|reserved?\b|extra\b|taken?\s+by\b|in[au]+guration\b|dob\b|bridging\b|top\s*up\b|interval\b|lunch\b|intake\b|\[verify|\d+(?:st|nd|rd|th)\b|(?:HDIT|HDBM)\s+special\b|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d)/i.test(line);
const isLecturer = line => /^(?:(?:Mr|Mrs|Ms|Dr|Prof)(?:\.|\s)|VL\b|Lecturer\b)/i.test(line);
const isMetadata = line => /^(?:[BT]\d?\s*(?:G\d)?|G\d+|lab|lecture|workshop|BYOD|\(?\d+\)?|A\s*\d{3}|City Campus\b.*)$/i.test(line);

export function toMinutes(value) {
  const match = clean(value).match(/^(\d{1,2})(?:[:.](\d{1,2}))?\s*([ap])\.?m\.?$/i)
    || clean(value).match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return null;
  if (match[3]) hour = hour % 12 + (match[3].toLowerCase() === 'p' ? 12 : 0);
  return hour * 60 + minute;
}

export function formatMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function parseTimeSlot(value) {
  const parts = clean(value).replace(/[–—]/g, '-').split(/\s*(?:-|\bto\b)\s*/i);
  if (parts.length !== 2) return null;
  const start = toMinutes(parts[0]);
  let end = toMinutes(parts[1]);
  // Unmarked afternoon ranges (1:30–2:30) in this campus timetable.
  let resolvedStart = start;
  if (start !== null && end !== null && !/[ap]\.?m/i.test(value)) {
    if (resolvedStart < 7 * 60) resolvedStart += 12 * 60;
    if (end < 7 * 60) end += 12 * 60;
  }
  if (resolvedStart === null || end === null || end <= resolvedStart) return null;
  return { start: resolvedStart, end };
}

export async function loadExcel(config, xlsx = globalThis.XLSX) {
  if (!xlsx) throw new Error('SheetJS is not available');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.LOAD_TIMEOUT);
  try {
    const response = await fetch(config.EXCEL_FILE, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`Timetable request failed: ${response.status}`);
    const bytes = await response.arrayBuffer();
    return xlsx.read(bytes, { type: 'array', cellDates: false, cellStyles: false });
  } finally {
    clearTimeout(timer);
  }
}

function cellText(sheet, r, c, xlsx) {
  const cell = sheet[xlsx.utils.encode_cell({ r, c })];
  return clean(cell?.v);
}

export function extractTimeRows(sheet, xlsx) {
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
  const columns = new Map();
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 3); c++) {
      const slot = parseTimeSlot(cellText(sheet, r, c, xlsx));
      if (slot) {
        if (!columns.has(c)) columns.set(c, new Map());
        columns.get(c).set(r, slot);
      }
    }
  }
  return [...columns.values()].sort((a, b) => b.size - a.size)[0] || new Map();
}

export function extractDays(sheet, xlsx) {
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
  const result = new Map();
  let day = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 1); c++) {
      const text = cellText(sheet, r, c, xlsx);
      const found = DAYS.find(candidate => candidate.toLowerCase() === text.toLowerCase());
      if (found) day = found;
    }
    // Forward-fill day sections, including time rows beyond the day-label merge.
    if (day) result.set(r, day);
  }
  return result;
}

export function extractRooms(sheet, timeRows, config, xlsx) {
  if (!timeRows.size) return [];
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
  const firstTimeRow = Math.min(...timeRows.keys());
  const rooms = new Map();
  for (let r = range.s.r; r < firstTimeRow; r++) {
    for (let c = 2; c <= range.e.c; c++) {
      const raw = compact(cellText(sheet, r, c, xlsx));
      const match = raw.match(/^([A-Z]{1,2})\s*(\d{3,4})(?!\d)/i);
      if (match) rooms.set(c, { column: c, room: `${match[1]}${match[2]}`.toUpperCase(), raw });
      else if (/meeting room|^city campus$/i.test(raw)) rooms.set(c, { column: c, room: raw, raw });
    }
  }
  for (const [column, room] of Object.entries(config.ROOM_COLUMN_OVERRIDES || {})) {
    const c = xlsx.utils.decode_col(column);
    rooms.set(c, { column: c, room, raw: room });
  }
  return [...rooms.values()].sort((a, b) => a.column - b.column);
}

export function detectFaculty(text, moduleCode, moduleName, config) {
  // Use only the primary academic description, never a later replacement note.
  for (const [label, faculty] of Object.entries(config.FACULTY_LABELS || {})) {
    if (new RegExp(`\\b${label}\\b`, 'i').test(text)) return faculty;
  }
  const explicit = text.match(/Faculty of [A-Za-z /&]+/i);
  if (explicit) return compact(explicit[0]).replace(/\s*[-–—].*$/, '');
  const prefix = moduleCode.match(/^[A-Z]+/i)?.[0].toUpperCase();
  return config.FACULTY_MAPPING[prefix] || config.MODULE_FACULTY_MAPPING?.[moduleName] || config.UNKNOWN_FACULTY;
}

export function parseModuleInformation(value, config) {
  const rawText = clean(value);
  const lines = rawText.split(/[\r\n]+|\s*\|\s*/).map(compact).filter(Boolean);
  if (!lines.length || isNote(lines[0])) return null;
  const useful = [];
  for (const line of lines) {
    if (isLecturer(line) || isNote(line)) {
      if (useful.length) break;
      if (isNote(line)) return null;
      continue;
    }
    if (isMetadata(line)) continue;
    useful.push(line);
    if (/\(FO[CB]\)/i.test(line)) break;
  }
  const primary = useful.join(' ');
  if (!primary || /^(?:Y\d(?:S\d)?|\dY\dS|HDIT|HDBM)\b/i.test(primary) && !CODE_PATTERN.test(primary)) return null;
  const code = primary.match(CODE_PATTERN);
  const numericCode = !code && primary.match(/^(\d{3})\s*[-–—]/);
  const moduleCode = code ? `${code[1]}${code[2]}`.toUpperCase() : numericCode ? numericCode[1] : '';
  let moduleName = code ? primary.slice(code.index + code[0].length) : numericCode ? primary.slice(numericCode[0].length) : primary;
  moduleName = moduleName.split(/\s*[-–—]?\s*(?:\bHDIT\b|\bHDBM\b|\bY[1-4](?:\s*S[1-2])?\b|\b[1-4]Y[1-4I]S\b|\b(?:IT|SE|CS|AI|DS)(?:\/(?:IT|SE|CS|AI|DS))*\s+Y\d|\(\s*FO[CB]\s*\)|\bFaculty of\b)/i)[0];
  moduleName = moduleName.split(/\s*[-–—]\s*(?:Mr|Mrs|Ms|Dr|Prof)(?:\.|\s)/i)[0];
  if (!moduleCode) moduleName = moduleName.split(/\s+[-–—]\s+/)[0];
  moduleName = compact(moduleName).replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').replace(/\s*\(\d+\)\s*$/, '');
  moduleName = config.MODULE_NAME_OVERRIDES?.[moduleCode] || moduleName;
  const missingName = !moduleName || /\[NAME NOT FOUND\]/i.test(moduleName);
  if (!moduleCode && missingName) return null;
  // An unrecoverable name stays empty; the display never shows placeholder text.
  if (missingName) moduleName = '';
  if (!moduleCode && (moduleName.length < 5 || /^(?:TPSM|LSS|Sep\b)/i.test(moduleName))) return null;
  return { moduleCode, moduleName, faculty: detectFaculty(primary, moduleCode, moduleName, config), rawText, missingName };
}

export function normalizeSession(session, config) {
  const room = compact(session.room);
  return {
    ...session,
    room,
    locationType: getRoomType(room, config),
    startTime: formatMinutes(session.start),
    endTime: formatMinutes(session.end)
  };
}

export function removeDuplicates(sessions) {
  const unique = new Map();
  for (const session of sessions) {
    const key = [session.day, session.room, session.moduleCode || session.moduleName, session.startTime, session.endTime].join('|');
    if (!unique.has(key)) unique.set(key, { ...session, id: key });
  }
  return [...unique.values()];
}

export function parseMergedSessions(sheet, name, rooms, days, timeRows, config, xlsx, diagnostics) {
  const anchors = new Map();
  const covered = new Set();
  for (const merge of sheet['!merges'] || []) {
    anchors.set(`${merge.s.r},${merge.s.c}`, merge);
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r !== merge.s.r || c !== merge.s.c) covered.add(`${r},${c}`);
      }
    }
  }
  const sessions = [];
  for (const [row, slot] of timeRows) {
    const day = days.get(row);
    if (!day) continue;
    for (const location of rooms) {
      const coordinate = `${row},${location.column}`;
      if (covered.has(coordinate)) continue;
      const raw = cellText(sheet, row, location.column, xlsx);
      if (!raw) continue;
      const cell = xlsx.utils.encode_cell({ r: row, c: location.column });
      const source = `${name.trim()}!${cell}`;
      const info = parseModuleInformation(raw, config);
      if (!info) {
        diagnostics.push({ type: 'ignored-note', source, text: raw });
        continue;
      }
      const merge = anchors.get(coordinate);
      let end = slot.end;
      if (merge) {
        for (let r = row; r <= merge.e.r; r++) {
          if (days.get(r) !== day) break;
          if (timeRows.has(r)) end = Math.max(end, timeRows.get(r).end);
        }
      }
      let room = location.room;
      if (/^city campus$/i.test(room)) {
        const explicit = raw.match(/City Campus\s+([A-Z]{1,2})\s*(\d{3,4})/i);
        if (explicit) room = `${explicit[1]}${explicit[2]}`.toUpperCase();
      }
      const override = config.SESSION_OVERRIDES?.[source];
      if (override?.exclude) continue;
      const session = normalizeSession({ ...info, day, room, start: slot.start, end, source, cell, sheet: name.trim(), merged: Boolean(merge) }, config);
      if (override) {
        Object.assign(session, override);
        session.start = toMinutes(session.startTime);
        session.end = toMinutes(session.endTime);
        session.locationType = getRoomType(session.room, config);
        if (session.start === null || session.end === null || session.end <= session.start) {
          diagnostics.push({ type: 'invalid-override', source });
          continue;
        }
      }
      if (info.missingName) diagnostics.push({ type: 'missing-module-name', source, moduleCode: info.moduleCode });
      if (!info.moduleCode) diagnostics.push({ type: 'missing-module-code', source, moduleName: info.moduleName });
      // Record contradictory free-text times for maintainers; merged cells remain
      // authoritative unless SESSION_OVERRIDES explicitly resolves the conflict.
      for (const line of raw.split(/[\r\n]+|\s*\|\s*/)) {
        const text = clean(line).replace(/\s*-\s*\(\d+\)\s*$/, '');
        if (/^\d{1,2}[.:]\d{2}\s*[ap]/i.test(text)) {
          const noteTime = parseTimeSlot(text);
          if (!noteTime || noteTime.start !== slot.start || noteTime.end !== end) {
            diagnostics.push({ type: 'conflicting-time-note', source, grid: `${session.startTime}–${session.endTime}`, note: text });
          }
        }
      }
      if (/\b(?:\d{1,2}(?:st|nd|rd|th)?\s*(?:of\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Spet|Oct|Nov|Dec)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/i.test(raw)) {
        diagnostics.push({ type: 'date-note', source, text: raw });
      }
      sessions.push(session);
    }
  }
  return sessions;
}

export function parseWorksheet(sheet, name, config, xlsx, diagnostics = []) {
  const timeRows = extractTimeRows(sheet, xlsx);
  const days = extractDays(sheet, xlsx);
  const rooms = extractRooms(sheet, timeRows, config, xlsx);
  if (!rooms.length || !timeRows.size || !days.size) return [];
  return parseMergedSessions(sheet, name, rooms, days, timeRows, config, xlsx, diagnostics);
}

export function parseWorkbook(workbook, config, xlsx = globalThis.XLSX) {
  const diagnostics = [];
  const sessions = [];
  const sheets = [];
  for (let index = 0; index < workbook.SheetNames.length; index++) {
    const name = workbook.SheetNames[index];
    const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden;
    if (hidden && !config.INCLUDE_HIDDEN_SHEETS) continue;
    if (config.WORKSHEETS.length && !config.WORKSHEETS.includes(name.trim())) continue;
    const parsed = parseWorksheet(workbook.Sheets[name], name, config, xlsx, diagnostics);
    if (parsed.length) sheets.push(name.trim());
    sessions.push(...parsed);
  }
  return { sessions: removeDuplicates(sessions), diagnostics, sheets };
}
