import { mountShell, previewButton } from './shell.js';
import { watch, create, update, remove, createMany, COLLECTIONS } from './store.js';
import { $, el, icon, banner, toast, modal, field, checkbox, readForm, confirmDialog } from './ui.js';
import { errorText } from './firebase.js';
import {
  WEEK_DAYS, LOCATION_TYPES, EMPTY_ENTRY, cleanEntry, validateEntry,
  compareEntries, formatRange
} from '../../js/schema.js';

await mountShell('timetable');

const addButton = el('button', { class: 'btn btn-primary btn-wide', type: 'button', html: `${icon('plus')}<span>Add Timetable Entry</span>` });
const importButton = el('button', { class: 'btn', type: 'button', html: `${icon('upload')}<span>Import from workbook</span>` });
$('#head-actions').append(previewButton(), importButton, addButton);
importButton.addEventListener('click', () => importWorkbook(importButton));

const dayFilter = $('#filter-day');
for (const day of WEEK_DAYS) dayFilter.append(el('option', { value: day, text: day }));

let entries = [];
dayFilter.addEventListener('change', draw);
$('#search').addEventListener('input', draw);
addButton.addEventListener('click', () => openEditor(null));

try {
  await watch(COLLECTIONS.timetable, data => { entries = data; draw(); }, error => banner($('#alerts'), errorText(error)));
} catch (error) {
  banner($('#alerts'), errorText(error));
}

function visibleEntries() {
  const day = dayFilter.value;
  const term = $('#search').value.trim().toLowerCase();
  return entries
    .filter(entry => !day || entry.day === day)
    .filter(entry => !term || [entry.moduleName, entry.moduleCode, entry.room, entry.lecturer, entry.intake]
      .some(value => String(value || '').toLowerCase().includes(term)))
    .sort(compareEntries);
}

function draw() {
  const list = visibleEntries();
  $('#count').innerHTML = `<strong>${entries.length}</strong> weekly schedule entries${list.length !== entries.length ? ` · ${list.length} shown` : ''}`;
  const body = $('#rows');
  if (!list.length) {
    body.replaceChildren(el('tr', { class: 'empty-row' }, [
      el('td', { colspan: '7', text: entries.length ? 'No entries match this filter.' : 'No timetable entries yet. Use “Add Timetable Entry” to create the first one.' })
    ]));
    return;
  }
  body.replaceChildren(...list.map(entry => {
    const hidden = entry.visible === false;
    return el('tr', { class: hidden ? 'is-hidden' : '', style: hidden ? 'opacity:.6' : null }, [
      el('td', {}, [el('span', { class: 'chip chip-day', text: entry.day })]),
      el('td', { class: 'nowrap', text: formatRange(entry.startTime, entry.endTime) }),
      el('td', {}, [
        el('span', { class: 'primary', text: entry.moduleName || entry.moduleCode || '—' }),
        el('span', { class: 'sub', text: [entry.moduleCode, entry.intake].filter(Boolean).join(' · ') })
      ]),
      el('td', {}, [
        el('span', { text: entry.room || '—' }),
        el('span', { class: 'sub', text: entry.locationType === 'COMPUTER LAB' ? 'Computer lab' : 'Lecture hall' })
      ]),
      el('td', { text: entry.lecturer || '—' }),
      el('td', {}, [el('span', { class: `chip ${hidden ? 'chip-grey' : 'chip-green'}`, text: hidden ? 'Hidden' : 'Visible' })]),
      el('td', {}, [el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Edit', onClick: () => openEditor(entry) }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: hidden ? 'Show' : 'Hide',
          onClick: async event => {
            event.currentTarget.disabled = true;
            try {
              await update(COLLECTIONS.timetable, entry.id, { visible: hidden });
              toast(hidden ? 'Entry is back on the display.' : 'Entry hidden from the display.');
            } catch (error) { toast(errorText(error), 'err'); event.currentTarget.disabled = false; }
          }
        }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Delete this entry?',
              message: `${entry.moduleName || entry.moduleCode || 'This session'} on ${entry.day}, ${formatRange(entry.startTime, entry.endTime)} will be removed from the display. This cannot be undone.`
            });
            if (!ok) return;
            try { await remove(COLLECTIONS.timetable, entry.id); toast('Entry deleted.'); }
            catch (error) { toast(errorText(error), 'err'); }
          }
        })
      ])])
    ]);
  }));
}

// --------------------------------------------------------------------------
// One-off migration: reads data/timetable.xlsx with the same parser the TV
// display uses, then adds whatever is not in Firestore yet.
// --------------------------------------------------------------------------
function loadSheetJs() {
  if (globalThis.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../vendor/xlsx.full.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the spreadsheet reader (vendor/xlsx.full.min.js).'));
    document.head.append(script);
  });
}

async function importWorkbook(button) {
  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = '<span>Reading the workbook…</span>';
  try {
    await loadSheetJs();
    const [{ CONFIG }, parser] = await Promise.all([import('../../config.js'), import('../../js/parser.js')]);
    const workbookConfig = { ...CONFIG, EXCEL_FILE: '../data/timetable.xlsx' };
    const workbook = await parser.loadExcel(workbookConfig);
    const parsed = parser.parseWorkbook(workbook, workbookConfig);

    const existing = new Set(entries.map(entry => `${entry.day}|${entry.startTime}|${entry.room}|${entry.moduleCode}|${entry.moduleName}`));
    const candidates = parsed.sessions
      .map(item => cleanEntry({
        day: item.day, startTime: item.startTime, endTime: item.endTime,
        moduleCode: item.moduleCode, moduleName: item.moduleName,
        room: item.room, locationType: item.locationType, faculty: item.faculty,
        lecturer: '', intake: '', visible: true
      }))
      .filter(entry => !validateEntry(entry).length)
      .filter(entry => !existing.has(`${entry.day}|${entry.startTime}|${entry.room}|${entry.moduleCode}|${entry.moduleName}`));

    const unique = [];
    const seen = new Set();
    for (const entry of candidates) {
      const key = `${entry.day}|${entry.startTime}|${entry.room}|${entry.moduleCode}|${entry.moduleName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }

    if (!unique.length) {
      await modal({
        title: 'Nothing new to import',
        confirmLabel: 'Close', width: '460px',
        build: body => body.append(el('p', {
          style: 'margin:0;color:#475569;line-height:1.6',
          text: `The workbook produced ${parsed.sessions.length} session(s) and every one of them is already in the timetable.`
        })),
        onConfirm: () => true
      });
      return;
    }

    const proceed = await confirmDialog({
      title: `Import ${unique.length} session(s)?`,
      message: `data/timetable.xlsx produced ${parsed.sessions.length} session(s); ${unique.length} are not in the timetable yet. They are added as visible entries without a lecturer or intake, which you can fill in afterwards. Nothing already here is changed.`,
      confirmLabel: 'Import', danger: false
    });
    if (!proceed) return;

    button.innerHTML = '<span>Importing…</span>';
    const written = await createMany(COLLECTIONS.timetable, unique);
    toast(`${written} session(s) imported from the workbook.`);
  } catch (error) {
    banner($('#alerts'), errorText(error));
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function openEditor(entry) {
  const value = { ...EMPTY_ENTRY, ...(entry || {}) };
  let errorBox;
  return modal({
    title: entry ? 'Edit timetable entry' : 'Add timetable entry',
    note: 'Everything here is what the lobby display shows for this session.',
    confirmLabel: entry ? 'Save changes' : 'Add entry',
    build: body => {
      errorBox = el('div');
      const day = field({ label: 'Day', name: 'day', value: value.day, options: WEEK_DAYS });
      const start = field({ label: 'Start time', name: 'startTime', type: 'time', value: value.startTime });
      const end = field({ label: 'End time', name: 'endTime', type: 'time', value: value.endTime });
      const code = field({ label: 'Module code', name: 'moduleCode', value: value.moduleCode, placeholder: 'IT1010' });
      const name = field({ label: 'Subject', name: 'moduleName', value: value.moduleName, placeholder: 'Introduction to Programming' });
      const intake = field({ label: 'Intake / group', name: 'intake', value: value.intake, placeholder: 'Foundation Y1S1 June/2026', help: 'Shown as the small line under the subject.' });
      const room = field({ label: 'Venue', name: 'room', value: value.room, placeholder: 'C302' });
      const type = field({ label: 'Venue type', name: 'locationType', value: value.locationType, options: LOCATION_TYPES.map(item => [item, item === 'COMPUTER LAB' ? 'Computer lab' : 'Lecture hall']) });
      const lecturer = field({ label: 'Lecturer', name: 'lecturer', value: value.lecturer, placeholder: 'Ms. Lakshima' });
      const faculty = field({ label: 'Faculty', name: 'faculty', value: value.faculty, placeholder: 'Faculty of Computing', help: 'Leave empty to work it out from the module code.' });
      const visible = checkbox({ label: 'Show on the TV display', name: 'visible', checked: value.visible !== false, help: 'Hidden entries stay here but never reach the board.' });

      body.append(
        errorBox,
        el('div', { class: 'field-row' }, [day.wrap, start.wrap, end.wrap]),
        el('div', { class: 'field-row' }, [code.wrap, name.wrap]),
        intake.wrap,
        el('div', { class: 'field-row' }, [room.wrap, type.wrap]),
        el('div', { class: 'field-row' }, [lecturer.wrap, faculty.wrap]),
        visible.wrap
      );
    },
    onConfirm: async body => {
      const clean = cleanEntry(readForm(body));
      const errors = validateEntry(clean);
      if (errors.length) { banner(errorBox, errors); return false; }
      try {
        if (entry) { await update(COLLECTIONS.timetable, entry.id, clean); toast('Timetable entry updated.'); }
        else { await create(COLLECTIONS.timetable, clean); toast('Timetable entry added.'); }
      } catch (error) { banner(errorBox, errorText(error)); return false; }
    }
  });
}
