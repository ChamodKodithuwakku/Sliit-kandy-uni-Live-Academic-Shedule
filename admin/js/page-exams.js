import { mountShell, previewButton } from './shell.js';
import { watch, create, update, remove, COLLECTIONS } from './store.js';
import { $, el, icon, banner, toast, modal, field, checkbox, readForm, confirmDialog } from './ui.js';
import { errorText } from './firebase.js';
import {
  EMPTY_EXAM, cleanExam, validateExam, compareExams, formatRange, formatDateLong, dateKey, weekdayOf
} from '../../js/schema.js';

await mountShell('exams');

const addButton = el('button', { class: 'btn btn-primary btn-wide', type: 'button', html: `${icon('plus')}<span>Add Exam Sitting</span>` });
$('#head-actions').append(previewButton(), addButton);
addButton.addEventListener('click', () => openEditor(null));

const todayKey = dateKey();
let exams = [];
$('#filter-scope').addEventListener('change', draw);
$('#search').addEventListener('input', draw);

try {
  await watch(COLLECTIONS.exams, data => { exams = data; draw(); }, error => banner($('#alerts'), errorText(error)));
} catch (error) {
  banner($('#alerts'), errorText(error));
}

function draw() {
  const scope = $('#filter-scope').value;
  const term = $('#search').value.trim().toLowerCase();
  const list = exams
    .filter(exam => scope === 'all' || (scope === 'past' ? String(exam.date) < todayKey : String(exam.date) >= todayKey))
    .filter(exam => !term || [exam.moduleName, exam.moduleCode, exam.room, exam.lecturer, exam.intake]
      .some(value => String(value || '').toLowerCase().includes(term)))
    .sort(compareExams);

  $('#count').innerHTML = `<strong>${exams.length}</strong> exam sittings${list.length !== exams.length ? ` · ${list.length} shown` : ''}`;

  const body = $('#rows');
  if (!list.length) {
    body.replaceChildren(el('tr', { class: 'empty-row' }, [
      el('td', { colspan: '7', text: exams.length ? 'Nothing matches this filter.' : 'No exams scheduled yet.' })
    ]));
    return;
  }
  body.replaceChildren(...list.map(exam => {
    const hidden = exam.visible === false;
    const past = String(exam.date) < todayKey;
    return el('tr', { style: hidden || past ? 'opacity:.62' : null }, [
      el('td', { class: 'nowrap' }, [
        el('span', { class: 'primary', text: formatDateLong(exam.date) }),
        el('span', { class: 'sub', text: weekdayOf(exam.date) })
      ]),
      el('td', { class: 'nowrap', text: formatRange(exam.startTime, exam.endTime) }),
      el('td', {}, [
        el('span', { class: 'primary', text: exam.moduleName || exam.moduleCode || '—' }),
        el('span', { class: 'sub', text: [exam.moduleCode, exam.intake].filter(Boolean).join(' · ') })
      ]),
      el('td', { text: exam.room || '—' }),
      el('td', { text: exam.lecturer || '—' }),
      el('td', {}, [el('span', {
        class: `chip ${hidden ? 'chip-grey' : past ? 'chip-grey' : 'chip-amber'}`,
        text: hidden ? 'Hidden' : past ? 'Finished' : 'Scheduled'
      })]),
      el('td', {}, [el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Edit', onClick: () => openEditor(exam) }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: hidden ? 'Show' : 'Hide',
          onClick: async event => {
            event.currentTarget.disabled = true;
            try { await update(COLLECTIONS.exams, exam.id, { visible: hidden }); toast(hidden ? 'Exam is back on the display.' : 'Exam hidden.'); }
            catch (error) { toast(errorText(error), 'err'); event.currentTarget.disabled = false; }
          }
        }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Delete this exam?',
              message: `${exam.moduleName || exam.moduleCode || 'This sitting'} on ${formatDateLong(exam.date)} will be removed. This cannot be undone.`
            });
            if (!ok) return;
            try { await remove(COLLECTIONS.exams, exam.id); toast('Exam deleted.'); }
            catch (error) { toast(errorText(error), 'err'); }
          }
        })
      ])])
    ]);
  }));
}

function openEditor(exam) {
  const value = { ...EMPTY_EXAM, date: todayKey, ...(exam || {}) };
  let errorBox;
  return modal({
    title: exam ? 'Edit exam sitting' : 'Add exam sitting',
    note: 'Exams show on the display only on their own date.',
    confirmLabel: exam ? 'Save changes' : 'Add exam',
    build: body => {
      errorBox = el('div');
      const date = field({ label: 'Date', name: 'date', type: 'date', value: value.date });
      const start = field({ label: 'Start time', name: 'startTime', type: 'time', value: value.startTime });
      const end = field({ label: 'End time', name: 'endTime', type: 'time', value: value.endTime });
      const code = field({ label: 'Module code', name: 'moduleCode', value: value.moduleCode, placeholder: 'IT1010' });
      const name = field({ label: 'Subject', name: 'moduleName', value: value.moduleName, placeholder: 'Programming Fundamentals' });
      const intake = field({ label: 'Batch / group', name: 'intake', value: value.intake, placeholder: 'Foundation Y1S1 June/2026' });
      const room = field({ label: 'Exam venue', name: 'room', value: value.room, placeholder: 'C303' });
      const lecturer = field({ label: 'Invigilator', name: 'lecturer', value: value.lecturer, placeholder: 'Ms. Koswatte' });
      const visible = checkbox({ label: 'Show on the TV display', name: 'visible', checked: value.visible !== false });

      body.append(
        errorBox,
        el('div', { class: 'field-row' }, [date.wrap, start.wrap, end.wrap]),
        el('div', { class: 'field-row' }, [code.wrap, name.wrap]),
        intake.wrap,
        el('div', { class: 'field-row' }, [room.wrap, lecturer.wrap]),
        visible.wrap
      );
    },
    onConfirm: async body => {
      const clean = cleanExam(readForm(body));
      const errors = validateExam(clean);
      if (errors.length) { banner(errorBox, errors); return false; }
      try {
        if (exam) { await update(COLLECTIONS.exams, exam.id, clean); toast('Exam updated.'); }
        else { await create(COLLECTIONS.exams, clean); toast('Exam added.'); }
      } catch (error) { banner(errorBox, errorText(error)); return false; }
    }
  });
}
