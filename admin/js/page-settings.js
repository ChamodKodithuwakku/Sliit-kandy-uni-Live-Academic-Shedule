import { mountShell, previewButton } from './shell.js';
import { readSettings, saveSettings, listAll, COLLECTIONS } from './store.js';
import { $, el, icon, banner, toast, field, checkbox } from './ui.js';
import { errorText, storage, ADMIN_OPTIONS } from './firebase.js';
import { DEFAULT_SETTINGS, WEEK_DAYS, compareEntries, formatRange, timeToMinutes } from '../../js/schema.js';

await mountShell('settings', { requireAdmin: true });
$('#head-actions').append(previewButton());

let saved;
let entries = [];
try {
  [saved, entries] = await Promise.all([readSettings(), listAll(COLLECTIONS.timetable)]);
} catch (error) {
  banner($('#alerts'), errorText(error));
  saved = { ...DEFAULT_SETTINGS };
}
let working = { ...saved };

const controls = {};
const form = $('#form');

function add(node) { form.append(node); }

function text(key, label, options = {}) {
  const control = field({ label, name: key, value: working[key] ?? '', ...options });
  control.input.addEventListener('input', () => { working[key] = control.input.value; refresh(); });
  controls[key] = control.input;
  return control.wrap;
}

function number(key, label, options = {}) {
  const control = field({ label, name: key, type: 'number', value: working[key] ?? '', ...options });
  control.input.addEventListener('input', () => { working[key] = Number(control.input.value) || 0; refresh(); });
  controls[key] = control.input;
  return control.wrap;
}

function choice(key, label, options, help = '') {
  const control = field({ label, name: key, value: working[key], options, help });
  control.input.addEventListener('change', () => { working[key] = control.input.value; refresh(); });
  controls[key] = control.input;
  return control.wrap;
}

function flag(key, label, help = '') {
  const control = checkbox({ label, name: key, checked: working[key] !== false && working[key] !== undefined ? Boolean(working[key]) : false, help });
  control.input.checked = Boolean(working[key]);
  control.input.addEventListener('change', () => { working[key] = control.input.checked; refresh(); });
  controls[key] = control.input;
  return control.wrap;
}

add(text('campusTitle', 'Campus title', { help: 'Shown under the logo on the display and across this admin panel.' }));
add(text('subtitle', 'Subtitle / tagline', { help: 'The small capitals line beside the logo. Default: LIVE ACADEMIC SCHEDULE.' }));

// ---- logo
const logoRow = el('div', { class: 'field' }, [
  el('label', { class: 'field-label', text: 'Campus logo' }),
  el('p', { class: 'help', style: 'margin:0 0 9px', text: 'Upload a new SLIIT Kandy UNI logo (JPG, PNG or WebP, up to 8 MB). The TV display and the admin branding update automatically after saving. Leave it alone to keep the built-in logo.' })
]);
const logoPreview = el('img', { src: working.logoUrl || '../assets/logo.png', alt: '', style: 'height:48px;background:#fff;border:1px solid #e7edf5;border-radius:10px;padding:6px' });
const logoFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
const logoUrlInput = el('input', { type: 'url', placeholder: 'or paste an image URL', value: working.logoUrl || '' });
const logoClear = el('button', { class: 'btn btn-sm', type: 'button', text: 'Restore the built-in logo' });
logoRow.append(
  el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, [logoPreview, el('div', { style: 'flex:1;min-width:210px' }, [logoFile])]),
  el('div', { style: 'margin-top:10px' }, [logoUrlInput]),
  el('div', { style: 'margin-top:10px' }, [logoClear])
);
add(logoRow);

logoUrlInput.addEventListener('input', () => {
  working.logoUrl = logoUrlInput.value.trim();
  logoPreview.src = working.logoUrl || '../assets/logo.png';
  refresh();
});
logoClear.addEventListener('click', () => {
  working.logoUrl = '';
  logoUrlInput.value = '';
  logoPreview.src = '../assets/logo.png';
  refresh();
});
logoFile.addEventListener('change', async () => {
  const file = logoFile.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('That image is larger than 8 MB.', 'err'); logoFile.value = ''; return; }
  if (!ADMIN_OPTIONS.USE_STORAGE) { toast('Firebase Storage is switched off in firebase-config.js — paste a URL instead.', 'err'); return; }
  toast('Uploading the logo…');
  try {
    const { sdk, bucket } = await storage();
    const reference = sdk.ref(bucket, `branding/logo-${Date.now()}-${file.name.replace(/[^\w.-]/g, '')}`);
    await sdk.uploadBytes(reference, file, { contentType: file.type });
    working.logoUrl = await sdk.getDownloadURL(reference);
    logoUrlInput.value = working.logoUrl;
    logoPreview.src = working.logoUrl;
    refresh();
    toast('Logo uploaded. Press “Save settings” to publish it.');
  } catch (error) {
    toast(errorText(error), 'err', 6000);
  } finally { logoFile.value = ''; }
});

add(el('div', { class: 'field-row' }, [
  number('pageDuration', 'Page duration (seconds)', { attrs: { min: '4', max: '120' }, help: 'How long one page of the timetable stays up.' }),
  number('timetableDuration', 'Timetable block (seconds)', { attrs: { min: '20', max: '1800' }, help: 'Time on the timetable before the videos.' }),
  number('maxRows', 'Rows per page', { attrs: { min: '2', max: '14' } })
]));

add(el('div', { class: 'field-row' }, [
  text('activeFrom', 'Term starts', { type: 'date', help: 'Empty = always on.' }),
  text('activeTo', 'Term ends', { type: 'date' }),
  choice('timezone', 'Timezone', [
    ['Asia/Colombo', 'Asia/Colombo'], ['Asia/Kolkata', 'Asia/Kolkata'], ['Asia/Dubai', 'Asia/Dubai'],
    ['Europe/London', 'Europe/London'], ['UTC', 'UTC']
  ], 'The board uses the clock of the device it runs on; this is recorded for reference.')
]));

add(choice('dataSource', 'Timetable source', [
  ['firebase', 'This admin panel (Firebase)'],
  ['excel', 'The Excel workbook in data/timetable.xlsx']
], 'Switch to the workbook only if you want to go back to the old file-based setup.'));

add(flag('videoOnlyMode', 'Exam mode — videos only', 'Pauses the timetable completely. Videos play back to back and repeat until you turn this off.'));
add(flag('showExamsOnDisplay', 'Show exam sittings on the display on their date'));
add(flag('videoMuted', 'Mute campus videos'));

// ------------------------------------------------------------------ preview
const clock = el('span', { class: 'preview-clock' });
setInterval(() => { clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: true }); }, 1000);
clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: true });

function refresh() {
  const today = WEEK_DAYS[(new Date().getDay() + 6) % 7];
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  const rows = entries
    .filter(entry => entry.visible !== false && entry.day === today)
    .sort(compareEntries)
    .slice(0, Math.max(2, Math.min(6, Number(working.maxRows) || 6)));

  const table = el('table', { class: 'preview-table' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'TIME' }), el('th', { text: 'SUBJECT' }), el('th', { text: 'VENUE' }), el('th', { text: 'STATUS' })
    ])]),
    el('tbody', {}, rows.length ? rows.map(entry => {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      const status = minutes >= start && minutes < end ? ['ONGOING', 'chip-green']
        : minutes < start ? ['UPCOMING', 'chip-amber'] : ['FINISHED', 'chip-grey'];
      return el('tr', {}, [
        el('td', { class: 'ps', style: 'white-space:nowrap', text: formatRange(entry.startTime, entry.endTime) }),
        el('td', {}, [el('div', { class: 'pm', text: entry.moduleName || entry.moduleCode || '—' }), el('div', { class: 'ps', text: entry.intake || '' })]),
        el('td', { class: 'pm', text: entry.room || '—' }),
        el('td', {}, [el('span', { class: `chip ${status[1]}`, style: 'font-size:9px;padding:3px 8px', text: status[0] })])
      ]);
    }) : [el('tr', {}, [el('td', { colspan: '4', class: 'ps', style: 'padding:22px;text-align:center', text: 'No sessions scheduled for today.' })])])
  ]);

  $('#preview').replaceChildren(
    el('div', { class: 'preview-head' }, [
      el('div', { class: 'preview-brand' }, [
        el('img', { src: working.logoUrl || '../assets/logo.png', alt: '' }),
        el('span', { class: 'campus', text: working.campusTitle || 'City Campus' })
      ]),
      clock
    ]),
    el('div', { class: 'preview-body' }, [
      el('div', { class: 'preview-today', text: working.videoOnlyMode ? 'EXAM MODE — VIDEOS ONLY' : (working.subtitle || 'LIVE ACADEMIC SCHEDULE') }),
      el('div', { class: 'preview-day', text: today }),
      el('div', { class: 'preview-meta', text: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} · ${rows.length} session(s) shown` }),
      table
    ]),
    el('div', { class: 'preview-foot' }, [
      el('span', { text: `${working.pageDuration || 12}s per page · ${working.timetableDuration || 120}s per timetable block` }),
      el('span', { text: working.dataSource === 'excel' ? 'Source: Excel workbook' : 'Source: this admin panel' })
    ])
  );

  $('#source-note').replaceChildren(el('div', {
    class: `alert ${working.dataSource === 'excel' ? 'alert-warn' : 'alert-info'}`,
    html: `${icon('alert')}<div>${working.dataSource === 'excel'
      ? 'The display is reading <code>data/timetable.xlsx</code>. Changes made on the Timetable page will <strong>not</strong> appear on the board until you switch the source back.'
      : 'The display is reading the Timetable and Exam Timetable pages live. Edits show up on the board within a few seconds.'}</div>`
  }));
}
refresh();

// --------------------------------------------------------------------- save
$('#save').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    const payload = {
      campusTitle: String(working.campusTitle || '').trim() || DEFAULT_SETTINGS.campusTitle,
      subtitle: String(working.subtitle || '').trim() || DEFAULT_SETTINGS.subtitle,
      logoUrl: String(working.logoUrl || '').trim(),
      dataSource: working.dataSource === 'excel' ? 'excel' : 'firebase',
      pageDuration: Math.min(120, Math.max(4, Number(working.pageDuration) || DEFAULT_SETTINGS.pageDuration)),
      timetableDuration: Math.min(1800, Math.max(20, Number(working.timetableDuration) || DEFAULT_SETTINGS.timetableDuration)),
      maxRows: Math.min(14, Math.max(2, Number(working.maxRows) || DEFAULT_SETTINGS.maxRows)),
      videoOnlyMode: Boolean(working.videoOnlyMode),
      showExamsOnDisplay: Boolean(working.showExamsOnDisplay),
      videoMuted: Boolean(working.videoMuted),
      activeFrom: working.activeFrom || '',
      activeTo: working.activeTo || '',
      timezone: working.timezone || DEFAULT_SETTINGS.timezone
    };
    await saveSettings(payload);
    saved = { ...saved, ...payload };
    working = { ...saved };
    toast('Settings saved. The display updates within a few seconds.');
  } catch (error) { toast(errorText(error), 'err', 6000); }
  finally { event.currentTarget.disabled = false; }
});

$('#revert').addEventListener('click', () => {
  working = { ...saved };
  for (const [key, input] of Object.entries(controls)) {
    if (input.type === 'checkbox') input.checked = Boolean(working[key]);
    else input.value = working[key] ?? '';
  }
  logoUrlInput.value = working.logoUrl || '';
  logoPreview.src = working.logoUrl || '../assets/logo.png';
  refresh();
  toast('Back to the saved settings.');
});

// Keep the preview honest about today's date rolling over at midnight.
setInterval(refresh, 60000);
