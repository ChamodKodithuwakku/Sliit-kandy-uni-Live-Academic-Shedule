// Development inspection only. Production reads Excel directly in the browser.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parsed } from '../tests/helpers.js';
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/workbook-audit.json', JSON.stringify(parsed, null, 2));
console.log(JSON.stringify({
  sheets: parsed.sheets,
  sessions: parsed.sessions.length,
  days: Object.fromEntries([...new Set(parsed.sessions.map(x => x.day))].map(day => [day, parsed.sessions.filter(x => x.day === day).length])),
  faculty: Object.fromEntries([...new Set(parsed.sessions.map(x => x.faculty))].map(faculty => [faculty, parsed.sessions.filter(x => x.faculty === faculty).length])),
  notes: Object.fromEntries([...new Set(parsed.diagnostics.map(x => x.type))].map(type => [type, parsed.diagnostics.filter(x => x.type === type).length])),
  uncertain: parsed.sessions.filter(x => !x.moduleCode || x.missingName).map(({ source, moduleCode, moduleName, faculty }) => ({ source, moduleCode, moduleName, faculty })),
  conflictingTimes: parsed.diagnostics.filter(x => x.type === 'conflicting-time-note')
}, null, 2));
