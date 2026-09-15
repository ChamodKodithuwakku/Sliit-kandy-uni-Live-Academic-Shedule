import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CONFIG } from '../config.js';
import { parseWorkbook } from '../js/parser.js';

const context = {};
vm.runInNewContext(readFileSync(new URL('../vendor/xlsx.full.min.js', import.meta.url), 'utf8'), context);
export const XLSX = context.XLSX;
export const workbook = XLSX.read(new Uint8Array(readFileSync(new URL('../data/timetable.xlsx', import.meta.url))), { type: 'array' });
export const parsed = parseWorkbook(workbook, CONFIG, XLSX);
export function at(day, time) {
  const dayNumber = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);
  const date = new Date(`2026-09-13T${time}:00`);
  date.setDate(date.getDate() + dayNumber);
  return date;
}
