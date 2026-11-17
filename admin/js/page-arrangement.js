import { mountShell, previewButton } from './shell.js';
import { readArrangement, saveArrangement, readSettings, listAll, COLLECTIONS } from './store.js';
import { $, el, icon, banner, toast, modal, field, confirmDialog } from './ui.js';
import { errorText } from './firebase.js';
import { DEFAULT_ARRANGEMENT, SEGMENT_TYPES } from '../../js/schema.js';

await mountShell('arrangement', { requireAdmin: true });
$('#head-actions').append(previewButton());

const LABELS = { timetable: "Today's timetable", exams: 'Exam timetable', videos: 'Campus videos' };
const BLURB = {
  timetable: 'The live lecture and computer-lab board, paged through automatically.',
  exams: "Only the exams dated for today, on their own screen.",
  videos: 'Every enabled clip from Campus Media, played in full.'
};

let state;
let settings;
let videoCount = 0;

try {
  [state, settings] = await Promise.all([readArrangement(), readSettings()]);
  videoCount = (await listAll(COLLECTIONS.videos)).filter(video => video.enabled !== false && video.url).length;
} catch (error) {
  banner($('#alerts'), errorText(error));
  state = { ...DEFAULT_ARRANGEMENT, sequence: DEFAULT_ARRANGEMENT.sequence.map(item => ({ ...item })) };
  settings = {};
}

draw();

$('#save').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    await saveArrangement({ sequence: state.sequence });
    toast('Arrangement saved. The display picks it up within a few seconds.');
  } catch (error) { toast(errorText(error), 'err'); }
  finally { event.currentTarget.disabled = false; }
});

$('#reset').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'Restore the default order?',
    message: 'The screen goes back to: timetable for two minutes, then the campus videos, repeating.',
    confirmLabel: 'Restore', danger: false
  });
  if (!ok) return;
  state.sequence = DEFAULT_ARRANGEMENT.sequence.map(item => ({ ...item }));
  draw();
});

$('#add').addEventListener('click', () => {
  let errorBox;
  modal({
    title: 'Add a block',
    note: 'Blocks can repeat — a timetable block before and after the videos is a common setup.',
    confirmLabel: 'Add block',
    width: '480px',
    build: body => {
      errorBox = el('div');
      const type = field({ label: 'Block', name: 'type', value: 'timetable', options: SEGMENT_TYPES.map(item => [item, LABELS[item]]) });
      const label = field({ label: 'Name on this page', name: 'label', value: '', placeholder: 'Leave empty for the default' });
      const duration = field({ label: 'Seconds on screen', name: 'duration', type: 'number', value: '120', attrs: { min: '10', max: '1800' }, help: 'Ignored for videos — each clip always plays to the end.' });
      body.append(errorBox, type.wrap, label.wrap, duration.wrap);
    },
    onConfirm: body => {
      const type = body.querySelector('[name=type]').value;
      const label = body.querySelector('[name=label]').value.trim();
      const duration = Number(body.querySelector('[name=duration]').value) || 120;
      state.sequence.push({ id: `seg-${Date.now().toString(36)}`, type, label: label || LABELS[type], enabled: true, duration });
      draw();
    }
  });
});

function move(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.sequence.length) return;
  const [item] = state.sequence.splice(index, 1);
  state.sequence.splice(target, 0, item);
  draw();
}

function draw() {
  const list = $('#sequence');
  if (!state.sequence.length) {
    list.replaceChildren(el('p', { class: 'card-note', text: 'No blocks. Add one, or restore the default order.' }));
  } else {
    list.replaceChildren(...state.sequence.map((segment, index) => {
      const durationInput = el('input', {
        type: 'number', min: '10', max: '1800', value: String(segment.duration || 120),
        style: 'width:92px', disabled: segment.type === 'videos',
        onChange: event => { segment.duration = Number(event.target.value) || 120; drawCycle(); }
      });
      return el('div', { class: `list-item${segment.enabled === false ? ' disabled' : ''}` }, [
        el('div', { class: 'drag-handle', html: icon('grip') }),
        el('div', { class: 'list-main' }, [
          el('div', { class: 'list-title', text: segment.label || LABELS[segment.type] || segment.type }),
          el('div', { class: 'list-sub', text: BLURB[segment.type] || '' }),
          el('div', { class: 'list-tools' }, [
            el('span', { class: 'card-note', style: 'margin:0', text: segment.type === 'videos' ? 'Plays every enabled clip' : 'Seconds on screen' }),
            durationInput,
            el('button', { class: 'btn btn-sm', type: 'button', text: segment.enabled === false ? 'Turn on' : 'Turn off', onClick: () => { segment.enabled = segment.enabled === false; draw(); } }),
            el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Remove', onClick: () => { state.sequence.splice(index, 1); draw(); } })
          ])
        ]),
        el('div', { class: 'list-side', style: 'flex-direction:column;gap:5px' }, [
          el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Move up', html: icon('up'), disabled: index === 0, onClick: () => move(index, -1) }),
          el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Move down', html: icon('down'), disabled: index === state.sequence.length - 1, onClick: () => move(index, 1) })
        ])
      ]);
    }));
  }
  drawCycle();

  $('#exam-state').replaceChildren(el('div', {
    class: `alert ${settings.videoOnlyMode ? 'alert-warn' : 'alert-info'}`,
    html: `${icon('alert')}<div>Exam mode is currently <strong>${settings.videoOnlyMode ? 'ON' : 'off'}</strong>.
      ${settings.videoOnlyMode ? 'Only videos are playing.' : 'The arrangement below is in charge.'}</div>`
  }));
}

function drawCycle() {
  const active = state.sequence.filter(segment => segment.enabled !== false);
  const total = active.reduce((sum, segment) => sum + (segment.type === 'videos' ? 0 : Number(segment.duration) || 0), 0);
  const steps = el('div', { class: 'list' });
  if (!active.length) {
    steps.append(el('p', { class: 'card-note', text: 'Every block is off, so the display falls back to the timetable alone.' }));
  }
  active.forEach((segment, index) => {
    steps.append(el('div', { class: 'list-item', style: 'padding:11px 13px' }, [
      el('div', { class: 'avatar', text: String(index + 1) }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: segment.label || LABELS[segment.type] }),
        el('div', { class: 'list-sub', text: segment.type === 'videos'
          ? (videoCount ? `${videoCount} clip(s), each played to the end` : 'No clips enabled — this block is skipped')
          : `${segment.duration || 120} seconds` })
      ])
    ]));
  });
  steps.append(el('p', { class: 'card-note', style: 'margin-top:4px', text: `Then back to block 1. Timetable blocks add up to ${Math.round(total / 60 * 10) / 10} minutes per cycle, plus however long the videos run.` }));
  $('#cycle-preview').replaceChildren(steps);
}
